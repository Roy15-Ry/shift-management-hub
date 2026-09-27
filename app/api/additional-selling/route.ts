import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// TARGET PENJUALAN — REALISASI & DASHBOARD
//
// GET   -> agregasi Dashboard + daftar realisasi + target,
//          scope otorisasi SELALU dari akun (bukan client).
// POST  -> membuat realisasi (khusus STORE).
// PATCH -> mengubah realisasi milik Store login sendiri.
// DELETE-> menghapus realisasi milik Store login sendiri.
//
// Tiga jenis penjualan yang didukung:
//   - ADDITIONAL SELLING         -> satuan RUPIAH (nominal)
//   - UPSIZE BOTOL               -> satuan PCS    (pcs, ukuranBotol)
//   - SELLING EKSKLUSIF PERFUME  -> satuan PCS    (pcs, produk)
//
// Ukuran botol dan produk parfum adalah DETAIL TRANSAKSI, bukan
// dimensi target. Satu karyawan dapat memiliki 3 target berbeda
// dalam satu periode (satu per jenis).
//
// SCOPE (ditentukan dari akun):
//   STORE          -> hanya tokonya sendiri (storeId akun)
//   CENTRAL CABANG -> seluruh toko pada cabang akun
//   CENTRAL PUSAT  -> wajib memilih SATU cabang (param "cabang"),
//                     tidak ada fallback "Semua Cabang".
//
// ============================================================
// DUA MODE READ
// ============================================================
//
// MODE 1 — DETAIL TOKO (mode existing, tidak berubah bentuk
// responsnya). Dipakai ketika "store" dikirim, atau untuk role
// STORE yang parameter "store"-nya diabaikan.
//   GET ?year=&month=&store=BINAMARGA
//   -> { success, periode, transactions, targets, summary }
//
// MODE 2 — REKAP CENTRAL (mode baru, agregasi di server).
// Dipakai ketika "store" TIDAK dikirim oleh Central.
//   Central Cabang -> scope = seluruh toko pada user.cabangId
//   Central Pusat  -> scope = seluruh toko pada param "cabang"
//   GET ?year=&month=[&cabang=BINAMARGA]
//   -> { success, periode, mode, scope, stores, summary }
//
// Pada MODE 2 server TIDAK mengirim daftar transaksi maupun daftar
// target semua toko ke browser. Yang dikirim hanya rekap per toko
// (storeId, storeName, total target/realisasi/progress per jenis)
// sehingga frontend tidak perlu menghitung ulang.
//
// "TARGET BELUM DIBUAT" dibedakan dari "TARGET ADA DENGAN NILAI 0"
// melalui flag hasTarget pada setiap jenis — murni informasi
// response, tanpa menambah field ke Firestore.
//
// Parameter year/month hanya menjadi FILTER periode setelah
// scope otorisasi diterapkan.
//
// Employee availability memakai pola Revisi: employee aktif,
// ATAU tanggal pencatatan masih <= tanggalNonaktif. Nama toko
// dan nama employee disimpan sebagai snapshot saat menulis.
//
// storeId, cabangId, storeName, employeeName, createdBy TIDAK
// pernah diambil dari body request.
//
// KOMPATIBILITAS DATA LAMA (tanpa migration / tanpa backfill):
//   Dokumen lama tanpa field "jenis" dibaca sebagai
//   ADDITIONAL_SELLING. Dokumen Additional Selling lama tidak
//   pernah diubah secara massal.
// ============================================================

const JENIS_LIST = [
  "ADDITIONAL_SELLING",
  "UPSIZE_BOTOL",
  "SELLING_EKSKLUSIF_PERFUME",
] as const

type PenjualanJenis = (typeof JENIS_LIST)[number]

// Ukuran botol yang valid untuk UPSIZE BOTOL.
const UKURAN_BOTOL_LIST = ["55 ML", "100 ML"] as const

// Produk yang valid untuk SELLING EKSKLUSIF PERFUME.
const PRODUK_LIST = ["PAX", "FEEL BETTER", "LAINNYA"] as const

type UkuranBotol = (typeof UKURAN_BOTOL_LIST)[number]
type Produk = (typeof PRODUK_LIST)[number]

function isPenjualanJenis(
  value: unknown,
): value is PenjualanJenis {
  return JENIS_LIST.includes(value as PenjualanJenis)
}

function isUkuranBotol(
  value: unknown,
): value is UkuranBotol {
  return UKURAN_BOTOL_LIST.includes(value as UkuranBotol)
}

function isProduk(
  value: unknown,
): value is Produk {
  return PRODUK_LIST.includes(value as Produk)
}

