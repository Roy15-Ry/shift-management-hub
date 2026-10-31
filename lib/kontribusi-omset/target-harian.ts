// ============================================================
// TARGET HARIAN DINAMIS — Perhitungan murni (tanpa Firestore)
//
// Opsi A:
//   sisaTarget = max(0, targetBulanan - realisasiBulanan)
//   targetHarian = sisaTarget / sisaHari
//
// Semua perhitungan memakai zona waktu Asia/Jakarta.
// Tidak ada operasi tulis/baca Firestore di sini.
// ============================================================

const PERIODE_INTL_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}

export interface LaporanHarianRingkas {
  tanggal: string // YYYY-MM-DD
  totalOmset: number
}

/**
 * Tanggal lokal hari ini dalam zona waktu Asia/Jakarta.
 * Mengembalikan null bila Intl tidak tersedia atau hasil tidak valid.
 */
export function getTodayJakarta(): {
  year: number
  month: number
  date: number
} | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", PERIODE_INTL_OPTIONS).formatToParts(
      new Date(),
    )
    const year =
      Number(parts.find((p) => p.type === "year")?.value ?? 0)
    const month =
      Number(parts.find((p) => p.type === "month")?.value ?? 0) - 1
    const date =
      Number(parts.find((p) => p.type === "day")?.value ?? 0)
    if (!year || month < 0 || month > 11 || !date || date < 1) {
      return null
    }
    return { year, month, date }
  } catch {
    return null
  }
}

/**
 * Jumlah hari kalender dalam sebuah bulan.
 */
export function getDaysInMonth(tahun: number, bulan: number): number {
  return new Date(tahun, bulan + 1, 0).getDate()
}

/**
 * Sisa hari kalender dari tanggal lokal hari ini sampai akhir bulan,
 * dengan hari ini termasuk bila masih berlangsung.
 * Mengembalikan 0 jika periode bukan bulan berjalan atau tidak ada data hari.
 */
export function hitungSisaHari(
  tahun: number,
  bulan: number,
  today: { year: number; month: number; date: number } | null,
): number {
  if (!today) {
    return 0
  }
  if (today.year !== tahun || today.month !== bulan) {
    return 0
  }
  const daysInMonth = getDaysInMonth(tahun, bulan)
  const sisa = daysInMonth - today.date + 1
  return sisa < 0 ? 0 : sisa
}

/**
 * Sisa target bulanan = max(0, targetBulanan - realisasiBulanan).
 * RealisasiBulanan mencakup semua tanggal dalam periode, termasuk hari ini.
 * Mengembalikan null jika target bulanan tidak tersedia.
 * Nilai negatif diklubikan menjadi 0 (tidak ada target harian negatif).
 */
export function hitungSisaTarget(
  targetBulanan: number | null,
  realisasiBulanan: number,
): number | null {
  if (targetBulanan === null) {
    return null
  }
  return Math.max(0, targetBulanan - realisasiBulanan)
}

/**
 * Target harian dinamis = sisaTarget / sisaHari.
 * Mengembalikan 0 jika sisaHari <= 0 (hindari pembagian dengan nol).
 * Mengembalikan null jika sisaTarget null.
 */
export function hitungTargetHarian(
  sisaTarget: number | null,
  sisaHari: number,
): number | null {
  if (sisaTarget === null) {
    return null
  }
  if (sisaHari <= 0) {
    return 0
  }
  return sisaTarget / sisaHari
}

/**
 * Realisasi total bulan ini (semua tanggal dalam periode yang sama, termasuk hari ini).
 * Digunakan untuk perhitungan sisa target dan KPI Realisasi Bulanan.
 */
export function hitungRealisasiBulanan(
  reports: LaporanHarianRingkas[],
): number {
  return reports.reduce((sum, report) => sum + (Number(report.totalOmset) || 0), 0)
}

/**
 * Target harian individu per karyawan = targetHarianAcuan / jumlahKaryawan.
 * targetHarianAcuan adalah nilai target harian toko yang menjadi acuan
 * (nilai dinamis yang tertangkap saat target dimuat, tidak berubah ketika
 * realisasi diinput/diedit/dibatalkan).
 * Digunakan untuk alokasi target harian ke setiap karyawan aktif.
 * Mengembalikan null jika target acuan tidak tersedia.
 * Mengembalikan 0 jika jumlah karyawan <= 0.
 */
export function hitungTargetHarianIndividu(
  targetHarianAcuan: number | null,
  jumlahKaryawan: number,
): number | null {
  if (targetHarianAcuan === null) {
    return null
  }
  if (jumlahKaryawan <= 0) {
    return 0
  }
  return targetHarianAcuan / jumlahKaryawan
}

/**
 * Selisih persentase terhadap target = pencapaianPersen - 100.
 * Positif berarti melebihi target, negatif berarti belum mencapai.
 * Mengembalikan null jika pencapaian persen tidak tersedia.
 */
export function hitungSelisihPersentase(
  pencapaianPersen: number | null,
): number | null {
  if (pencapaianPersen === null) {
    return null
  }
  return pencapaianPersen - 100
}

/**
 * Apakah tanggal (YYYY-MM-DD) adalah hari ini atau lebih depan,
 * dalam zona waktu Asia/Jakarta.
 */
export function isDateTodayOrFuture(
  tanggal: string,
  today: { year: number; month: number; date: number } | null,
): boolean {
  if (!today) {
    return false
  }
  const [y, m, d] = tanggal.split("-").map(Number)
  return (
    y > today.year ||
    (y === today.year && m > today.month + 1) ||
    (y === today.year && m === today.month + 1 && d >= today.date)
  )
}

/**
 * Periode (YYYY-MM) hari ini dalam zona waktu Asia/Jakarta.
 */
export function getTodayPeriode(
  today: { year: number; month: number; date: number } | null,
): string | null {
  if (!today) {
    return null
  }
  return `${today.year}-${String(today.month + 1).padStart(2, "0")}`
}
