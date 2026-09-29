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
// GET  -> satu bulan penuh, DUA mode read:
//         MODE DETAIL TOKO  -> satu toko. Berisi daftar kejadian
//                             (History + drill-down dashboard) dan
//                             agregasi per karyawan per jenis.
//         MODE AGGREGATE    -> seluruh TOKO AKTIF pada satu
//                             cabang, agregasi per toko PLUS
//                             ringkasan lintas toko. Hanya untuk
//                             Central.
// POST -> membuat 1 kejadian human error (khusus STORE).
//
// SCOPE (SELALU ditentukan server dari akun, bukan dari body):
//   STORE          -> hanya tokonya sendiri, SELALU mode detail.
//                     storeId diambil dari users/{uid}.storeId;
//                     parameter store diabaikan total.
//   CENTRAL CABANG -> "store" dikirim  : mode detail, toko WAJIB
//                     berada pada cabang akun.
//                     "store" TIDAK    : mode aggregate, seluruh
//                     toko AKTIF pada cabang akun.
//   CENTRAL PUSAT  -> "cabang" WAJIB dipilih. Setelah itu
//                     "store" dikirim -> mode detail pada toko
//                     tersebut; "store" TIDAK dikirim -> mode
//                     aggregate seluruh toko AKTIF pada cabang
//                     yang dipilih. Tidak ada fallback
//                     "Semua Cabang"; "ALL" dan "__ALL__" ditolak.
//
// Mode aggregate SELALU satu cabang: central_cabang memakai
// user.cabangId, central_pusat memakai cabang yang dipilih.
// Tidak pernah membaca seluruh cabang / seluruh perusahaan.
//
// Pembacaan per SELURUH toko memakai kueri (storeId + rentang
// tanggal) yang SAMA dengan mode detail, sehingga composite index
// existing (storeId ASC, tanggal ASC) tetap menyumbang dan
// TIDAK ada index baru. Pembacaan antar toko SEQUENTIAL.
//
// storeId, cabangId, storeName, employeeName, createdBy, dan
// updatedBy TIDAK PERNAH diambil dari body request.
//
// MODE DETAIL TIDAK MENGUBAH bentuk response yang sekarang
// (success, periode, start, end, storeId, cabangId, storeName,
// records, rows, totals) sehingga halaman existing tetap kompatibel.
//
// Modul ini tetap sistem pencatatan ERROR/INCIDENT. TIDAK ada
// konsep target, achievement, progress, atau hasTarget. agregado
// di bawah hanya menghitung JUMLAH kejadian per jenis.
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

// ============================================================
// SCOPE — CABANG -> DAFTAR TOKO
// ============================================================
//
// Dipakai HANYA oleh mode aggregate. Satu query ke master
// "stores" (ukuran kecil) memakai satu klausa, lalu penyaringan
// toko dilakukan di sisi server. Toko non-aktif (aktif ===
// false) TIDAK masuk daftar.
//
// Helper ini TIDAK pernah dipakai oleh role Store. Role Store
// selalu selesai pada getStoreInfo() di atas sebelum fungsi ini
// dipanggil, sehingga penentuan scope Store tidak pernah
// bergantung pada daftar toko.
async function getAllStoresByCabang(
  cabangId: string,
): Promise<
  Map<string, { cabangId: string; namaStore: string }>
> {
  // Nilai query dinormalisasi (trim + uppercase) memakai helper
  // normalize() yang sama, sehingga cocok dengan perbandingan
  // in-memory di bawah dan konsisten dengan data "stores".
  const normalizedCabangId = normalize(cabangId)

  if (!normalizedCabangId) {
    return new Map()
  }

  const snapshot =
    await adminDb
      .collection("stores")
      .where("cabangId", "==", normalizedCabangId)
      .get()

  const map = new Map<
    string,
    { cabangId: string; namaStore: string }
  >()

  snapshot.docs.forEach((doc) => {
    const data = doc.data() ?? {}

    // Aggregate HANYA menghitung toko dengan aktif !== false.
    if (data?.aktif === false) {
      return
    }

    const storeId = String(
      data?.storeId ?? doc.id ?? "",
    ).trim()

    if (!storeId) {
      return
    }

    map.set(storeId, {
      cabangId: normalize(data?.cabangId ?? ""),
      namaStore: cleanString(
        data?.namaStore ?? data?.nama ?? "",
        120,
      ),
    })
  })

  return map
}