// Dokumen lama tidak memiliki field "jenis" dan seluruhnya
// Additional Selling.
function resolveJenis(
  value: unknown,
): PenjualanJenis {
  const jenis = normalize(
    value ?? "ADDITIONAL_SELLING",
  )

  return isPenjualanJenis(jenis)
    ? jenis
    : "ADDITIONAL_SELLING"
}

// Ringkasan kosong untuk seluruh jenis, dipakai ketika scope
// tidak berisi toko mana pun. Bentuknya sama persis dengan
// agregasi normal agar client tidak perlu kasus khusus.
function emptyByJenis(): Record<
  string,
  Record<string, unknown>
> {
  const byJenis: Record<
    string,
    Record<string, unknown>
  > = {}

  for (const jenis of JENIS_LIST) {
    byJenis[jenis] = {
      totalTarget: 0,
      totalAchievement: 0,
      progress: 0,
      totalEmployees: 0,
      employeesWithoutTarget: 0,
      perEmployee: [],
    }
  }

  return byJenis
}

type AddSellUser = {
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
): Promise<AddSellUser> {
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
  const nama = String(
    data?.nama ?? data?.email ?? "",
  ).trim()

  const aktif = data?.aktif === true

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

function isValidPeriode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value)
  )
}

// ============================================================
// PERIODE
// ============================================================

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

// ============================================================
// SCOPE — Daftar storeId yang boleh diakses per role
// ============================================================
//
// Daftar toko diambil dari collection "stores" (master toko,
// ukuran kecil). Filtering cabang dilakukan di sisi server
// (bukan dipaksa client), lalu pencatatan per toko dibaca
// dengan kueri (storeId + rentang tanggal) — memakai index
// composite (storeId, tanggal) yang sudah aktif untuk kueri
// bulanan existing, sehingga TIDAK membutuhkan index baru.
//
// Dua mode read dihasilkan di sini:
//   mode "detail"    -> tepat satu toko dalam scope
//   mode "aggregate" -> seluruh toko pada satu cabang (Central)
//
// Toko yang diminta client di luar scope akun/cabang DITOLAK
// (invalidStore), bukan diganti dengan data kosong.
// ============================================================

// storeId -> { cabangId, namaStore } dari master "stores".
async function getAllStoresByCabang(
  cabangId: string,
): Promise<
  Map<string, { cabangId: string; namaStore: string }>
