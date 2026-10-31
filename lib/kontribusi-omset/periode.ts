// ============================================================
// PERIODE SERVER (Asia/Jakarta)
//
// Periode berjalan versi SERVER memakai zona waktu EKSPLISIT
// Asia/Jakarta (WIB, UTC+7) — bukan zona waktu OS/server, karena
// runtime produksi dapat berjalan di UTC (pergantian bulan pada
// 00:00-06:59 WIB sebelumnya salah klasifikasi bila memakai jam
// server). Year/month diambil lewat Intl; format keluaran YYYY-MM.
//
// FAIL-CLOSED: bila zona waktu/Intl tidak tersedia atau hasilnya
// tidak valid, fungsi melempar PERIODE_UNAVAILABLE. Tidak ada
// sentinel seperti "0000-01" — nilai seperti itu justru dapat
// meloloskan periode lampau pada pengecekan POST karena setiap
// periode nyata diurutkan lebih besar darinya.
// ============================================================

const PERIODE_INTL_OPTIONS: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
}

export function currentPeriode(): string {
  let parts: Intl.DateTimeFormatPart[]

  try {
    // Formatter dibuat per pemanggilan (bukan level modul) agar
    // kegagalan lingkungan Intl tertangkap di sini sebagai error
    // yang dapat diuji, bukan kegagalan import modul.
    parts = new Intl.DateTimeFormat(
      "en-CA",
      PERIODE_INTL_OPTIONS,
    ).formatToParts(new Date())
  } catch {
    throw new Error("PERIODE_UNAVAILABLE")
  }

  const year =
    parts.find((part) => part.type === "year")?.value ?? ""
  const month =
    parts.find((part) => part.type === "month")?.value ?? ""

  if (
    !/^\d{4}$/.test(year) ||
    !/^(0[1-9]|1[0-2])$/.test(month)
  ) {
    throw new Error("PERIODE_UNAVAILABLE")
  }

  return `${year}-${month}`
}