// ============================================================
// SCOPE — resolusi toko WAJIB diverifikasi server-side
// ============================================================
//
// Dua mode read dihasilkan di sini:
//
//   mode "detail"    -> tepat satu toko dalam scope. Bentuk
//                       response TIDAK berubah sama sekali.
//   mode "aggregate" -> seluruh toko AKTIF pada satu cabang
//                       (khusus Central).
//
// Toko yang diminta client di luar scope akun/cabang DITOLAK
// (invalidStore), bukan diganti dengan data kosong.
//
// MODE DETAIL memakai getStoreInfo() persis seperti sebelumnya,
// sehingga jumlah read dan bentuk response role Store maupun
// Central detail tidak berubah. MODE AGGREGATE memakai
// getAllStoresByCabang() dan TIDAK memanggil getStoreInfo(),
// sehingga tidak ada read ganda ke master "stores".
//
// Pemeriksaan "aktif" HANYA berlaku pada mode aggregate. Mode
// detail tetap memakai getStoreInfo() tanpa memeriksa "aktif",
// sehingga request Central pada toko non-aktif tidak berubah
// perilakunya dibanding sebelum Phase 4.

type AccessScope = {
  scope: "store" | "cabang" | "pusat"
  mode: "detail" | "aggregate"
  storeIds: string[]
  storeNames: Map<string, string>
  cabangId: string
  // Toko yang diminta client berada di luar scope cabangnya.
  invalidStore?: boolean
  // Akun Store tidak memiliki storeId yang valid.
  noStoreScope?: boolean
}

// Scope aggregate untuk Central: daftar toko AKTIF pada satu
// cabang. Helper kecil supaya Central Cabang dan Central Pusat
// memakai jalur yang benar-benar sama.
async function buildAggregateScope(
  level: "cabang" | "pusat",
  cabangId: string,
): Promise<AccessScope> {
  const scopeCabangId = normalize(cabangId)

  const storesByCabang =
    await getAllStoresByCabang(scopeCabangId)

  const storeIds: string[] = []
  const storeNames = new Map<string, string>()

  for (const [
    storeId,
    master,
  ] of storesByCabang.entries()) {
    // Pengaman kedua: hanya toko pada cabang yang diminta.
    if (master.cabangId !== scopeCabangId) {
      continue
    }

    storeIds.push(storeId)
    storeNames.set(storeId, master.namaStore)
  }

  return {
    scope: level,
    mode: "aggregate",
    storeIds,
    storeNames,
    cabangId: scopeCabangId,
  }
}

