import { NextResponse } from "next/server"
import {
  DocumentReference,
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// TARGET PENJUALAN — TARGET BULANAN PER EMPLOYEE PER JENIS
//
// Target bersifat: Store + Employee + Bulan (periode YYYY-MM)
// + Jenis target. Target disimpan TERPISAH dari transaksi
// realisasi.
//
// Tiga jenis target yang didukung:
//   - ADDITIONAL SELLING          -> satuan RUPIAH  (targetNominal)
//   - UPSIZE BOTOL                -> satuan PCS     (targetPcs)
//   - SELLING EKSKLUSIF PERFUME   -> satuan PCS     (targetPcs)
//
// Ukuran botol (55 ML / 100 ML) dan produk parfum (PAX /
// FEEL BETTER / LAINNYA) adalah DETAIL TRANSAKSI, bukan dimensi
// target. Karena itu satu karyawan hanya memiliki SATU target
// Upsize Botol (total PCS) dan SATU target Selling Eksklusif
// (total PCS) per periode.
//
// POST (khusus STORE) — upsert massal target untuk satu periode:
//   - Bila target (employee + periode + jenis) sudah ada -> EDIT
//     (perbarui nilai); tidak membuat duplikasi.
//   - Bila belum ada -> buat.
//
// ID dokumen DETERMINISTIK:
//   <storeId>_<employeeId>_<periode>_<JENIS>
// sehingga duplikasi target dapat dicegah tanpa kueri composite
// dan tanpa perubahan firestore.indexes.json.
//
// KOMPATIBILITAS DATA LAMA (tanpa migration / tanpa backfill):
//   Dokumen target lama memakai id <storeId>_<employeeId>_<periode>
//   dan tidak memiliki field "jenis". Dokumen tersebut dibaca
//   sebagai ADDITIONAL SELLING. Saat Store menyimpan ulang target
//   ADDITIONAL SELLING, api lebih dulu mencari dokumen canonical
//   ber-suffix jenis; bila belum ada dan dokumen lama ADA, dokumen
//   LAMA-lah yang diperbarui (hanya satu dokumen, bukan penulisan
//   massal) sehingga tidak pernah tercipta dua target aktif untuk
//   jenis yang sama pada periode yang sama.
//
// Central tidak dapat mengubah target. Nilai dari client
// (storeId/cabangId/employeeName/createdBy) TIDAK dipercaya —
// semua diambil dari akun dan database.
// ============================================================

const TARGET_JENIS = [
  "ADDITIONAL_SELLING",
  "UPSIZE_BOTOL",
  "SELLING_EKSKLUSIF_PERFUME",
] as const

type TargetJenis = (typeof TARGET_JENIS)[number]

// Batas atas nilai target mengikuti validasi yang sudah ada pada
// modul ini (nominal), agar tidak memperkenalkan batas angka baru.
const TARGET_MAX = 1_000_000_000_000

function isTargetJenis(
  value: unknown,
): value is TargetJenis {
  return TARGET_JENIS.includes(value as TargetJenis)
}

type TargetUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
}

// ============================================================
// AUTH
// ============================================================

async function getAuthenticatedUser(
  request: Request,
): Promise<TargetUser> {
  const authorization =
    request.headers.get("authorization")

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new Error("AUTH_REQUIRED")
  }

  const idToken = authorization.substring(7)

  const decodedToken =
    await adminAuth.verifyIdToken(idToken)

  const uid = decodedToken.uid

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data = userSnapshot.data() ?? {}

  const role = String(data?.role ?? "").trim()
  const storeId = String(data?.storeId ?? "").trim()
  const cabangId = String(data?.cabangId ?? "").trim()
  const aktif = data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return {
    uid,
    role,
    storeId,
    cabangId,
  }
}

// ============================================================
// HELPERS
// ============================================================

function cleanString(
  value: unknown,
  max = 500,
): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().slice(0, max)
}

function isValidPeriode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value)
  )
}

// Karakter yang aman sebagai Firestore document id.
function sanitizeDocId(value: string): string {
  return value.replace(/[^\w.\-]/g, "_")
}

