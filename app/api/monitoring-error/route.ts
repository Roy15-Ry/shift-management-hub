import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import {
  MONITORING_ERROR_JENIS_LIST,
  isMonitoringErrorJenis,
  isMonitoringErrorKeteranganValid,
  isMonitoringErrorLainnya,
  type MonitoringErrorJenis,
} from "@/lib/monitoring-error"

// ============================================================
// MONITORING ERROR — API UTAMA
// ============================================================
//
// GET  -> satu bulan penuh untuk SATU toko yang dipilih, berisi
//         daftar kejadian (untuk History + drill-down dashboard)
//         dan agregasi per karyawan per jenis error.
// POST -> membuat 1 kejadian human error (khusus STORE).
//
// SCOPE (SELALU ditentukan server dari akun, bukan dari body):
//   STORE          -> hanya tokonya sendiri. storeId diambil dari
//                     users/{uid}.storeId; parameter store diabaikan.
//   CENTRAL CABANG -> WAJIB memilih satu toko, dan toko tersebut
//                     WAJIB berada pada cabang akunnya (read-only).
//   CENTRAL PUSAT  -> WAJIB memilih satu cabang lalu satu toko
//                     pada cabang itu (read-only). Tidak ada
//                     fallback "Semua Cabang".
//
// Query SELALU memakai storeId hasil resolusi scope di atas, bukan
// mengambil seluruh cabang lalu memfilter di sisi client.
//
// storeId, cabangId, storeName, employeeName, createdBy, dan
// updatedBy TIDAK PERNAH diambil dari body request.
//
// employeeAvailableAt memakai POLA YANG SAMA dengan modul existing
// (aktif, ATAU tanggal pencatatan <= tanggalNonaktif). Definisi
// existing TIDAK diubah dan TIDAK diduplikasi menjadi aturan
// baru; helper lokal di bawah hanya menyalin pola tersebut untuk
// collection monitoring_errors.
// ============================================================

const COLLECTION = "monitoring_errors"

