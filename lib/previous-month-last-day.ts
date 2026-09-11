// ============================================================
// PREVIOUS MONTH LAST DAY — INPUT ROTASI GENERATOR
//
// Logika MURNI (tanpa Firebase) untuk menyediakan input
// "previousMonthLastDay" bagi generator "Buat Jadwal Otomatis".
//
// Sumber: JADWAL FINAL pada hari terakhir bulan sebelumnya
// (collection "schedules"). HANYA assignment shift yang dipakai
// sebagai arah rotasi; status non-shift (libur, cuti, izin,
// sakit, status_khusus) diabaikan. Employee tanpa jadwal final
// pada hari tersebut tidak menghasilkan entry.
//
// Modul ini TIDAK membaca Firestore. Pembacaan dilakukan oleh
// layer data (lib/firestore-data.ts); modul ini bertanggung
// jawab atas perhitungan tanggal dan pemetaan hasil.
//
// Konvensi tanggal: string ISO "YYYY-MM-DD". month 0-based
// (0 = Januari ... 11 = Desember), konsisten dengan app.
// ============================================================

export type PreviousMonthShift = "shift_pagi" | "shift_siang"

// Struktural kompatibel dengan input `previousMonthLastDay`
// pada lib/generate-schedule.ts (subset dari nilai status).
export type PreviousMonthLastDayMap = Readonly<
  Record<string, PreviousMonthShift>
>

export interface PreviousMonthScheduleFragment {
  employeeId: string
  status: string
}

// ============================================================
// HELPERS TANGGAL (murni, tanpa Date/Intl)
// ============================================================

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
      return isLeapYear(year) ? 29 : 28
    case 3:
    case 5:
    case 8:
    case 10:
      return 30
    default:
      return 31
  }
}

// Hari TERAKHIR bulan SEBELUM month yang sedang dibuat jadwalnya.
// year/month adalah bulan BERJALAN (current month, 0-based).
//
// Contoh:
//   (2026, 0) -> "2025-12-31"  (Januari, rollover ke tahun lalu)
//   (2026, 1) -> "2026-01-31"  (Februari -> Januari)
//   (2024, 2) -> "2024-02-29"  (Maret 2024 -> Februari kabisat)
//   (2025, 2) -> "2025-02-28"  (Maret 2025 -> Februari non-kabisat)
export function previousMonthLastDayDate(year: number, month: number): string {
  if (month <= 0) {
    return `${year - 1}-12-31`
  }
  const lastDay = daysInMonth(year, month - 1)
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
}

// ============================================================
// PEMETAAN JADWAL FINAL -> PREVIOUS MONTH LAST DAY
// ============================================================

// Hanya shift yang menjadi arah rotasi; non-shift diabaikan.
// Struktur dokumen selain status/employeeId tidak dibutuhkan.
export function toPreviousMonthLastDayMap(
  schedules: readonly PreviousMonthScheduleFragment[],
): PreviousMonthLastDayMap {
  const result: Record<string, PreviousMonthShift> = {}

  for (const schedule of schedules) {
    if (schedule.status === "shift_pagi" || schedule.status === "shift_siang") {
      result[schedule.employeeId] = schedule.status
    }
  }

  return result
}