// Menentukan dokumen target yang harus ditulis untuk satu jenis.
//
// Urutan:
//   1. Dokumen canonical "<docKey>_<JENIS>". Bila ada -> edit.
//   2. Untuk ADDITIONAL_SELLING saja: dokumen lama "<docKey>"
//      (tanpa suffix jenis). Bila ada -> edit dokumen itu, bukan
//      membuat dokumen baru, sehingga tidak pernah ada dua target
//      aktif untuk jenis yang sama pada periode yang sama.
//   3. Selain itu -> tulis dokumen canonical baru.
//
// Tidak ada penulisan massal: hanya dokumen milik karyawan yang
// sedang disimpan yang disentuh.
async function resolveTargetDocRef(
  docKey: string,
  jenis: TargetJenis,
): Promise<{
  ref: DocumentReference
  exists: boolean
}> {
  const canonical = adminDb
    .collection("additional_selling_targets")
    .doc(`${docKey}_${jenis}`)

  const canonicalSnapshot = await canonical.get()

  if (canonicalSnapshot.exists) {
    return { ref: canonical, exists: true }
  }

  if (jenis === "ADDITIONAL_SELLING") {
    const legacy = adminDb
      .collection("additional_selling_targets")
      .doc(docKey)

    const legacySnapshot = await legacy.get()

    if (legacySnapshot.exists) {
      return { ref: legacy, exists: true }
    }
  }

  return { ref: canonical, exists: false }
}

// Mengumpulkan SEMUA dokumen target milik satu employee + periode
// yang benar-benar ADA di database, untuk dihapus sebagai satu
// paket.
//
// Untuk ADDITIONAL SELLING dokumen canonical DAN dokumen legacy
// (id tanpa suffix jenis) sama-sama dikumpulkan bila keduanya
// ada, sehingga tidak ada target yatim setelah paket dihapus.
//
// Hanya dokumen yang sudah ada yang dikembalikan: tidak ada
// dokumen yang dibuat.
async function collectExistingTargetRefs(
  docKey: string,
): Promise<DocumentReference[]> {
  const collection = adminDb.collection(
    "additional_selling_targets",
  )

  const refs: DocumentReference[] = []
  const seen = new Set<string>()

  for (const jenis of TARGET_JENIS) {
    const canonical = collection.doc(
      `${docKey}_${jenis}`,
    )

    if (seen.has(canonical.id)) {
      continue
    }

    const snapshot = await canonical.get()

    if (snapshot.exists) {
      seen.add(canonical.id)
      refs.push(canonical)
    }
  }

  // Target Additional Selling lama memakai id tanpa suffix jenis.
  const legacy = collection.doc(docKey)

  if (!seen.has(legacy.id)) {
    const legacySnapshot = await legacy.get()

    if (legacySnapshot.exists) {
      seen.add(legacy.id)
      refs.push(legacy)
    }
  }

  return refs
}

