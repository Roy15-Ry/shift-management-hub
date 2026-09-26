// ============================================================
// MONITORING ERROR — KODE MASTER
// ============================================================
//
// Modul mandiri di bawah PROGRAM KERJA. File ini SATU-SATUNYA
// sumber kebenaran untuk daftar jenis error, daftar keterangan
// per jenis, dan nilai LAINNYA.
//
// Aturan:
//   - TEPAT 5 jenis error.
//   - TEPAT 3 pilihan keterangan utama per jenis + LAINNYA.
//   - Daftar TIDAK boleh ditambah, dikurangi, diganti, atau
//     diarang di tempat lain. Semua penyusun UI dan API route
//     WAJIB mengimpor dari file ini.
//
// String yang disimpan di Firestore memakai nilai kanonik di
// bawah (huruf kapital). Keterangan Manual HANYA dipakai saat
// keterangan bernilai LAINNYA.
//
// Modul ini murni data — aman diimpor baik oleh client
// component maupun server (Admin SDK).
// ============================================================

// ============================================================
// JENIS ERROR
// ============================================================

export const MONITORING_ERROR_JENIS_LIST = [
  "HAPUS TRANSAKSI",
  "KOMPLAIN",
  "ERROR PERACIKAN",
  "ERROR KASIR",
  "ERROR OPERASIONAL",
] as const

export type MonitoringErrorJenis =
  (typeof MONITORING_ERROR_JENIS_LIST)[number]

// Label ringkas untuk judul kolom dashboard. Nilai store tetap
// memakai nilai kanonik di atas.
export const MONITORING_ERROR_JENIS_LABEL: Record<
  MonitoringErrorJenis,
  string
> = {
  "HAPUS TRANSAKSI": "Hapus Transaksi",
  KOMPLAIN: "Komplain",
  "ERROR PERACIKAN": "Error Peracikan",
  "ERROR KASIR": "Error Kasir",
  "ERROR OPERASIONAL": "Error Operasional",
}

// ============================================================
// KETERANGAN
// ============================================================

export const MONITORING_ERROR_KETERANGAN_LAINNYA = "LAINNYA"

// TEPAT 3 keterangan utama per jenis. "LAINNYA" TIDAK
// ikut di dalam daftar ini; ia ditambahkan otomatis oleh
// getMonitoringErrorKeteranganOptions().
export const MONITORING_ERROR_KETERANGAN_BY_JENIS: Record<
  MonitoringErrorJenis,
  readonly string[]
> = {
  "HAPUS TRANSAKSI": [
    "LUPA INPUT MEMBER",
    "SALAH INPUT BARANG CAIR / PADAT",
    "SALAH PILIHAN KUALITAS",
  ],
  KOMPLAIN: [
    "PELAYANAN TIDAK RAMAH",
    "PRODUK TIDAK SESUAI AKIBAT SALAH PRODUKSI",
    "GROOMING TIDAK SESUAI",
  ],
  "ERROR PERACIKAN": [
    "PECAH BOTOL",
    "SALAH ISI AROMA",
    "SALAH KUALITAS",
  ],
  "ERROR KASIR": [
    "SALAH ISI KASIR / PRAMUNIAGA",
    "SALAH INPUT KUALITAS",
    "SALAH INPUT UKURAN BOTOL",
  ],
  "ERROR OPERASIONAL": [
    "MENUMPAHKAN PARFUM",
    "MENUMPAHKAN PENCUCI",
    "MEMECAHKAN BOTOL PADA SAAT PASANG STICKER",
  ],
}

// ============================================================
// TYPE DOKUMEN
// ============================================================

export type MonitoringErrorRecord = {
  id: string
  storeId: string
  cabangId: string
  storeName: string
  employeeId: string
  employeeName: string
  tanggal: string
  jenisError: MonitoringErrorJenis
  keterangan: string
  keteranganManual: string
  createdAt: string | null
  updatedAt: string | null
}

export type MonitoringErrorEmployeeRow = {
  employeeId: string
  employeeName: string
  byJenis: Record<MonitoringErrorJenis, number>
  total: number
}

export type MonitoringErrorRowByJenis = Record<
  MonitoringErrorJenis,
  number
>

// ============================================================
// HELPER
// ============================================================

export function isMonitoringErrorJenis(
  value: unknown,
): value is MonitoringErrorJenis {
  return MONITORING_ERROR_JENIS_LIST.includes(
    value as MonitoringErrorJenis,
  )
}

export function getMonitoringErrorKeterangan(
  jenis: MonitoringErrorJenis,
): readonly string[] {
  return MONITORING_ERROR_KETERANGAN_BY_JENIS[jenis] ?? []
}

// Opsi dropdown: 3 keterangan utama + LAINNYA.
export function getMonitoringErrorKeteranganOptions(
  jenis: MonitoringErrorJenis,
): string[] {
  return [
    ...getMonitoringErrorKeterangan(jenis),
    MONITORING_ERROR_KETERANGAN_LAINNYA,
  ]
}

export function isMonitoringErrorLainnya(
  keterangan: string,
): boolean {
  return (
    keterangan.trim().toUpperCase() ===
    MONITORING_ERROR_KETERANGAN_LAINNYA
  )
}

// Keterangan valid bila termasuk 3 pilihan utama jenis tsb
// atau bernilai LAINNYA.
export function isMonitoringErrorKeteranganValid(
  jenis: MonitoringErrorJenis,
  keterangan: string,
): boolean {
  const value = keterangan.trim().toUpperCase()

  if (!value) {
    return false
  }

  if (value === MONITORING_ERROR_KETERANGAN_LAINNYA) {
    return true
  }

  return getMonitoringErrorKeterangan(jenis).some(
    (item) => item.toUpperCase() === value,
  )
}

export function emptyRowByJenis(): MonitoringErrorRowByJenis {
  return {
    "HAPUS TRANSAKSI": 0,
    KOMPLAIN: 0,
    "ERROR PERACIKAN": 0,
    "ERROR KASIR": 0,
    "ERROR OPERASIONAL": 0,
  }
}