async function resolveScope(
  user: MonitoringErrorUser,
  role: string,
  storeParam: string,
  cabangParam: string,
): Promise<AccessScope> {
  // ----------------------------------------------------------
  // STORE: SELALU mode detail, scope dari akun
  // ----------------------------------------------------------
  //
  // Dikembalikan SEBELUM getAllStoresByCabang() dan sebelum
  // storeParam dipakai, sehingga parameter dari client TIDAK
  // PERNAH dapat mengganti scope Store. Toko juga tidak pernah
  // memperoleh akses aggregate.
  if (role === "store") {
    if (!user.storeId) {
      return {
        scope: "store",
        mode: "detail",
        storeIds: [],
        storeNames: new Map(),
        cabangId: user.cabangId,
        noStoreScope: true,
      }
    }

    // Sama seperti sebelumnya: nama toko diambil dari master
    // "stores" memakai getStoreInfo().
    const info = await getStoreInfo(user.storeId)

    return {
      scope: "store",
      mode: "detail",
      storeIds: [user.storeId],
      storeNames: new Map([[user.storeId, info.name]]),
      // cabangId untuk role Store tetap berasal dari akun.
      cabangId: user.cabangId,
    }
  }

  // ----------------------------------------------------------
  // CENTRAL CABANG: cabang SELALU dari akun
  // ----------------------------------------------------------
  //
  // cabangParam dari client TIDAK menjadi sumber kebenaran di
  // sini, sehingga Central Cabang tidak dapat membaca toko
  // milik cabang lain.
  if (role === "central_cabang") {
    if (!user.cabangId) {
      return {
        scope: "cabang",
        mode: "aggregate",
        storeIds: [],
        storeNames: new Map(),
        cabangId: "",
        invalidStore: true,
      }
    }

    const scopeCabangId = normalize(user.cabangId)

    // Tanpa "store" -> AGGREGATE seluruh toko AKTIF pada
    // cabang akun.
    if (!storeParam) {
      return await buildAggregateScope(
        "cabang",
        scopeCabangId,
      )
    }

    // Dengan "store" -> DETAIL, toko WAJIB milik cabang akun.
    const storeId = cleanString(storeParam, 100)
    const info = await getStoreInfo(storeId)

    if (
      !info.found ||
      info.cabangId !== scopeCabangId
    ) {
      return {
        scope: "cabang",
        mode: "detail",
        storeIds: [],
        storeNames: new Map(),
        cabangId: scopeCabangId,
        invalidStore: true,
      }
    }

    return {
      scope: "cabang",
      mode: "detail",
      storeIds: [storeId],
      storeNames: new Map([[storeId, info.name]]),
      cabangId: info.cabangId,
    }
  }

  // ----------------------------------------------------------
  // CENTRAL PUSAT: cabang WAJIB dipilih
  // ----------------------------------------------------------
  //
  // Cabang sudah divalidasi di GET sebelum fungsi ini dipanggil
  // (tidak kosong dan bukan "ALL" / "__ALL__"), sehingga tidak
  // ada jalur "semua cabang" di sini.
  const scopeCabangId = normalize(cabangParam)

  if (!scopeCabangId) {
    return {
      scope: "pusat",
      mode: "aggregate",
      storeIds: [],
      storeNames: new Map(),
      cabangId: "",
      invalidStore: true,
    }
  }

  // Tanpa "store" -> AGGREGATE seluruh toko AKTIF pada cabang
  // yang dipilih.
  if (!storeParam) {
    return await buildAggregateScope(
      "pusat",
      scopeCabangId,
    )
  }

  // Dengan "store" -> DETAIL, toko WAJIB berada pada cabang
  // yang dipilih.
  const storeId = cleanString(storeParam, 100)
  const info = await getStoreInfo(storeId)

  if (!info.found || info.cabangId !== scopeCabangId) {
    return {
      scope: "pusat",
      mode: "detail",
      storeIds: [],
      storeNames: new Map(),
      cabangId: scopeCabangId,
      invalidStore: true,
    }
  }

  return {
    scope: "pusat",
    mode: "detail",
    storeIds: [storeId],
    storeNames: new Map([[storeId, info.name]]),
    cabangId: info.cabangId,
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
// PEMBACAAN + AGREGASI PER TOKO
// ============================================================
//
// Dipakai oleh KEDUA mode read agar perhitungan, pengurutan,
// dan penyaringan record TIDAK PERNAH bisa berbeda antara
// Mode Detail Toko dan Mode Aggregate.
//
// Aturan penyaringan TETAP sama seperti sebelumnya dan TIDAK
// ditambah maupun diubah:
//
//   - record tanpa employeeId diabaikan;
//   - record tanpa tanggal diabaikan;
//   - record dengan jenisError yang tidak ada di kode master
//     diabaikan, agar dashboard tidak menghitung data di luar
//     daftar.
//
// Modul ini tetap pencatatan ERROR/INCIDENT. Yang dihitung
// HANYA JUMLAH kejadian per jenis — tidak ada target,
// achievement, progress, maupun hasTarget.

type StoreAggregate = {
  records: Record<string, unknown>[]
  rows: {
    employeeId: string
    employeeName: string
    byJenis: Record<MonitoringErrorJenis, number>
    total: number
  }[]
  totals: Record<MonitoringErrorJenis, number> & {
    total: number
  }
}

function aggregateStoreDocs(
  docs: readonly FirebaseFirestore.QueryDocumentSnapshot[],
): StoreAggregate {
  const records: Record<string, unknown>[] = []

  const byEmployee = new Map<
    string,
    {
      employeeName: string
      byJenis: Record<MonitoringErrorJenis, number>
      total: number
    }
  >()

  docs.forEach((doc) => {
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

  return {
    records,
    rows,
    totals: { ...totals, total: grandTotal },
  }
}

// SATU toko, SATU bulan penuh.
//
// Kueri INI SAMA PERSIS dengan kueri yang dipakai sebelum
// Phase 4, sehingga composite index existing (storeId ASC,
// tanggal ASC) tetap menyumbang dan TIDAK ada index baru.
// Dipakai oleh kedua mode read; mode aggregate memanggilnya
// satu kali per toko, SEQUENTIAL (tanpa Promise.all).
async function readStoreMonitoringErrors(
  storeId: string,
  start: string,
  end: string,
): Promise<StoreAggregate> {
  const snapshot = await adminDb
    .collection(COLLECTION)
    .where("storeId", "==", storeId)
    .where("tanggal", ">=", start)
    .where("tanggal", "<", end)
    .get()

  return aggregateStoreDocs(snapshot.docs)
}

// ============================================================
// GET — SATU BULAN PENUH: DETAIL TOKO / AGGREGATE CABANG
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

    // =====================================================
    // CENTRAL PUSAT — cabang WAJIB dipilih
    // =====================================================
    //
    // Tidak ada jalur "semua cabang". "ALL" dan "__ALL__"
    // ditolak eksplisit, dan cabang kosong ditolak lebih dulu
    // agar scope tidak pernah diselesaikan tanpa cabang.
    const cabangParam = normalize(
      url.searchParams.get("cabang") ?? "",
    )

    if (
      role === "central_pusat" &&
      (!cabangParam ||
        cabangParam === "ALL" ||
        cabangParam === "__ALL__")
    ) {
      return badRequest(
        "Central Pusat wajib memilih satu cabang untuk melihat Monitoring Error.",
      )
    }

    // Toko yang diminta Central. Untuk role Store parameter ini
    // TIDAK dipakai: scope tetap user.storeId.
    const storeParam = cleanString(
      url.searchParams.get("store") ?? "",
      100,
    )

    const scope = await resolveScope(
      user,
      role,
      storeParam,
      cabangParam,
    )

    if (scope.noStoreScope) {
      return forbidden(
        "Akun Store belum memiliki data toko yang valid.",
      )
    }

    // Toko di luar scope akun / cabang -> TOLAK request.
    // Jangan pernah membalikannya menjadi aggregate kosong.
    if (scope.invalidStore) {
      return forbidden(
        "Toko yang dipilih tidak berada dalam cakupan akun Anda.",
      )
    }

    const {
      scope: scopeLevel,
      mode,
      storeIds,
      storeNames,
      cabangId: scopeCabangId,
    } = scope

    // =====================================================
    // MODE AGGREGATE — seluruh toko AKTIF pada satu cabang
    // =====================================================
    //
    // Hanya Central. Scope SELALU satu cabang:
    //   central_cabang -> user.cabangId
    //   central_pusat  -> cabang yang dipilih
    //
    // Pembacaan SEQUENTIAL per toko memakai kueri yang sama
    // dengan mode detail. Tidak ada read ke collection lain.
    if (mode === "aggregate") {
      const stores: Record<string, unknown>[] = []

      const summaryByJenis = emptyRowByJenis()
      let summaryTotal = 0

      for (const storeId of storeIds) {
        const store =
          await readStoreMonitoringErrors(
            storeId,
            start,
            end,
          )

        for (const jenis of MONITORING_ERROR_JENIS_LIST) {
          summaryByJenis[jenis] += store.totals[jenis]
        }

        summaryTotal += store.totals.total

        stores.push({
          storeId,
          // Nama toko dari master "stores", lalu fallback ke
          // snapshot storeName pada record, lalu ke storeId.
          // Tidak ada field baru di Firestore untuk ini.
          storeName:
            storeNames.get(storeId) ||
            cleanString(
              store.records[0]?.storeName,
              120,
            ) ||
            storeId,
          // cabangId dari snapshot record bila ada, lalu
          // fallback ke cabang scope.
          cabangId:
            cleanString(
              store.records[0]?.cabangId,
              100,
            ) || scopeCabangId,
          rows: store.rows,
          totals: store.totals,
          totalEmployees: store.rows.length,
          // Record kejadian milik toko ini. Disimpan di dalam
          // entri toko supaya Phase 5 tidak perlu request
          // tambahan untuk History / drill-down.
          records: store.records,
        })
      }

      return NextResponse.json({
        success: true,
        mode: "aggregate",
        periode,
        start,
        end,
        scope: {
          role,
          level: scopeLevel,
          cabangId: scopeCabangId,
          totalStores: storeIds.length,
        },
        stores,
        summary: {
          byJenis: { ...summaryByJenis },
          total: summaryTotal,
        },
      })
    }

    // =====================================================
    // MODE DETAIL TOKO — bentuk response TIDAK BERUBAH
    // =====================================================
    //
    // Bentuk response di bawah sama persis dengan sebelum
    // Phase 4 supaya halaman existing tetap kompatibel.

    const targetStoreId = storeIds[0] ?? ""

    const store = await readStoreMonitoringErrors(
      targetStoreId,
      start,
      end,
    )

    return NextResponse.json({
      success: true,
      periode,
      start,
      end,
      storeId: targetStoreId,
      cabangId: scopeCabangId,
      storeName:
        storeNames.get(targetStoreId) ||
        targetStoreId,
      records: store.records,
      rows: store.rows,
      totals: store.totals,
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