type MonitoringErrorUser = {
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
): Promise<MonitoringErrorUser> {
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

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function isValidDateISO(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const [year, month, day] =
    value.split("-").map(Number)

  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

// "Hari ini" memakai waktu lokal server, sama seperti helper
// tanggal lokal pada halaman existing.
function todayISO(): string {
  const now = new Date()

  return `${now.getFullYear()}-${pad2(
    now.getMonth() + 1,
  )}-${pad2(now.getDate())}`
}

// Satu bulan PENUH: mulai tanggal 1 sampai tanggal 1 bulan
// berikutnya (batas eksklusif).
function buildPeriod(
  year: number,
  month: number,
): { periode: string; start: string; end: string } {
  const periode = `${year}-${pad2(month + 1)}`
  const start = `${periode}-01`

  const endYear = month === 11 ? year + 1 : year
  const endMonth = month === 11 ? 0 : month + 1
  const end = `${endYear}-${pad2(endMonth + 1)}-01`

  return { periode, start, end }
}

function emptyRowByJenis(): Record<
  MonitoringErrorJenis,
  number
> {
  const row = {} as Record<MonitoringErrorJenis, number>

  for (const jenis of MONITORING_ERROR_JENIS_LIST) {
    row[jenis] = 0
  }

  return row
}

// ============================================================
// SCOPE — resolusi toko WAJIB diverifikasi server-side
// ============================================================

type TargetStore = {
  storeId: string
  cabangId: string
  storeName: string
}

async function getStoreInfo(storeId: string): Promise<{
  found: boolean
  cabangId: string
  name: string
}> {
  const snapshot = await adminDb
    .collection("stores")
    .where("storeId", "==", storeId)
    .limit(1)
    .get()

  const data = snapshot.docs[0]?.data() ?? null

  return {
    found: Boolean(data),
    cabangId: normalize(data?.cabangId ?? ""),
    name:
      cleanString(
        data?.namaStore ?? data?.nama,
        120,
      ) || storeId,
  }
}

async function resolveTargetStore(
  user: MonitoringErrorUser,
  role: string,
  storeParam: string,
  cabangParam: string,
): Promise<TargetStore | null> {
  // STORE: storeId TIDAK BOLEH dipercaya dari request.
  if (role === "store") {
    if (!user.storeId) {
      return null
    }

    const info = await getStoreInfo(user.storeId)

    return {
      storeId: user.storeId,
      cabangId: user.cabangId,
      storeName: info.name,
    }
  }

  // CENTRAL CABANG: wajib pilih toko, toko harus milik cabangnya.
  if (role === "central_cabang") {
    const storeId = cleanString(storeParam, 100)

    if (!storeId || !user.cabangId) {
      return null
    }

    const info = await getStoreInfo(storeId)

    if (
      !info.found ||
      info.cabangId !== normalize(user.cabangId)
    ) {
      return null
    }

    return {
      storeId,
      cabangId: info.cabangId,
      storeName: info.name,
    }
  }

  // CENTRAL PUSAT: wajib pilih satu cabang, lalu satu toko pada
  // cabang tersebut. Tidak ada "Semua Cabang".
  const cabang = cleanString(cabangParam, 100)
  const storeId = cleanString(storeParam, 100)

  if (
    !cabang ||
    !storeId ||
    normalize(cabang) === "ALL" ||
    normalize(cabang) === "__ALL__"
  ) {
    return null
  }

  const info = await getStoreInfo(storeId)

  if (!info.found || info.cabangId !== normalize(cabang)) {
    return null
  }

  return {
    storeId,
    cabangId: info.cabangId,
    storeName: info.name,
  }
}

// ============================================================
// EMPLOYEE AVAILABILITY (pola existing)
// ============================================================

async function getEmployeeSnapshot(
  employeeId: string,
): Promise<{
  name: string
  storeId: string
  aktif: boolean
  tanggalNonaktif: string | null
} | null> {
  const snapshot = await adminDb
    .collection("employees")
    .doc(employeeId)
    .get()

  if (!snapshot.exists) {
    return null
  }

  const data = snapshot.data() ?? {}

  return {
    name: cleanString(
      data?.name ?? data?.nama ?? "-",
      150,
    ),
    storeId: cleanString(data?.storeId, 100),
    aktif: data?.aktif === true,
    tanggalNonaktif:
      typeof data?.tanggalNonaktif === "string"
        ? data.tanggalNonaktif
        : null,
  }
}

function employeeAvailableAt(
  employee: {
    storeId: string
    aktif: boolean
    tanggalNonaktif: string | null
  },
  storeId: string,
  tanggal: string,
): boolean {
  return (
    employee.storeId === storeId &&
    (employee.aktif ||
      (employee.tanggalNonaktif !== null &&
        tanggal <= employee.tanggalNonaktif))
  )
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
    "Gagal memproses Monitoring Error:",
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

// ============================================================
// GET — SATU BULAN PENUH, SATU TOKO
// ============================================================

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    const role = user.role.toLowerCase()

    if (
      role !== "store" &&
      role !== "central_cabang" &&
      role !== "central_pusat"
    ) {
      return forbidden("Anda tidak memiliki izin.")
    }

    const url = new URL(request.url)
    const year = Number(url.searchParams.get("year") ?? "")
    const month = Number(url.searchParams.get("month") ?? "")

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 0 ||
      month > 11
    ) {
      return badRequest("Periode tidak valid.")
    }

    const { periode, start, end } = buildPeriod(year, month)

    const target = await resolveTargetStore(
      user,
      role,
      url.searchParams.get("store") ?? "",
      url.searchParams.get("cabang") ?? "",
    )

    if (!target) {
      if (role === "store") {
        return forbidden(
          "Akun Store belum memiliki data toko yang valid.",
        )
      }

      if (role === "central_cabang") {
        return badRequest(
          "Pilih toko yang berada pada cabang Anda.",
        )
      }

      return badRequest(
        "Central Pusat wajib memilih satu cabang dan satu toko pada cabang tersebut.",
      )
    }

    // =====================================================
    // QUERY — HANYA toko terpilih, satu bulan penuh
    // =====================================================

    const snapshot = await adminDb
      .collection(COLLECTION)
      .where("storeId", "==", target.storeId)
      .where("tanggal", ">=", start)
      .where("tanggal", "<", end)
      .get()

    const records: Record<string, unknown>[] = []
    const byEmployee = new Map<
      string,
      {
        employeeName: string
        byJenis: Record<MonitoringErrorJenis, number>
        total: number
      }
    >()

    snapshot.docs.forEach((doc) => {
      const data = doc.data() ?? {}

      const employeeId = cleanString(data?.employeeId, 200)
      const employeeName = cleanString(
        data?.employeeName,
        150,
      )
      const tanggal = cleanString(data?.tanggal, 20)

      // Jenis yang tidak dikenal pada kode master diabaikan
      // agar dashboard tidak menghitung data di luar daftar.
      const rawJenis = cleanString(data?.jenisError, 80)

      if (
        !employeeId ||
        !tanggal ||
        !isMonitoringErrorJenis(rawJenis)
      ) {
        return
      }

      const jenisError = rawJenis as MonitoringErrorJenis
      const keterangan = cleanString(
        data?.keterangan,
        200,
      )

      records.push({
        id: doc.id,
        storeId: cleanString(data?.storeId, 100),
        cabangId: cleanString(data?.cabangId, 100),
        storeName: cleanString(data?.storeName, 120),
        employeeId,
        employeeName,
        tanggal,
        jenisError,
        keterangan,
        keteranganManual: cleanString(
          data?.keteranganManual,
          500,
        ),
        createdAt:
          data?.createdAt &&
          typeof data.createdAt.toDate === "function"
            ? data.createdAt.toDate().toISOString()
            : null,
        updatedAt:
          data?.updatedAt &&
          typeof data.updatedAt.toDate === "function"
            ? data.updatedAt.toDate().toISOString()
            : null,
      })

      if (!byEmployee.has(employeeId)) {
        byEmployee.set(employeeId, {
          employeeName,
          byJenis: emptyRowByJenis(),
          total: 0,
        })
      }

      const row = byEmployee.get(employeeId)!

      row.byJenis[jenisError] += 1
      row.total += 1
    })

    // Urut berdasarkan nama karyawan.
    const rows = Array.from(
      byEmployee.entries(),
    )
      .map(([employeeId, value]) => ({
        employeeId,
        employeeName: value.employeeName,
        byJenis: value.byJenis,
        total: value.total,
      }))
      .sort((a, b) =>
        a.employeeName.localeCompare(
          b.employeeName,
          "id",
          { sensitivity: "base" },
        ),
      )

    // Urut terbaru lebih dulu.
    records.sort((a, b) => {
      const byDate = String(b.tanggal).localeCompare(
        String(a.tanggal),
      )

      return byDate !== 0
        ? byDate
        : String(b.id).localeCompare(String(a.id))
    })

    const totals = emptyRowByJenis()
    let grandTotal = 0

    for (const row of rows) {
      for (const jenis of MONITORING_ERROR_JENIS_LIST) {
        totals[jenis] += row.byJenis[jenis]
      }
      grandTotal += row.total
    }

    return NextResponse.json({
      success: true,
      periode,
      start,
      end,
      storeId: target.storeId,
      cabangId: target.cabangId,
      storeName: target.storeName,
      records,
      rows,
      totals: { ...totals, total: grandTotal },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// POST — CATAT 1 KEJADIAN (khusus STORE)
// ============================================================

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return forbidden(
        "Hanya akun Store yang dapat mencatat Monitoring Error.",
      )
    }

    // storeId & cabangId SELALU dari akun, tidak dari body.
    const storeId = user.storeId
    const cabangId = user.cabangId

    if (!storeId || !cabangId) {
      return forbidden(
        "Akun Store belum memiliki data toko/cabang yang valid.",
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<
        string,
        unknown
      >
    } catch {
      return badRequest("Body request tidak valid.")
    }

    // ----------------------------------------------------------
    // VALIDASI FIELD
    // ----------------------------------------------------------

    const tanggal = cleanString(body?.tanggal, 20)
    const employeeId = cleanString(body?.employeeId, 200)
    const rawJenis = cleanString(body?.jenisError, 80)
    const rawKeterangan = cleanString(body?.keterangan, 200)
    const rawManual = cleanString(
      body?.keteranganManual,
      500,
    )

    if (!isValidDateISO(tanggal) || !employeeId) {
      return badRequest(
        "Tanggal dan Nama Karyawan wajib diisi dengan benar.",
      )
    }

    // Tanggal masa depan WAJIB ditolak (hari ini & lalu OK).
    if (tanggal > todayISO()) {
      return badRequest(
        "Tanggal tidak boleh lebih dari hari ini.",
      )
    }

    if (!isMonitoringErrorJenis(rawJenis)) {
      return badRequest("Jenis error tidak valid.")
    }

    const jenisError = rawJenis as MonitoringErrorJenis

    if (
      !isMonitoringErrorKeteranganValid(
        jenisError,
        rawKeterangan,
      )
    ) {
      return badRequest(
        `Keterangan tidak sesuai untuk jenis error ${jenisError}.`,
      )
    }

    // Simpan nilai kanonik dari kode master.
    const keterangan =
      rawKeterangan.trim().toUpperCase()

    // Keterangan Manual HANYA dipakai saat LAINNYA dipilih.
    // Jika bukan LAINNYA, nilai manual TIDAK PERNAH disimpan.
    let keteranganManual = ""

    if (isMonitoringErrorLainnya(keterangan)) {
      if (!rawManual.trim()) {
        return badRequest(
          "Keterangan manual wajib diisi ketika memilih LAINNYA.",
        )
      }
      keteranganManual = rawManual.trim()
    }

    // ----------------------------------------------------------
    // VALIDASI KARYAWAN (harus dari toko ini)
    // ----------------------------------------------------------

    const employee =
      await getEmployeeSnapshot(employeeId)

    if (
      !employee ||
      !employeeAvailableAt(
        employee,
        storeId,
        tanggal,
      )
    ) {
      return badRequest(
        "Karyawan tidak tersedia pada tanggal pencatatan yang dipilih.",
      )
    }

    const storeInfo = await getStoreInfo(storeId)

    // ----------------------------------------------------------
    // TULIS
    // ----------------------------------------------------------

    const actor = {
      uid: user.uid,
      nama: user.nama,
      role: user.role,
    }

    const docRef = await adminDb
      .collection(COLLECTION)
      .add({
        storeId,
        cabangId,
        storeName: storeInfo.name,
        employeeId,
        employeeName: employee.name,
        tanggal,
        jenisError,
        keterangan,
        keteranganManual,
        createdBy: actor,
        updatedBy: actor,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message: "Monitoring Error berhasil disimpan.",
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