function toTargetUpserts(
  body: Record<string, unknown>,
):
  | { periode: string; items: { employeeId: string; jenis: TargetJenis; nilaiTarget: number }[] }
  | { error: string } {
  const periode = cleanString(body?.periode, 20)

  if (!isValidPeriode(periode)) {
    return { error: "Periode tidak valid." }
  }

  const rawItems = body?.targets

  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0
  ) {
    return { error: "Target tidak boleh kosong." }
  }

  if (rawItems.length > 500) {
    return { error: "Terlalu banyak target dalam satu penyimpanan." }
  }

  const items: {
    employeeId: string
    jenis: TargetJenis
    nilaiTarget: number
  }[] = []

  for (const rawItem of rawItems) {
    const item =
      rawItem && typeof rawItem === "object"
        ? (rawItem as Record<string, unknown>)
        : null

    if (!item) {
      return { error: "Data target tidak valid." }
    }

    const employeeId = cleanString(item?.employeeId, 200)

    if (!employeeId) {
      return { error: "Employee tidak valid." }
    }

    // "jenis" tidak diberikan berarti data lama (semua target
    // lama adalah Additional Selling) dan diperlakukan demikian.
    const rawJenis = item?.jenis

    let jenis: TargetJenis

    if (
      rawJenis === undefined ||
      rawJenis === null ||
      rawJenis === ""
    ) {
      jenis = "ADDITIONAL_SELLING"
    } else {
      const candidate = cleanString(
        rawJenis,
        40,
      ).toUpperCase()

      if (!isTargetJenis(candidate)) {
        return { error: "Jenis target tidak valid." }
      }

      jenis = candidate
    }

    const targetValue = Number(item?.nilaiTarget)

    if (
      !Number.isFinite(targetValue) ||
      !Number.isInteger(targetValue) ||
      targetValue < 0 ||
      targetValue >= TARGET_MAX
    ) {
      return {
        error:
          jenis === "ADDITIONAL_SELLING"
            ? "Nilai target harus berupa bilangan bulat Rupiah yang valid."
            : "Nilai target harus berupa bilangan bulat PCS yang valid.",
      }
    }

    items.push({ employeeId, jenis, nilaiTarget: targetValue })
  }

  // Invarian paket: setiap employee harus mengirim KETIGA jenis
  // target. Ini menutup celah "target parsial" even bila client
  // someday mengirim hanya sebagian jenis.
  const byEmployee = new Map<string, Set<TargetJenis>>()

  for (const item of items) {
    let seen = byEmployee.get(item.employeeId)

    if (!seen) {
      seen = new Set<TargetJenis>()
      byEmployee.set(item.employeeId, seen)
    }

    seen.add(item.jenis)
  }

  for (const [employeeId, seen] of byEmployee) {
    if (seen.size !== TARGET_JENIS.length) {
      return {
        error:
          `Target untuk employee ${employeeId} harus lengkap 3 jenis ` +
          "(Additional Selling, Upsize Botol, Selling Eksklusif Perfume). " +
          "Target tidak boleh disimpan sebagian.",
      }
    }
  }

  return { periode, items }
}

