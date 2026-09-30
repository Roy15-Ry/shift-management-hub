import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"

// ============================================================
// MONITORING ERROR — CATATAN (REKAP / ERROR / VALID / KOSONG)
// ============================================================
//
// Catatan adalah pesan bebas dari Central (Pusat / Cabang) ke
// satu toko pada satu periode. Catatan TIDAK memengaruhi
// rekap, error, valid, kosong, atau analisis apa pun pada modul
// ini; murni informasi.
//
// PENYIMPANAN — collection "monitoring_error_notes" SAJA.
// Modul ini TIDAK PERNAH menyentuh:
//   - additional_selling_notes / additional_selling /
//     additional_selling_targets (Target Penjualan)
//   - monitoring_errors
//   - collection "notes" umum
// Tidak ada field discriminator/module karena kedua domain
// memang dipisah secara fisik.
//
// ISI DOKUMEN (field di bawah ini saja):
//   storeId, periode, isi, sumber, dibuatOlehUid,
//   dibuatOlehNama, createdAt, updatedAt
// cabangId, namaStore, module, jenis, unread, dan lastSeenAt
// SENGAJA tidak ada.
//
// SCOPE (SELALU ditentukan server dari akun + master stores):
//   STORE          -> HANYA read. storeId diambil dari
//                     users/{uid}.storeId; parameter store dari
//                     client DIABAIKAN total. Store TIDAK pernah
//                     menulis, termasuk tidak menandai "dibaca".
//   CENTRAL CABANG -> read + write. Toko yang diminta WAJIB ada
//                     di master "stores" dan cabangId-nya sama
//                     dengan cabangId akun. Toko cabang lain 403.
//   CENTRAL PUSAT  -> read + write. Toko WAJIB ada di master
//                     "stores". Tidak ada mode aggregate pada
//                     route ini: satu permintaan = satu toko +
//                     satu periode. Tidak ada parameter "ALL".
//
// sourcedari role, dibuatOlehUid, dan dibuatOlehNama SELALU
// diturunkan server dari role dan dokumen users/{uid}. Field
// tersebut TIDAK pernah dibaca dari body request.
//
// Periode immutable: hanya dibuat saat POST. PATCH/DELETE memakai
// [noteId] dan tidak menerima periode baru.
// ============================================================

const COLLECTION = "monitoring_error_notes"

// Batas atas isi mengikuti rekomendasi audit Catatan. Panjang
// diperiksa SEBELUM trim supaya payload yang kelebihan ditolak,
// bukan dipotong diam-diam.
const ISI_MAX = 2000

// Batas jumlah dokumen per (toko, periode).
const NOTES_LIMIT = 50

const CENTRAL_ROLES = ["central_cabang", "central_pusat"]

type NoteSumber = "pusat" | "cabang"

type NoteUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
  nama: string
}

// ============================================================
// AUTH
// ============================================================

async function getAuthenticatedUser(
  request: Request,
): Promise<NoteUser> {
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

  const userSnapshot = await adminDb
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
  const nama = String(
    data?.nama ?? data?.email ?? "",
  ).trim()

  const aktif = data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return { uid, role, storeId, cabangId, nama }
}

// ============================================================
// UTILITAS
// ============================================================

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
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

function isValidPeriode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
  )
}

function isCentralRole(role: string): boolean {
  return CENTRAL_ROLES.includes(role.toLowerCase())
}

function sumberForRole(role: string): NoteSumber {
  return role.toLowerCase() === "central_cabang"
    ? "cabang"
    : "pusat"
}

function isNoteSumber(value: unknown): value is NoteSumber {
  return value === "pusat" || value === "cabang"
}

// Timestamp Firestore -> ISO string, mengikuti pola serialisasi
// yang sudah dipakai API Monitoring Error.
function toIsoString(value: unknown): string | null {
  if (
    value &&
    typeof (value as { toDate?: unknown }).toDate ===
      "function"
  ) {
    try {
      return (
        value as { toDate: () => Date }
      ).toDate().toISOString()
    } catch {
      return null
    }
  }
  return null
}

// ============================================================
// RESPONSE HELPER
// ============================================================

function errorResponse(error: unknown) {
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
    "Gagal memproses Catatan Monitoring Error:",
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

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 400 },
  )
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 403 },
  )
}