> {
  // Nilai query dinormalisasi (trim + uppercase) memakai helper
  // normalize() yang sama, sehingga cocok dengan perbandingan
  // in-memory di bawah dan konsisten dengan data "stores" yang
  // ditulis melalui jalur create-store (juga uppercase).
  const normalizedCabangId = normalize(cabangId)

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
    const data = doc.data()
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

type AccessScope = {
  scope: "store" | "cabang" | "pusat"
  mode: "detail" | "aggregate"
  storeIds: string[]
  storeNames: Map<string, string>
  cabangId: string
  invalidStore?: boolean
}

async function scopeForRole(
  user: AddSellUser,
  cabangParam: string,
  storeParam: string,
): Promise<AccessScope> {
  const role = user.role.toLowerCase()

  // STORE: parameter store dari client DIABAIKAN. Scope tetap
  // user.storeId agar client tidak dapat membaca toko lain.
  // Toko TIDAK pernah memperoleh akses aggregate Central.
  if (role === "store") {
    const ownCabang = normalize(user.cabangId)

    if (!user.storeId) {
      return {
        scope: "store",
        mode: "detail",
        storeIds: [],
        storeNames: new Map(),
        cabangId: ownCabang,
      }
    }
    return {
      scope: "store",
      mode: "detail",
      storeIds: [user.storeId],
      storeNames: new Map(),
      cabangId: ownCabang,
    }
  }

  // Sumber cabang tetap otoritatif yang sudah ada: akun untuk
  // central_cabang, dan param yang sudah divalidasi server untuk
  // central_pusat. Role store sudah return di atas, sehingga tidak
  // pernah menyentuh query "stores" di sini.
  const scopeCabangId =
    role === "central_cabang"
      ? normalize(user.cabangId)
      : cabangParam

  const storesByCabang =
    await getAllStoresByCabang(scopeCabangId)

  // Nama toko dari master "stores" untuk sekumpulan toko. Kosong
  // berarti nama tidak diketahui dari master, sehingga Mode Rekap
  // memakai fallback dari snapshot storeName pada transaksi.
  function pickStoreNames(
    storeIds: string[],
  ): Map<string, string> {
    const names = new Map<string, string>()

    for (const storeId of storeIds) {
      names.set(
        storeId,
        storesByCabang.get(storeId)
          ?.namaStore ?? "",
      )
    }

    return names
  }

  // Untuk Central, dashboard WAJIB per toko. Toko yang diminta
  // diverifikasi di server terhadap cabang yang berwenang:
  //   central_cabang -> cabang dari users/{uid}
  //   central_pusat  -> cabang dari cabangParam
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

    // Cabang SELALU dari akun. cabangId dari client tidak pernah
    // dipercaya, sehingga Central Cabang tidak dapat membaca
    // toko cabang lain.
    const cabang = normalize(user.cabangId)

    const allowed = Array.from(
      storesByCabang.entries(),
    )
      .filter(([, master]) => master.cabangId === cabang)
      .map(([storeId]) => storeId)

    // Tanpa "store" -> REKAP seluruh toko pada cabang akun.
    if (!storeParam) {
      return {
        scope: "cabang",
        mode: "aggregate",
        storeIds: allowed,
        storeNames: pickStoreNames(allowed),
        cabangId: cabang,
      }
    }

    if (!allowed.includes(storeParam)) {
      return {
        scope: "cabang",
        mode: "detail",
        storeIds: [],
        storeNames: new Map(),
        cabangId: cabang,
        invalidStore: true,
      }
    }

    return {
      scope: "cabang",
      mode: "detail",
      storeIds: [storeParam],
      storeNames: pickStoreNames([storeParam]),
      cabangId: cabang,
    }
  }

  // CENTRAL PUSAT: cabang WAJIB ada, tidak kosong, dan tidak
  // boleh "ALL" — sudah divalidasi oleh GET sebelum fungsi ini
  // dipanggil. Tidak ada jalur "semua cabang".
  const allowed = Array.from(
    storesByCabang.entries(),
  )
    .filter(([, master]) => master.cabangId === cabangParam)
    .map(([storeId]) => storeId)

  if (!storeParam) {
    return {
      scope: "pusat",
      mode: "aggregate",
      storeIds: allowed,
      storeNames: pickStoreNames(allowed),
      cabangId: cabangParam,
    }
  }

  if (!allowed.includes(storeParam)) {
    return {
      scope: "pusat",
      mode: "detail",
      storeIds: [],
      storeNames: new Map(),
      cabangId: cabangParam,
      invalidStore: true,
    }
  }

  return {
    scope: "pusat",
    mode: "detail",
    storeIds: [storeParam],
    storeNames: pickStoreNames([storeParam]),
    cabangId: cabangParam,
  }
}

// ============================================================
// HELPERS DATA
// ============================================================

