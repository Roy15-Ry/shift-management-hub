import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import {
  KontribusiOmsetTargetRow,
  getKontribusiOmsetTargetId,
  getKontribusiOmsetTargetIdPerEmployee,
} from "@/lib/kontribusi-omset/types"
import { currentPeriode } from "@/lib/kontribusi-omset/periode"

// ============================================================
// TARGET OMSET — Fondasi (Tahap 1)
//
// Koleksi:
//   kontribusi_omset_targets          -> 1 dokumen per toko per periode.
//     DocId deterministik:            <storeId>__<YYYY-MM>
//   kontribusi_omset_target_history   -> 1 dokumen BARU per perubahan
//     (append-only; tidak pernah menimpa catatan sebelumnya).
//
// Keputusan bisnis yang ditaut di kode:
//   - POST = upsert (create-atau-update) oleh ketiga role dalam
//     cakupannya (STORE = tokonya sendiri via profil).
//     (central_pusat / central_cabang). Store hanya boleh GET.
//   - Periode lampau ditolak; bulan berjalan & bulan mendatang
//     diizinkan.
//   - Alasan perubahan wajib >= 10 karakter setelah trim.
//   - Target dan realisasi terpisah: endpoint ini TIDAK membaca
//     ataupun menulis kontribusi_omset_reports.
//   - Pola scope/peran GET dicerminkan dari
//     app/api/kontribusi-omset/reports/route.ts supaya perilaku
//     baca target sama dengan halaman Kontribusi Omset.
//   - Dibedakan: "target belum tersedia" vs "target bernilai 0".
//
// Tidak ada DELETE. Target yang sudah ada tidak boleh dihapus
// melalui API normal pada tahap ini.
// ============================================================

const TARGET_COLLECTION = "kontribusi_omset_targets"
const HISTORY_COLLECTION =
  "kontribusi_omset_target_history"

const MAX_TARGET = 1_000_000_000_000

type TargetUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
  nama: string
}

type TargetStoreScope = {
  storeIds: string[]
  invalidStore?: boolean
}

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

  const idToken =
    authorization.substring(7)

  const decodedToken =
    await adminAuth.verifyIdToken(idToken)

  const uid =
    decodedToken.uid

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data =
    userSnapshot.data() ?? {}

  const role =
    String(data?.role ?? "").trim()

  const storeId =
    String(data?.storeId ?? "").trim()

  const cabangId =
    String(data?.cabangId ?? "").trim()

  const nama =
    String(
      data?.nama ?? data?.email ?? "",
    ).trim()

  const aktif =
    data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return {
    uid,
    role,
    storeId,
    cabangId,
    nama,
  }
}

function normalize(
  value: unknown,
): string {
  return String(value ?? "").trim().toUpperCase()
}

function cleanString(
  value: unknown,
  max = 500,
): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().slice(0, max)
}

function pad2(
  value: number,
): string {
  return String(value).padStart(2, "0")
}

// Pola sama dengan reports/route.ts: bulan dari UI 0-11,
// keluaran periode lokal "YYYY-MM".
function buildPeriode(
  year: number,
  month: number,
): string {
  return `${year}-${pad2(month + 1)}`
}

// Periode berjalan versi SERVER memakai zona waktu EKSPLISIT
// Asia/Jakarta (WIB, UTC+7) dan FAIL-CLOSED; implementasinya di
// lib/kontribusi-omset/periode.ts (dapat diuji terisolasi tanpa
// menulis data) dan diimpor di atas.

function isValidPeriode(
  value: unknown,
): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}$/.test(value)
  ) {
    return false
  }

  const month = Number(
    value.slice(5, 7),
  )

  return month >= 1 && month <= 12
}

function parseTargetBulanan(
  value: unknown,
): number | null {
  // null/"" tidak boleh diam-diam menjadi 0 (Number(null) = 0):
  // nominal wajib eksplisit.
  if (value === null || value === "") {
    return null
  }

  const num = Number(value)

  if (
    !Number.isFinite(num) ||
    num < 0 ||
    num >= MAX_TARGET
  ) {
    return null
  }

  return num
}