// ============================================================
// POST — UPSERT TARGET (khusus STORE)
// ============================================================

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mengatur target penjualan.",
        },
        { status: 403 },
      )
    }

    const storeId = user.storeId
    const cabangId = user.cabangId

    if (!storeId || !cabangId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Store belum memiliki data toko/cabang yang valid.",
        },
        { status: 403 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const parsed = toTargetUpserts(body)

    if ("error" in parsed) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error,
        },
        { status: 400 },
      )
    }

    // Validate employee: harus milik Store login. Apabila satu
    // employee tidak valid, seluruh request ditolak (atomik).
    const employeePayloads: {
      employeeId: string
      employeeName: string
      jenis: TargetJenis
      nilaiTarget: number
    }[] = []

    for (const item of parsed.items) {
      const snapshot = await adminDb
        .collection("employees")
        .doc(item.employeeId)
        .get()

      if (!snapshot.exists) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Employee tidak ditemukan di database.",
          },
          { status: 400 },
        )
      }

      const data = snapshot.data() ?? {}

      if (cleanString(data?.storeId, 100) !== storeId) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Anda hanya dapat mengatur target untuk employee pada toko Anda.",
          },
          { status: 403 },
        )
      }

      employeePayloads.push({
        employeeId: item.employeeId,
        employeeName: cleanString(
          data?.name ?? data?.nama ?? "-",
          150,
        ),
        jenis: item.jenis,
        nilaiTarget: item.nilaiTarget,
      })
    }

    const docBase = sanitizeDocId(storeId)
    const periode = parsed.periode

    for (const payload of employeePayloads) {
      const docKey =
        `${docBase}_${sanitizeDocId(payload.employeeId)}_${periode}`

      const docRef =
        await resolveTargetDocRef(
          docKey,
          payload.jenis,
        )

      // Nominal hanya untuk Additional Selling; PCS disimpan di
      // field terpisah agar satuan tidak tertukar.
      const nilaiField =
        payload.jenis === "ADDITIONAL_SELLING"
          ? { targetNominal: payload.nilaiTarget }
          : { targetPcs: payload.nilaiTarget }

      if (docRef.exists) {
        // EDIT target existing — jangan membuat duplikasi.
        await docRef.ref.update({
          employeeName: payload.employeeName,
          jenis: payload.jenis,
          ...nilaiField,
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        await docRef.ref.set({
          storeId,
          cabangId,
          employeeId: payload.employeeId,
          employeeName: payload.employeeName,
          periode,
          jenis: payload.jenis,
          ...nilaiField,
          createdBy: { uid: user.uid },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }

    return NextResponse.json({
      success: true,
      periode,
      processed: employeePayloads.length,
      message:
        "Target berhasil disimpan.",
    })
  } catch (error) {
    const code =
      error instanceof Error && error.message
        ? error.message
        : ""

    if (code === "AUTH_REQUIRED") {
      return NextResponse.json(
        {
          success: false,
          message: "Anda harus login terlebih dahulu.",
        },
        { status: 401 },
      )
    }

    if (
      code === "FORBIDDEN" ||
      code === "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Akses ditolak.",
        },
        { status: 403 },
      )
    }

    console.error(
      "Gagal menyimpan target penjualan:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          "Target gagal disimpan. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }
}

// ============================================================
// DELETE — MENGHAPUS PAKET TARGET (khusus STORE)
//
// Target dihapus sebagai SATU PAKET per employee + periode:
//   - ADDITIONAL SELLING (canonical + legacy bila ada)
//   - UPSIZE BOTOL
//   - SELLING EKSKLUSIF PERFUME
//
// Collection "additional_selling" (transaksi/realisasi) TIDAK
// pernah disentuh. Realisasi tetap tersimpan sehingga achievement
// kembali terhitung bila target dibuat ulang.
//
// Central tidak dapat menghapus target.
// ============================================================

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat menghapus target penjualan.",
        },
        { status: 403 },
      )
    }

    const storeId = user.storeId
    const cabangId = user.cabangId

    if (!storeId || !cabangId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Store belum memiliki data toko/cabang yang valid.",
        },
        { status: 403 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const periode = cleanString(body?.periode, 20)
    const employeeId = cleanString(
      body?.employeeId,
      200,
    )

    if (!isValidPeriode(periode) || !employeeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data target yang akan dihapus tidak valid.",
        },
        { status: 400 },
      )
    }

    // Ownership employee: harus milik Store login. storeId
    // SELALU berasal dari akun, tidak pernah dari body.
    const employeeSnapshot = await adminDb
      .collection("employees")
      .doc(employeeId)
      .get()

    if (!employeeSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee tidak ditemukan di database.",
        },
        { status: 400 },
      )
    }

    const employeeData =
      employeeSnapshot.data() ?? {}

    if (cleanString(employeeData?.storeId, 100) !== storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat menghapus target untuk employee pada toko Anda.",
        },
        { status: 403 },
      )
    }

    const docKey =
      `${sanitizeDocId(storeId)}_${sanitizeDocId(employeeId)}_${periode}`

    const refs = await collectExistingTargetRefs(docKey)

    if (refs.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        message:
          "Target tidak ditemukan untuk employee dan periode ini.",
      })
    }

    // Hanya dokumen yang benar-benar ada yang dihapus, dalam
    // satu batch agar paket tidak terhapus sebagian.
    const batch = adminDb.batch()

    for (const ref of refs) {
      batch.delete(ref)
    }

    await batch.commit()

    return NextResponse.json({
      success: true,
      deleted: refs.length,
      message:
        "Target berhasil dihapus. Realisasi penjualan tidak terpengaruh.",
    })
  } catch (error) {
    const code =
      error instanceof Error && error.message
        ? error.message
        : ""

    if (code === "AUTH_REQUIRED") {
      return NextResponse.json(
        {
          success: false,
          message: "Anda harus login terlebih dahulu.",
        },
        { status: 401 },
      )
    }

    if (
      code === "FORBIDDEN" ||
      code === "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Akses ditolak.",
        },
        { status: 403 },
      )
    }

    console.error(
      "Gagal menghapus target penjualan:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          "Target gagal dihapus. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }
}