async function getEmployeeSnapshot(
  employeeId: string,
): Promise<{ name: string; storeId: string; aktif: boolean; tanggalNonaktif: string | null } | null> {
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

async function getStoreName(
  storeId: string,
): Promise<string> {
  const snapshot = await adminDb
    .collection("stores")
    .where("storeId", "==", storeId)
    .limit(1)
    .get()

  const data = snapshot.docs[0]?.data()

  return (
    cleanString(
      data?.namaStore ?? data?.nama ?? storeId,
      120,
    ) || storeId
  )
}

// ============================================================
// VALIDASI NOMINAL
// ============================================================

function parseNominal(
  value: unknown,
): number | null {
  const nominal = Number(value)

  if (
    !Number.isFinite(nominal) ||
    !Number.isInteger(nominal) ||
    nominal <= 0 ||
    nominal >= 1_000_000_000_000
  ) {
    return null
  }

  return nominal
}

function isValidNominal(
  value: unknown,
): value is number {
  return parseNominal(value) !== null
}

// ============================================================
// VALIDASI PCS
// ============================================================
//
// PCS (jumlah botol / jumlah penjualan) memakai aturan yang sama
// dengan nominal: bilangan bulat, positif, dan memakai batas atas
// yang sudah dipakai modul ini agar tidak ada batas angka baru.

function parsePcs(
  value: unknown,
): number | null {
  const pcs = Number(value)

  if (
    !Number.isFinite(pcs) ||
    !Number.isInteger(pcs) ||
    pcs <= 0 ||
    pcs >= 1_000_000_000_000
  ) {
    return null
  }

  return pcs
}

function isValidPcs(
  value: unknown,
): value is number {
  return parsePcs(value) !== null
}

// ============================================================
// BODY REALISASI
// ============================================================
//
// Mengubah field mentah dari body menjadi field penyimpanan
// sesuai jenis penjualan.
//
//   ADDITIONAL SELLING  -> nominal (Rupiah)
//   UPSIZE BOTOL        -> pcs + ukuranBotol
//   SELLING EKSKLUSIF   -> pcs + produk + namaProdukLain
//
// Selalu mengembalikan KESEMUA field di atas, dan field yang tidak
// relevan diisi string kosong. Dengan begitu perubahan jenis pada
// sebuah transaksi tidak meninggalkan data warisan yang
// menyesatkan, tanpa perlu penghapusan field.

type RealisasiFields = {
  jenis: PenjualanJenis
  nominal: number
  pcs: number
  ukuranBotol: string
  produk: string
  namaProdukLain: string
  keterangan: string
}

function parseRealisasiBody(
  body: Record<string, unknown>,
):
  | { ok: true; value: RealisasiFields }
  | { ok: false; message: string } {
  const jenis = resolveJenis(body?.jenis)
  const keterangan = cleanString(
    body?.keterangan,
    500,
  )

  if (keterangan.length > 500) {
    return {
      ok: false,
      message: "Keterangan terlalu panjang.",
    }
  }

  const kosong = {
    jenis,
    nominal: 0,
    pcs: 0,
    ukuranBotol: "",
    produk: "",
    namaProdukLain: "",
    keterangan,
  }

  if (jenis === "ADDITIONAL_SELLING") {
    if (!isValidNominal(body?.nominal)) {
      return {
        ok: false,
        message:
          "Nilai Additional Selling harus berupa bilangan bulat Rupiah yang valid.",
      }
    }

    return {
      ok: true,
      value: {
        ...kosong,
        nominal: Number(body.nominal),
      },
    }
  }

  if (!isValidPcs(body?.pcs)) {
    return {
      ok: false,
      message:
        "Jumlah PCS harus berupa bilangan bulat positif yang valid.",
    }
  }

  if (jenis === "UPSIZE_BOTOL") {
    const ukuranBotol = normalize(
      body?.ukuranBotol,
    )

    if (!isUkuranBotol(ukuranBotol)) {
      return {
        ok: false,
        message:
          "Ukuran botol tidak valid. Pilih 55 ML atau 100 ML.",
      }
    }

    return {
      ok: true,
      value: {
        ...kosong,
        pcs: Number(body.pcs),
        ukuranBotol,
      },
    }
  }

  const produk = normalize(body?.produk)

  if (!isProduk(produk)) {
    return {
      ok: false,
      message: "Produk tidak valid.",
    }
  }

  const namaProdukLain = cleanString(
    body?.namaProdukLain,
    150,
  )

  if (produk === "LAINNYA" && !namaProdukLain) {
    return {
      ok: false,
      message:
        "Nama produk wajib diisi ketika produk LAINNYA dipilih.",
    }
  }

  return {
    ok: true,
    value: {
      ...kosong,
      pcs: Number(body.pcs),
      produk,
      namaProdukLain:
        produk === "LAINNYA" ? namaProdukLain : "",
    },
  }
}

// ============================================================
// VALIDASI EMPLOYEE AVAILABILITY (pola Revisi)
// ============================================================

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
    "Gagal memproses Additional Selling:",
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

// ============================================================
// PEMBACAAN PER TOKO
// ============================================================
//
// Dipakai oleh KEDUA mode read agar perilaku baca dan urutan
// data dijamin identik.
//
// Realisasi memakai kueri per toko (storeId + rentang tanggal),
// persis seperti sebelumnya, sehingga tetap didukung composite
// index (storeId, tanggal) yang sudah aktif.
// Target juga dibaca per toko, sekarang dengan saringan periode
// langsung di kueri (storeId + periode) sehingga hanya dokumen
// pada periode yang diminta yang dibaca.

async function readStoreTransactions(
  storeId: string,
  start: string,
  end: string,
): Promise<Record<string, unknown>[]> {
  const snapshot = await adminDb
    .collection("additional_selling")
    .where("storeId", "==", storeId)
    .where("tanggal", ">=", start)
    .where("tanggal", "<", end)
    .get()

  const rows: Record<string, unknown>[] = []

  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const jenis = resolveJenis(data?.jenis)

    rows.push({
      id: doc.id,
      storeId: cleanString(data?.storeId, 100),
      cabangId: cleanString(data?.cabangId, 100),
      storeName: cleanString(data?.storeName, 120),
      employeeId: cleanString(data?.employeeId, 200),
      employeeName: cleanString(data?.employeeName, 150),
      tanggal: cleanString(data?.tanggal, 20),
      jenis,
      nominal:
        jenis === "ADDITIONAL_SELLING"
          ? typeof data?.nominal === "number"
            ? data.nominal
            : 0
          : 0,
      pcs:
        jenis === "ADDITIONAL_SELLING"
          ? 0
          : typeof data?.pcs === "number"
            ? data.pcs
            : 0,
      ukuranBotol: cleanString(
        data?.ukuranBotol,
        20,
      ),
      produk: cleanString(data?.produk, 40),
      namaProdukLain: cleanString(
        data?.namaProdukLain,
        150,
      ),
      keterangan: cleanString(data?.keterangan, 500),
      createdAt:
        data?.createdAt && typeof data.createdAt.toDate === "function"
          ? data.createdAt.toDate().toISOString()
          : null,
      updatedAt:
        data?.updatedAt && typeof data.updatedAt.toDate === "function"
          ? data.updatedAt.toDate().toISOString()
          : null,
    })
  })

  return rows
}