// Identik dengan resolveStoreIds pada reports/route.ts agar GET
// target dan GET laporan selalu sejalu. "store" -> toko sendiri;
// "central_pusat" -> wajib memilih satu cabang (menolak ALL);
// selain itu -> toko aktif dari cabang profil. storeParam hanya
// mempersempit ke satu toko dalam scope.
async function resolveStoreIds(
  user: TargetUser,
  cabangParam: string,
  storeParam: string = "",
): Promise<TargetStoreScope> {
  const role =
    user.role.toLowerCase()

  if (role === "store") {
    const storeId =
      user.storeId

    if (!storeId) {
      return {
        storeIds: [],
        invalidStore: true,
      }
    }

    return {
      storeIds: [storeId],
    }
  }

  let cabangId =
    user.cabangId

  if (role === "central_pusat") {
    cabangId =
      normalize(cabangParam)

    if (
      !cabangId ||
      cabangId === "ALL" ||
      cabangId === "__ALL__"
    ) {
      return {
        storeIds: [],
        invalidStore: true,
      }
    }
  }

  if (!cabangId) {
    return {
      storeIds: [],
      invalidStore: true,
    }
  }

  const snapshot =
    await adminDb
      .collection("stores")
      .where("cabangId", "==", cabangId)
      .get()

  const storeIds: string[] = []

  snapshot.docs.forEach(
    (doc) => {
      const data =
        doc.data() ?? {}

      const storeId =
        String(
          data?.storeId ?? doc.id ?? "",
        ).trim()

      if (!storeId) {
        return
      }

      if (
        normalize(data?.cabangId) !==
        cabangId
      ) {
        return
      }

      if (data?.aktif === false) {
        return
      }

      if (
        !storeIds.includes(storeId)
      ) {
        storeIds.push(storeId)
      }
    },
  )

  if (storeParam) {
    const normalizedStoreParam =
      normalize(storeParam)

    if (
      !storeIds.includes(
        normalizedStoreParam,
      )
    ) {
      return {
        storeIds: [],
        invalidStore: true,
      }
    }

    return {
      storeIds: [
        normalizedStoreParam,
      ],
    }
  }

  return {
    storeIds,
    invalidStore: false,
  }
}

// Data toko dipakai untuk validasi scope saat POST. storeId
// adalah document id pada koleksi stores (pola yang juga dipakai
// app/api/admin/employees/route.ts canAccessStore).
async function getStoreDoc(
  storeId: string,
): Promise<{
  cabangId: string
} | null> {
  const snapshot =
    await adminDb
      .collection("stores")
      .doc(storeId)
      .get()

  if (!snapshot.exists) {
    return null
  }

  const data =
    snapshot.data() ?? {}

  if (data?.aktif === false) {
    return null
  }

  return {
    cabangId:
      normalize(data?.cabangId),
  }
}

function toTargetRow(
  docId: string,
  storeId: string,
  periode: string,
  data: Record<string, unknown>,
  cabangFallback: string,
): KontribusiOmsetTargetRow {
  const rawUpdatedAt =
    data?.updatedAt

  const updatedAt =
    typeof rawUpdatedAt === "string"
      ? rawUpdatedAt
      : rawUpdatedAt &&
          typeof (rawUpdatedAt as Record<string, unknown>).toDate === "function"
        ? (rawUpdatedAt as unknown as { toDate: () => Date }).toDate().toISOString()
        : null

  const targetBulanan =
    parseTargetBulanan(
      data?.targetBulanan,
    )

  const employeeCountSnapshot =
    data?.employeeCountSnapshot === null ||
    data?.employeeCountSnapshot === undefined
      ? null
      : Number(data?.employeeCountSnapshot)

  return {
    targetId: docId,
    storeId:
      cleanString(
        data?.storeId,
        100,
      ) || storeId,
    cabangId:
      cleanString(
        data?.cabangId,
        100,
      ) || cabangFallback,
    periode:
      cleanString(
        data?.periode,
        20,
      ) || periode,
    employeeId:
      cleanString(
        data?.employeeId,
        200,
      ),
    targetTersedia:
      targetBulanan !== null,
    targetBulanan:
      targetBulanan,
    employeeCountSnapshot:
      employeeCountSnapshot,
    updatedBy:
      cleanString(
        data?.updatedBy,
        150,
      ),
    updatedAt,
  }
}

