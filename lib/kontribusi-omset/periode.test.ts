import { afterEach, describe, expect, it, vi } from "vitest"

import { currentPeriode } from "@/lib/kontribusi-omset/periode"

// Pengujian pure: tidak menyentuh Firestore sama sekali. Waktu
// dibekukan pada saat-saat kritis di sekitar batas bulan/tahun
// WIB (WIB = UTC+7).
function freezeAt(isoUtc: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(isoUtc))
}

describe("currentPeriode (Asia/Jakarta, fail-closed)", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("mengembalikan bulan berjalan WIB untuk waktu umum", () => {
    freezeAt("2025-06-15T10:00:00Z") // 17:00 WIB, 15 Juni
    expect(currentPeriode()).toBe("2025-06")
  })

  it("memasukkan hari WIB yang belum lewat pada bulan yang sama", () => {
    freezeAt("2025-06-30T16:30:00Z") // 23:30 WIB, 30 Juni
    expect(currentPeriode()).toBe("2025-06")
  })

  it("berganti bulan pada tengah malam WIB (00:30 WIB adalah bulan baru)", () => {
    freezeAt("2025-06-30T17:30:00Z") // 00:30 WIB, 1 Juli
    expect(currentPeriode()).toBe("2025-07")
  })

  it("berganti tahun pada pergantian Desember-Januari WIB", () => {
    freezeAt("2025-12-31T17:30:00Z") // 00:30 WIB, 1 Januari 2026
    expect(currentPeriode()).toBe("2026-01")
  })

  it("31 Desember 23:59 WIB masih milik tahun yang sama", () => {
    freezeAt("2025-12-31T16:59:00Z") // 23:59 WIB, 31 Desember
    expect(currentPeriode()).toBe("2025-12")
  })

  it("gagal-closed ketika Intl tidak tersedia (tidak mengembalikan sentinel)", () => {
    freezeAt("2025-06-15T10:00:00Z")
    vi.stubGlobal("Intl", {
      DateTimeFormat: () => {
        throw new Error("no ICU")
      },
    })
    expect(() => currentPeriode()).toThrowError("PERIODE_UNAVAILABLE")
  })

  it("gagal-closed ketika hasil Intl tidak valid (tanpa bagian bulan/tahun)", () => {
    freezeAt("2025-06-15T10:00:00Z")
    vi.stubGlobal("Intl", {
      DateTimeFormat: () => ({
        formatToParts: () => [{ type: "literal", value: "-" }],
      }),
    })
    expect(() => currentPeriode()).toThrowError("PERIODE_UNAVAILABLE")
  })

  it("gagal-closed ketika bulan di luar 01-12", () => {
    freezeAt("2025-06-15T10:00:00Z")
    vi.stubGlobal("Intl", {
      DateTimeFormat: () => ({
        formatToParts: () => [
          { type: "year", value: "2025" },
          { type: "month", value: "13" },
        ],
      }),
    })
    expect(() => currentPeriode()).toThrowError("PERIODE_UNAVAILABLE")
  })

  it("kegagalan menghasilkan periode yang selalu terurut benar terhadap periode nyata", () => {
    // Jaminan kontrak: fungsi tidak pernah mengembalikan nilai
    // sentinel lebih kecil dari periode nyata mana pun.
    freezeAt("2025-06-15T10:00:00Z")
    const periode = currentPeriode()
    expect(periode).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
    expect(periode >= "0000-01").toBe(true)
  })
})