async function readStoreTargets(
  storeId: string,
  periode: string,
): Promise<Record<string, unknown>[]> {
  const snapshot = await adminDb
    .collection("additional_selling_targets")
    .where("storeId", "==", storeId)
    .where("periode", "==", periode)
    .get()

  const rows: Record<string, unknown>[] = []

  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const jenis = resolveJenis(data?.jenis)

    rows.push({
      id: doc.id,
      storeId: cleanString(data?.storeId, 100),
      cabangId: cleanString(data?.cabangId, 100),
      employeeId: cleanString(data?.employeeId, 200),
      employeeName: cleanString(data?.employeeName, 150),
      periode: cleanString(data?.periode, 20),
      jenis,
      targetNominal:
        jenis === "ADDITIONAL_SELLING"
          ? typeof data?.targetNominal === "number"
            ? data.targetNominal
            : 0
          : 0,
      targetPcs:
        jenis === "ADDITIONAL_SELLING"
          ? 0
          : typeof data?.targetPcs === "number"
            ? data.targetPcs
            : 0,
    })
  })

  return rows
}

// ============================================================
// AGREGASI PER (KARYAWAN + JENIS)
// ============================================================
//
// Aturan ini DIPAKAI OLEH KEDUA MODE read supaya perhitungan,
// pembulatan, dan pembedaan "target belum dibuat" tidak mungkin
// berbeda antara Mode Detail Toko dan Mode Rekap Central.
//
// Seluruh perhitungan dilakukan per (karyawan + jenis target):
//   - Pencapaian = total realisasi pada employee + jenis +
//     periode berjalan. Realisasi yang dibuat SEBELUM target
//     ada tetap ikut terhitung karena agregasi membaca
//     seluruh transaksi pada periode tersebut.
//   - "Target belum dibuat" dibedakan dari "target 0".
//     Bila target belum ada, hasTarget = false dan
//     pencapaian maupun progress tidak ditampilkan.
//   - Progress TIDAK dibatasi 100%. Pencapaian yang melebihi
//     target menghasilkan progress di atas 100%.
//   - Pembulatan memakai Math.round, sama seperti modul ini
//     sebelumnya.