// ============================================================
// GET
//
// Kontrak UI halaman Kontribusi Omset: hanya central_pusat yang
// mengirim parameter "cabang" (dan opsional "store");
// central_cabang mengandalkan cabangId profil; store tidak
// mengirim parameter apa pun.
// ============================================================

export async function GET(
  request: Request,
) {
  try {
    const user =
      await getAuthenticatedUser(
        request,
      )

    const url =
      new URL(request.url)

    const year =
      Number(url.searchParams.get("year") ?? "")

    const month =
      Number(url.searchParams.get("month") ?? "")

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 0 ||
      month > 11
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Periode tidak valid.",
        },
        { status: 400 },
      )
    }

    const periode =
      buildPeriode(year, month)

    const storeParam =
      cleanString(
        url.searchParams.get("store") ?? "",
        100,
      )

    const cabangParam =
      cleanString(
        url.searchParams.get("cabang") ?? "",
        100,
      )

    const employeeIdParam =
      cleanString(
        url.searchParams.get("employeeId") ?? "",
        200,
      )

    const scope =
      await resolveStoreIds(
        user,
        user.role.toLowerCase() === "central_pusat"
          ? cabangParam
          : "",
        user.role.toLowerCase() === "central_pusat"
          ? storeParam
          : "",
      )

    if (scope.invalidStore) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Cabang/toko yang dipilih tidak berada dalam cakupan akun Anda.",
        },
        { status: 403 },
      )
    }

    if (
      storeParam &&
      !scope.storeIds.includes(storeParam)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko yang dipilih tidak berada dalam cakupan akun Anda.",
        },
        { status: 403 },
      )
    }

    const targetStoreIds =
      storeParam
        ? [storeParam]
        : scope.storeIds

    const targets: KontribusiOmsetTargetRow[] =
      []

    for (
      const storeId of targetStoreIds
    ) {
      const targetId =
        employeeIdParam
          ? getKontribusiOmsetTargetIdPerEmployee(
              storeId,
              periode,
              employeeIdParam,
            )
          : getKontribusiOmsetTargetId(
              storeId,
              periode,
            )

      const docSnapshot =
        await adminDb
          .collection(TARGET_COLLECTION)
          .doc(targetId)
          .get()

      if (!docSnapshot.exists) {
        // Target belum pernah dibuat -> berbeda dari target 0.
        targets.push(
          {
            targetId: "",
            storeId,
            cabangId:
              cleanString(
                user.cabangId,
                100,
              ),
            periode,
            employeeId: employeeIdParam,
            targetTersedia: false,
            targetBulanan: null,
            employeeCountSnapshot: null,
            updatedBy: "",
            updatedAt: null,
          },
        )
        continue
      }

      targets.push(
        toTargetRow(
          docSnapshot.id,
          storeId,
          periode,
          docSnapshot.data() ?? {},
          cleanString(
            user.cabangId,
            100,
          ),
        ),
      )
    }

    return NextResponse.json(
      {
        success: true,
        periode,
        year,
        month,
        targets,
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// POST — UPSERT TARGET (STORE: tokonya sendiri; CENTRAL: dalam
// cakupannya; semua lewat profil terautentikasi)
//
// Anti-duplikat menempel pada ID deterministik; keduanya kasus
// "belum ada" (pembuatan awal, sebelum = null) dan "sudah ada"
// (perubahan, sebelum = nilai lama) ditulis dalam SATU transaksi
// Firestore bersama catatan riwayat, sehingga tidak mungkin ada
// perubahan target tanpa catatan riwayat.
// ============================================================

export async function POST(
  request: Request,
) {
  try {
    const user =
      await getAuthenticatedUser(
        request,
      )

    const role =
      user.role.toLowerCase()

    // Otorisasi role: ketiga peran menetapkan target dalam
    // cakupannya (keputusan hak akses final). STORE mengelola
    // tokonya sendiri; Central Cabang mengelola tokonya cabang;
    // Central Pusat mengelola toko yang dipilih.
    if (
      role !== "central_pusat" &&
      role !== "central_cabang" &&
      role !== "store"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Role akun tidak memiliki kewenangan menetapkan target omset.",
        },
        { status: 403 },
      )
    }

    let body:
      Record<string, unknown>

    try {
      body =
        (await request.json()) as Record<
          string,
          unknown
        >
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    // STORE: storeId SELALU dari profil terautentikasi — storeId
    // pada body diabaikan sehingga manipulasi request tidak dapat
    // memaksa penulisan target toko lain.
    const storeId =
      role === "store"
        ? user.storeId
        : normalize(body?.storeId)

    // employeeId: identitas karyawan yang akan ditetapkan targetnya.
    // Jika tidak disediakan, target disimpan per toko (compatibilitas
    // dengan perilaku lama).
    const employeeId =
      cleanString(body?.employeeId, 200)

    const periodeRaw =
      cleanString(
        body?.periode,
        20,
      )

    if (!storeId) {
      return NextResponse.json(
        {
          success: false,
          message: "Toko wajib diisi.",
        },
        { status: 400 },
      )
    }

    if (!isValidPeriode(periodeRaw)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Periode tidak valid. Gunakan format YYYY-MM.",
        },
        { status: 400 },
      )
    }

    // Bulan berjalan & bulan mendatang boleh; bulan lampau tidak
    // (bandingkan teks YYYY-MM, konvensi lokal proyek).
    if (periodeRaw < currentPeriode()) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Target untuk periode lampau tidak dapat dibuat atau diubah.",
        },
        { status: 400 },
      )
    }

    const targetBulanan =
      parseTargetBulanan(
        body?.targetBulanan,
      )

    if (targetBulanan === null) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Target bulanan harus berupa bilangan bulat Rupiah nonnegatif yang valid.",
        },
        { status: 400 },
      )
    }

    const alasan =
      cleanString(
        body?.alasan,
        500,
      )

    const employeeCountSnapshotInput =
      body?.employeeCountSnapshot === null ||
      body?.employeeCountSnapshot === undefined
        ? null
        : Number(body?.employeeCountSnapshot)

    // Flag UI ("mode") HANYA untuk deteksi konflik; kebenaran
    // keadaan target dibaca langsung di dalam transaksi Firestore.
    const modeRaw = cleanString(body?.mode, 10).toLowerCase()
    if (modeRaw && modeRaw !== "create" && modeRaw !== "edit") {
      return NextResponse.json(
        {
          success: false,
          message: "Mode penyimpanan tidak valid.",
        },
        { status: 400 },
      )
    }
    const mode: "create" | "edit" | "" = modeRaw as
      | "create"
      | "edit"
      | ""

    // Validasi toko di server: toko harus ada dan aktif. Role
    // dan cabang SELALU dari profil terautentikasi, tidak pernah
    // dari request body.
    const store =
      await getStoreDoc(storeId)

    if (!store) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko tidak ditemukan atau sedang tidak aktif.",
        },
        { status: 400 },
      )
    }

    if (
      role === "central_cabang" &&
      store.cabangId !==
        normalize(user.cabangId)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat menetapkan target pada toko dalam cabang Anda.",
        },
        { status: 403 },
      )
    }

    const cabangId =
      store.cabangId

    const targetId =
      employeeId
        ? getKontribusiOmsetTargetIdPerEmployee(
            storeId,
            periodeRaw,
            employeeId,
          )
        : getKontribusiOmsetTargetId(storeId, periodeRaw)

    const targetRef =
      adminDb
        .collection(TARGET_COLLECTION)
        .doc(targetId)

    const created =
      await adminDb.runTransaction(
        async (tx) => {
          const docSnapshot =
            await tx.get(
              targetRef,
            )

          const historyRef =
            adminDb
              .collection(HISTORY_COLLECTION)
              .doc()

          if (docSnapshot.exists) {
            // Konflik mode: client menyatakan pembuatan tetapi
            // target ternyata sudah ada → jangan menimpa tanpa
            // validasi perubahan.
            if (mode === "create") {
              throw new Error("TARGET_CONFLICT")
            }

            const existing =
              docSnapshot.data() ?? {}

            // FAIL-CLOSED: nilai lama yang tidak valid (korup)
            // TIDAK dianggap 0 dan tidak disamarkan sebagai
            // "belum tersedia". Seluruh transaksi ditolak: tidak
            // ada update target dan tidak ada catatan histori.
            const nilaiSebelum =
              parseTargetBulanan(
                existing?.targetBulanan,
              )

            if (nilaiSebelum === null) {
              throw new Error(
                "TARGET_DATA_INVALID",
              )
            }

            tx.set(
              historyRef,
              {
                storeId,
                cabangId,
                periode: periodeRaw,
                employeeId,
                targetSebelum:
                  nilaiSebelum,
                targetSesudah:
                  targetBulanan,
                actorUid:
                  user.uid,
                actorRole:
                  user.role,
                actorNama:
                  user.nama,
                alasan,
                createdAt:
                  FieldValue.serverTimestamp(),
              },
            )

            const updateData: Record<string, unknown> = {
              targetBulanan,
              updatedBy:
                user.uid,
              updatedAt:
                FieldValue.serverTimestamp(),
            }

            if (employeeCountSnapshotInput !== null) {
              updateData.employeeCountSnapshot =
                employeeCountSnapshotInput
            }

            tx.update(
              targetRef,
              updateData as any,
            )

            return {
              created: false,
              nilaiSebelum,
            }
          }

          // Konflik mode: client menyatakan perubahan, tetapi
          // target ternyata belum pernah ada → tidak boleh jadi
          // pembuatan diam-diam tanpa konteks.
          if (mode === "edit") {
            throw new Error("TARGET_NOT_FOUND")
          }

          // Pembuatan awal: kondisi "sebelum" eksplisit null
          // (target belum tersedia sebelumnya). Alasan pada
          // pembuatan PERTAMA opsional: kosong → string kosong
          // (konsisten skema alasan ber-tipe string).
          tx.set(
            historyRef,
            {
              storeId,
              cabangId,
              periode: periodeRaw,
              employeeId,
              targetSebelum: null,
              targetSesudah:
                targetBulanan,
              actorUid:
                user.uid,
                actorRole:
                user.role,
                actorNama:
                  user.nama,
                alasan,
                createdAt:
                  FieldValue.serverTimestamp(),
            },
          )

          tx.create(
            targetRef,
            {
              storeId,
              cabangId,
              periode: periodeRaw,
              employeeId,
              targetBulanan,
              employeeCountSnapshot:
                employeeCountSnapshotInput,
              createdBy:
                user.uid,
              createdAt:
                FieldValue.serverTimestamp(),
              updatedBy:
                user.uid,
              updatedAt:
                FieldValue.serverTimestamp(),
            },
          )

          return {
            created: true,
            nilaiSebelum:
              null,
          }
        },
      )

    return NextResponse.json(
      {
        success: true,
        id: targetId,
        created: created.created,
        targetSebelum:
          created.nilaiSebelum,
        targetSesudah:
          targetBulanan,
        message: created.created
          ? "Target omset berhasil dibuat."
          : "Target omset berhasil diperbarui.",
      },
      {
        status: created.created
          ? 201
          : 200,
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

function errorResponse(
  error: unknown,
) {
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

  if (code === "TARGET_DATA_INVALID") {
    return NextResponse.json(
      {
        success: false,
        message:
          "Data target toko pada periode ini tidak dapat diproses. Hubungi administrator.",
      },
      { status: 409 },
    )
  }

  // Konflik create/edit berdasarkan keadaan NYATA di Firestore:
  // tanpa operasi tulis, client diminta memuat ulang.
  if (code === "TARGET_CONFLICT") {
    return NextResponse.json(
      {
        success: false,
        message:
          "Target sudah tersedia. Muat ulang data toko sebelum melanjutkan.",
      },
      { status: 409 },
    )
  }

  if (code === "TARGET_NOT_FOUND") {
    return NextResponse.json(
      {
        success: false,
        message:
          "Target belum tersedia. Muat ulang data toko sebelum mengubah target.",
      },
      { status: 409 },
    )
  }

  if (code === "PERIODE_UNAVAILABLE") {
    return NextResponse.json(
      {
        success: false,
        message:
          "Gagal menentukan periode saat ini. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }

  console.error(
    "Gagal memproses Target Omset:",
    error,
  )

  return NextResponse.json(
    {
      success: false,
      message:
        "Kesalahan tidak terduga. Silakan coba lagi.",
    },
    { status: 500 },
  )
}