function notFound(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 404 },
  )
}

// ============================================================
// MASTER STORES
// ============================================================
//
// Satu-satunya sumber kebenaran cabang sebuah toko. storeId pada
// query string TIDAK PERNAH diperlakukan sebagai bukti akses
// sebelum lolos fungsi ini. Tidak ada cache/memoization: read ini
// adalah harga authorization correctness.
async function getStoreMaster(
  storeId: string,
): Promise<{
  found: boolean
  storeId: string
  cabangId: string
}> {
  const requested = cleanString(storeId, 100)

  if (!requested) {
    return { found: false, storeId: "", cabangId: "" }
  }

  const snapshot = await adminDb
    .collection("stores")
    .where("storeId", "==", requested)
    .limit(1)
    .get()

  const doc = snapshot.docs[0]
  const data = doc?.data() ?? null

  // storeId kanonik dari master. Nilai inilah yang ditulis ke
  // dokumen catatan dan dipakai pada query, sehingga hasil
  // baca dan tulis selalu memakai satu bentuk yang sama.
  const canonicalStoreId = String(
    data?.storeId ?? doc?.id ?? "",
  ).trim()

  if (!data || !canonicalStoreId) {
    return { found: false, storeId: "", cabangId: "" }
  }

  return {
    found: true,
    storeId: canonicalStoreId,
    cabangId: normalize(data?.cabangId ?? ""),
  }
}

// ============================================================
// SCOPE RESOLUTION
// ============================================================

type ResolvedScope =
  | { storeId: string }
  | { error: NextResponse }

// Menyelesaikan storeId yang boleh diakses untuk satu permintaan.
//
// STORE    : parameter store dari client DIABAIKAN. Master store
//            tetap dibaca supaya catatan tetap konsisten dengan
//            toko yang tercatat di sistem.
// CENTRAL  : WAJIB memilih satu toko yang sudah dibuka di
//            dashboard. Toko divalidasi ke master "stores".
//            Central Cabang WAJIB satu cabang dengan akun;
//            Central Pusat cukup valid di master.
async function resolveStoreScope(
  user: NoteUser,
  requestedStoreId: string,
): Promise<ResolvedScope> {
  const role = user.role.toLowerCase()

  if (role === "store") {
    if (!user.storeId) {
      return {
        error: forbidden(
          "Akun Store belum memiliki data toko yang valid.",
        ),
      }
    }

    const master = await getStoreMaster(user.storeId)

    if (!master.found) {
      return {
        error: forbidden(
          "Akun Store belum memiliki data toko yang valid.",
        ),
      }
    }

    return { storeId: master.storeId }
  }

  if (!isCentralRole(role)) {
    return {
      error: forbidden("Akses ditolak."),
    }
  }

  const requested = cleanString(requestedStoreId, 100)

  if (!requested) {
    return {
      error: badRequest("Toko wajib dipilih."),
    }
  }

  const master = await getStoreMaster(requested)

  if (!master.found) {
    return {
      error: notFound("Toko tidak ditemukan."),
    }
  }

  if (role === "central_cabang") {
    const ownCabang = normalize(user.cabangId)

    if (!ownCabang || master.cabangId !== ownCabang) {
      return {
        error: forbidden(
          "Anda tidak memiliki akses ke toko tersebut.",
        ),
      }
    }
  }

  return { storeId: master.storeId }
}

// ============================================================
// ISI
// ============================================================

function validateIsi(value: unknown):
  | { ok: true; isi: string }
  | { ok: false; message: string } {
  if (typeof value !== "string") {
    return {
      ok: false,
      message: "Catatan wajib diisi.",
    }
  }

  if (value.length > ISI_MAX) {
    return {
      ok: false,
      message: `Catatan maksimal ${ISI_MAX} karakter.`,
    }
  }

  const isi = value.trim()

  if (!isi) {
    return {
      ok: false,
      message: "Catatan wajib diisi.",
    }
  }

  return { ok: true, isi }
}