function aggregateByJenis(
  transactions: Record<string, unknown>[],
  targets: Record<string, unknown>[],
): Record<string, Record<string, unknown>> {
  const nameByEmployee =
    new Map<string, string>()
  const achievementByKey =
    new Map<string, number>()
  const targetByKey =
    new Map<string, number>()

  // Nama karyawan diambil dari target bila tersedia. Karyawan
  // yang belum punya target tetap harus tampil, sehingga nama
  // dari realisasi dipakai sebagai cadangan.
  for (const target of targets) {
    const employeeId =
      String(target.employeeId ?? "")

    if (!employeeId) {
      continue
    }

    if (!nameByEmployee.has(employeeId)) {
      nameByEmployee.set(
        employeeId,
        String(target.employeeName ?? "-"),
      )
    }

    targetByKey.set(
      `${employeeId}|${String(target.jenis)}`,
      target.jenis === "ADDITIONAL_SELLING"
        ? typeof target.targetNominal ===
            "number"
          ? target.targetNominal
          : 0
        : typeof target.targetPcs === "number"
          ? target.targetPcs
          : 0,
    )
  }

  for (const txn of transactions) {
    const employeeId =
      String(txn.employeeId ?? "")

    if (!employeeId) {
      continue
    }

    const jenis = String(txn.jenis)

    const achievement =
      jenis === "ADDITIONAL_SELLING"
        ? typeof txn.nominal === "number"
          ? txn.nominal
          : 0
        : typeof txn.pcs === "number"
          ? txn.pcs
          : 0

    const key = `${employeeId}|${jenis}`

    achievementByKey.set(
      key,
      (achievementByKey.get(key) ?? 0) +
        achievement,
    )

    if (!nameByEmployee.has(employeeId)) {
      nameByEmployee.set(
        employeeId,
        String(txn.employeeName ?? "-"),
      )
    }
  }

  // Universe karyawan: seluruh karyawan yang punya target ATAU
  // punya realisasi pada periode ini, tanpa memandang jenis.
  // Karyawan tanpa target untuk suatu jenis TIDAK menghilangkan
  // data target karyawan lain pada jenis yang sama.
  const employeeIds = new Set<string>()

  for (const target of targets) {
    const employeeId =
      String(target.employeeId ?? "")
    if (employeeId) {
      employeeIds.add(employeeId)
    }
  }

  for (const txn of transactions) {
    const employeeId =
      String(txn.employeeId ?? "")
    if (employeeId) {
      employeeIds.add(employeeId)
    }
  }

  const byJenis: Record<
    string,
    Record<string, unknown>
  > = {}

  for (const jenis of JENIS_LIST) {
    const perEmployee = Array.from(employeeIds)
      .map((employeeId) => {
        const key = `${employeeId}|${jenis}`

        const hasTarget = targetByKey.has(key)
        const target = targetByKey.get(key) ?? 0
        const achievement =
          achievementByKey.get(key) ?? 0

        const progress =
          hasTarget && target > 0
            ? Math.round(
                (achievement / target) * 100,
              )
            : 0

        return {
          employeeId,
          employeeName:
            nameByEmployee.get(employeeId) ?? "-",
          hasTarget,
          target,
          achievement,
          progress,
        }
      })
      .sort((a, b) =>
        a.employeeName.localeCompare(
          b.employeeName,
          "id",
          { sensitivity: "base" },
        ),
      )

    // Total hanya menghitung karyawan yang targetnya sudah
    // dibuat, konsisten dengan aturan bahwa realisasi tanpa
    // target tidak menampilkan capaian.
    const withTarget = perEmployee.filter(
      (row) => row.hasTarget,
    )

    const totalTarget = withTarget.reduce(
      (total, row) => total + row.target,
      0,
    )

    const totalAchievement =
      withTarget.reduce(
        (total, row) => total + row.achievement,
        0,
      )

    const progress =
      totalTarget > 0
        ? Math.round(
            (totalAchievement / totalTarget) * 100,
          )
        : 0

    byJenis[jenis] = {
      totalTarget,
      totalAchievement,
      progress,
      totalEmployees: perEmployee.length,
      employeesWithoutTarget:
        perEmployee.length - withTarget.length,
      perEmployee,
    }
  }

  return byJenis
}

