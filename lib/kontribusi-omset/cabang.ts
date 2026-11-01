// Pemetaan kode cabang ke nama cabang untuk fitur Kontribusi Omset.
// Sumber nama cabang tetap berasal dari identitas cabang (cabangId)
// yang terhubung dengan akun/toko yang sedang diproses.

export const KONTRIBUSI_CABANG_NAMES: Record<string, string> = {
  "bgr-1": "Bogor dan Banten",
  "cjr-01": "Cianjur dan Cipanas",
}

export function getCabangDisplayName(
  cabangId: string | null | undefined,
  namaFallback?: string | null,
): string {
  const normalized = String(cabangId ?? "").trim().toLowerCase()
  const fallback = String(namaFallback ?? "").trim()

  if (!normalized) {
    return fallback
  }

  return KONTRIBUSI_CABANG_NAMES[normalized] || fallback || ""
}
