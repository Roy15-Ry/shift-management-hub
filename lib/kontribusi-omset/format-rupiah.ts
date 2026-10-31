export function parseRupiahInput(value: string): number {
  // Format Rupiah Indonesia: titik sebagai pemisah ribuan, koma sebagai pemisah desimal.
  // Hapus "Rp", spasi, dan karakter non-angka non-pemisah.
  let cleaned = value.replace(/[^,\d.-]/g, "")
  if (!cleaned) {
    return 0
  }

  // Nilai negatif tidak diizinkan
  if (cleaned.includes("-")) {
    return 0
  }

  // Jika ada koma, tratt comma sebagai pemisah desimal (format Indonesia)
  if (cleaned.includes(",")) {
    const parts = cleaned.split(",")
    const integerPart = parts[0].replace(/\./g, "") // Hapus titik ribuan di bagian integer
    const decimalPart = parts.slice(1).join("")     // Semua setelah koma pertama
    const normalized = `${integerPart}.${decimalPart}`
    const num = Number(normalized)
    return Number.isFinite(num) ? num : 0
  }

  // Tanpa koma: analisis titik
  const dotParts = cleaned.split(".")

  let normalized: string

  if (dotParts.length > 2) {
    // Banyak titik: semua adalah pemisah ribuan (contoh: 1.250.000)
    normalized = dotParts.join("")
  } else if (dotParts.length === 2) {
    const [intPart, decPart] = dotParts
    if (decPart.length === 3) {
      // Ambig: "50.000" bisa ribuan (50000) atau desimal 3 digit (50.000)
      // Perlakukan sebagai pemisah ribuan karena format Indonesia lebih dominan
      normalized = intPart + decPart
    } else {
      // Titik sebagai pemisah desimal (contoh: 50000.5)
      normalized = cleaned
    }
  } else {
    // Tanpa titik: angka biasa
    normalized = cleaned
  }

  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

export function formatRupiahNumber(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  return `Rp${safe.toLocaleString("id-ID")}`
}

export function formatDigitsWithThousandSeparators(digits: string): string {
  if (!digits) return ""
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}