// ============================================================
// GET — DASHBOARD + REALISASI + TARGET
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
      return NextResponse.json(
        {
          success: false,
          message: "Anda tidak memiliki izin.",
        },
        { status: 403 },
      )
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
      return NextResponse.json(
        {
          success: false,
          message: "Periode tidak valid.",
        },
        { status: 400 },
      )
    }

    const { periode, start, end } = buildPeriod(year, month)

    // CENTRAL PUSAT wajib memilih SATU cabang.
    let cabangParam = ""
    if (role === "central_pusat") {
      cabangParam = normalize(
        url.searchParams.get("cabang") ?? "",
      )

      if (
        !cabangParam ||
        cabangParam === "ALL" ||
        cabangParam === "__ALL__"
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Central Pusat wajib memilih satu cabang untuk melihat Additional Selling.",
          },
          { status: 400 },
        )
      }
    }

    // Toko yang diminta Central. Untuk role Store parameter ini
    // DIABAIKAN di dalam scopeForRole (scope tetap user.storeId).
    const storeParam = cleanString(
      url.searchParams.get("store") ?? "",
      100,
    )

    const scope = await scopeForRole(
      user,
      cabangParam,
      storeParam,
    )

    // Toko di luar scope akun/branch → tolak request, jangan
    // kembalikan data toko tersebut.
    if (scope.invalidStore) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko yang dipilih tidak berada dalam cakupan akun Anda.",
        },
        { status: 403 },
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
    // MODE REKAP CENTRAL (aggregate, tanpa store)
    // =====================================================
    //
    // Dipakai hanya oleh Central (Central Cabang tanpa store,
    // Central Pusat dengan cabang valid tanpa store). Agregasi
    // dihitung per toko lalu digabung, dan yang dikirim ke
    // browser HANYA rekap per toko — bukan daftar transaksi
    // dan bukan daftar target semua toko.
    //
    // Scope SELALU satu cabang:
    //   central_cabang -> user.cabangId
    //   central_pusat  -> param "cabang"
    // Tidak pernah membaca seluruh cabang / seluruh perusahaan.

    if (mode === "aggregate") {
      const stores: Record<string, unknown>[] = []

      const totals = new Map<
        PenjualanJenis,
        {
          storesWithTarget: number
          totalTarget: number
          totalAchievement: number
        }
      >()

      for (const jenis of JENIS_LIST) {
        totals.set(jenis, {
          storesWithTarget: 0,
          totalTarget: 0,
          totalAchievement: 0,
        })
      }

      for (const storeId of storeIds) {
        const storeTransactions =
          await readStoreTransactions(
            storeId,
            start,
            end,
          )

        const storeTargets =
          await readStoreTargets(storeId, periode)

        // Aturan agregasi IDENTIK dengan mode detail.
        const storeByJenis = aggregateByJenis(
          storeTransactions,
          storeTargets,
        )

        const row: {
          storeId: string
          storeName: string
          hasTarget: boolean
          totalEmployees: number
          employeesWithoutTarget: number
          byJenis: Record<string, Record<string, unknown>>
        } = {
          storeId,
          // Nama toko dari master "stores"; fallback ke snapshot
          // storeName pada transaksi, lalu ke storeId. Tidak ada
          // field baru di Firestore untuk ini.
          storeName:
            storeNames.get(storeId) ||
            cleanString(
              storeTransactions[0]?.storeName,
              120,
            ) ||
            storeId,
          // true bila toko sudah mempunyai target untuk
          // setidaknya satu jenis pada periode ini.
          hasTarget: false,
          totalEmployees: 0,
          employeesWithoutTarget: 0,
          byJenis: {},
        }

        for (const jenis of JENIS_LIST) {
          const cell = storeByJenis[jenis] ?? {}

          // "Target belum dibuat" pada tingkat TOKO + JENIS
          // berarti tidak ada satu pun karyawan toko ini yang
          // mempunyai target untuk jenis tersebut. Target yang
          // ADA tetapi bernilai 0 tetap menghasilkan
          // hasTarget = true.
          const perEmployee = Array.isArray(
            cell.perEmployee,
          )
            ? (cell.perEmployee as Record<
                string,
                unknown
              >[])
            : []

          const hasTarget = perEmployee.some(
            (row) => row.hasTarget === true,
          )

          const totalTarget =
            typeof cell.totalTarget === "number"
              ? cell.totalTarget
              : 0
          const totalAchievement =
            typeof cell.totalAchievement === "number"
              ? cell.totalAchievement
              : 0
          const progress =
            typeof cell.progress === "number"
              ? cell.progress
              : 0

          row.byJenis[jenis] = {
            hasTarget,
            totalTarget,
            totalAchievement,
            progress,
          }

          if (jenis === JENIS_LIST[0]) {
            row.totalEmployees =
              typeof cell.totalEmployees === "number"
                ? cell.totalEmployees
                : 0
            row.employeesWithoutTarget =
              typeof cell.employeesWithoutTarget ===
                "number"
                ? cell.employeesWithoutTarget
                : 0
          }

          if (hasTarget) {
            row.hasTarget = true

            const bucket = totals.get(jenis)
            if (bucket) {
              bucket.storesWithTarget += 1
              bucket.totalTarget += totalTarget
              bucket.totalAchievement += totalAchievement
            }
          }
        }

        stores.push(row)
      }

      const summaryByJenis: Record<
        string,
        Record<string, unknown>
      > = {}

      for (const jenis of JENIS_LIST) {
        const bucket = totals.get(jenis)

        const totalTarget = bucket?.totalTarget ?? 0
        const totalAchievement =
          bucket?.totalAchievement ?? 0
        const storesWithTarget =
          bucket?.storesWithTarget ?? 0

        summaryByJenis[jenis] = {
          // true bila ADA toko dalam scope yang sudah
          // mempunyai target jenis ini.
          hasTarget: storesWithTarget > 0,
          totalTarget,
          totalAchievement,
          progress:
            totalTarget > 0
              ? Math.round(
                  (totalAchievement / totalTarget) * 100,
                )
              : 0,
          totalStores: storeIds.length,
          storesWithTarget,
          // Toko dalam scope yang belum mempunyai target jenis
          // ini — berbeda dari toko yang punya target bernilai 0.
          storesWithoutTarget:
            storeIds.length - storesWithTarget,
        }
      }

      return NextResponse.json({
        success: true,
        periode,
        mode: "aggregate",
        scope: {
          role,
          level: scopeLevel,
          cabangId: scopeCabangId,
          totalStores: storeIds.length,
        },
        stores,
        summary: {
          byJenis: summaryByJenis,
        },
      })
    }

    // =====================================================
    // MODE DETAIL TOKO — bentuk response tidak berubah
    // =====================================================

    if (storeIds.length === 0) {
      return NextResponse.json({
        success: true,
        periode,
        transactions: [],
        targets: [],
        summary: {
          byJenis: emptyByJenis(),
        },
      })
    }

    const transactions: Record<string, unknown>[] = []

    for (const storeId of storeIds) {
      transactions.push(
        ...(await readStoreTransactions(
          storeId,
          start,
          end,
        )),
      )
    }

    const targets: Record<string, unknown>[] = []

    for (const storeId of storeIds) {
      targets.push(
        ...(await readStoreTargets(storeId, periode)),
      )
    }

    // SUMMARY (agregasi di server)
    const byJenis = aggregateByJenis(
      transactions,
      targets,
    )

    transactions.sort((a, b) => {
      const ta = String(a.tanggal ?? "")
      const tb = String(b.tanggal ?? "")
      if (ta !== tb) {
        return ta < tb ? -1 : 1
      }
      const ca = String(a.createdAt ?? "")
      const cb = String(b.createdAt ?? "")
      return ca < cb ? -1 : ca > cb ? 1 : 0
    })

    return NextResponse.json({
      success: true,
      periode,
      transactions,
      targets,
      summary: {
        byJenis,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// POST — MEMBUAT REALISASI (khusus STORE)
// ============================================================

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mencatat penjualan.",
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

    const tanggal = cleanString(body?.tanggal, 20)
    const employeeId = cleanString(body?.employeeId, 200)

    if (!isValidDateISO(tanggal) || !employeeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tanggal dan Nama Tim wajib diisi dengan benar.",
        },
        { status: 400 },
      )
    }

    const realisasi = parseRealisasiBody(body)

    if (!realisasi.ok) {
      return NextResponse.json(
        {
          success: false,
          message: realisasi.message,
        },
        { status: 400 },
      )
    }

    // Validasi ketersediaan employee pada tanggal pencatatan.
    const employee = await getEmployeeSnapshot(employeeId)

    if (
      !employee ||
      !employeeAvailableAt(
        employee,
        storeId,
        tanggal,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee tidak tersedia pada tanggal pencatatan yang dipilih.",
        },
        { status: 400 },
      )
    }

    const storeName = await getStoreName(storeId)

    const docRef = await adminDb
      .collection("additional_selling")
      .add({
        storeId,
        cabangId,
        storeName,
        employeeId,
        employeeName: employee.name,
        tanggal,
        ...realisasi.value,
        createdBy: { uid: user.uid },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message:
          "Realisasi berhasil disimpan.",
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// PATCH — MENGUBAH REALISASI milik Store sendiri
// ============================================================

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mengubah realisasi penjualan.",
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

    const id = cleanString(body?.id, 200)
    const tanggal = cleanString(body?.tanggal, 20)
    const employeeId = cleanString(body?.employeeId, 200)

    if (
      !id ||
      !isValidDateISO(tanggal) ||
      !employeeId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data realisasi tidak valid.",
        },
        { status: 400 },
      )
    }
    const realisasi = parseRealisasiBody(body)

    if (!realisasi.ok) {
      return NextResponse.json(
        {
          success: false,
          message: realisasi.message,
        },
        { status: 400 },
      )
    }

    const docRef = adminDb
      .collection("additional_selling")
      .doc(id)

    const docSnapshot = await docRef.get()
    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Realisasi tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const current = docSnapshot.data() ?? {}

    if (cleanString(current?.storeId, 100) !== storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat mengubah realisasi pada toko Anda.",
        },
        { status: 403 },
      )
    }

    // Validasi ketersediaan employee pada tanggal baru.
    const employee = await getEmployeeSnapshot(employeeId)

    if (
      !employee ||
      !employeeAvailableAt(
        employee,
        storeId,
        tanggal,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee tidak tersedia pada tanggal pencatatan yang dipilih.",
        },
        { status: 400 },
      )
    }

    const storeName = await getStoreName(storeId)

    await docRef.update({
      storeName,
      cabangId,
      employeeId,
      employeeName: employee.name,
      tanggal,
      ...realisasi.value,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json(
      {
        success: true,
        message:
          "Realisasi berhasil diperbarui.",
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// DELETE — MENGHAPUS REALISASI milik Store sendiri
// ============================================================

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat menghapus realisasi penjualan.",
        },
        { status: 403 },
      )
    }

    const storeId = user.storeId

    if (!storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Store belum memiliki data toko yang valid.",
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

    const id = cleanString(body?.id, 200)

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Data realisasi tidak valid.",
        },
        { status: 400 },
      )
    }

    const docRef = adminDb
      .collection("additional_selling")
      .doc(id)

    const docSnapshot = await docRef.get()

    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message: "Realisasi tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const current = docSnapshot.data() ?? {}

    if (cleanString(current?.storeId, 100) !== storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat menghapus realisasi pada toko Anda.",
        },
        { status: 403 },
      )
    }

    await docRef.delete()

    return NextResponse.json(
      {
        success: true,
        message:
          "Realisasi berhasil dihapus.",
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