function toNoteDto(
  id: string,
  data: Record<string, unknown>,
) {
  return {
    id,
    storeId: cleanString(data?.storeId, 100),
    periode: cleanString(data?.periode, 20),
    isi: cleanString(data?.isi, ISI_MAX),
    sumber: isNoteSumber(data?.sumber)
      ? data.sumber
      : null,
    dibuatOlehUid: cleanString(
      data?.dibuatOlehUid,
      128,
    ),
    dibuatOlehNama: cleanString(
      data?.dibuatOlehNama,
      150,
    ),
    createdAt: toIsoString(data?.createdAt),
    updatedAt: toIsoString(data?.updatedAt),
  }
}

async function readBody(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  try {
    const parsed = (await request.json()) as unknown

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return badRequest("Body request tidak valid.")
    }

    return parsed as Record<string, unknown>
  } catch {
    return badRequest("Body request tidak valid.")
  }
}

// ============================================================
// GET — DAFTAR CATATAN SATU TOKO + SATU PERIODE
// ============================================================
//
// Query tunggal memakai composite index:
//   monitoring_error_notes
//   storeId ASC, periode ASC, createdAt DESC
//
// TIDAK ada query per dokumen: nama admin, sumber, dan tanggal
// sudah tersimpan di dokumen catatan (snapshot saat dibuat).
// TIDAK ada query ke monitoring_errors.

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    const url = new URL(request.url)

    const periode = cleanString(
      url.searchParams.get("periode"),
      20,
    )

    // "storeId" adalah nama kanonik; "store" diterima sebagai
    // alias mengikuti parameter yang sudah dipakai modul
    // Monitoring Error.
    const storeParam =
      cleanString(url.searchParams.get("storeId"), 100) ||
      cleanString(url.searchParams.get("store"), 100)

    if (!isValidPeriode(periode)) {
      return badRequest(
        "Periode wajib diisi dengan format YYYY-MM.",
      )
    }

    const scope = await resolveStoreScope(
      user,
      storeParam,
    )

    if ("error" in scope) {
      return scope.error
    }

    const snapshot = await adminDb
      .collection(COLLECTION)
      .where("storeId", "==", scope.storeId)
      .where("periode", "==", periode)
      .orderBy("createdAt", "desc")
      .limit(NOTES_LIMIT)
      .get()

    const notes = snapshot.docs.map((doc) =>
      toNoteDto(doc.id, doc.data() ?? {}),
    )

    return NextResponse.json({
      success: true,
      periode,
      storeId: scope.storeId,
      count: notes.length,
      notes,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// POST — BUAT CATATAN (KHUSUS CENTRAL)
// ============================================================
//
// Role Store SELALU 403 di sini: Catatan bersifat read-only
// untuk Store. Satu POST = satu write, tanpa efek samping.
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (!isCentralRole(user.role)) {
      return forbidden(
        "Hanya akun Central yang dapat menambahkan Catatan.",
      )
    }

    const body = await readBody(request)

    if (body instanceof NextResponse) {
      return body
    }

    // ----------------------------------------------------------
    // VALIDASI PAYLOAD
    // ----------------------------------------------------------
    //
    // Hanya tiga field yang dibaca: periode, storeId, isi.
    // sumber, dibuatOlehUid, dibuatOlehNama, createdAt, dan
    // updatedAt pada body DIABAIKAN sepenuhnya.

    const periode = cleanString(body?.periode, 20)
    const storeId = cleanString(body?.storeId, 100)
    const isiResult = validateIsi(body?.isi)

    if (!isValidPeriode(periode)) {
      return badRequest(
        "Periode wajib diisi dengan format YYYY-MM.",
      )
    }

    if (!storeId) {
      return badRequest("Toko wajib dipilih.")
    }

    if (!isiResult.ok) {
      return badRequest(isiResult.message)
    }

    const scope = await resolveStoreScope(user, storeId)

    if ("error" in scope) {
      return scope.error
    }

    // ----------------------------------------------------------
    // TULIS
    // ----------------------------------------------------------
    //
    // sumber, dibuatOlehUid, dan dibuatOlehNama berasal dari
    // role + dokumen users/{uid}, bukan dari body.

    const docRef = await adminDb
      .collection(COLLECTION)
      .add({
        storeId: scope.storeId,
        periode,
        isi: isiResult.isi,
        sumber: sumberForRole(user.role),
        dibuatOlehUid: user.uid,
        dibuatOlehNama: user.nama,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message: "Catatan berhasil disimpan.",
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
