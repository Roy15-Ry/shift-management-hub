import { describe, expect, it } from "vitest"

import { getCabangDisplayName, KONTRIBUSI_CABANG_NAMES } from "@/lib/kontribusi-omset/cabang"

describe("getCabangDisplayName", () => {
  it("memetakan bgr-1 ke Bogor dan Banten", () => {
    expect(getCabangDisplayName("bgr-1")).toBe("Bogor dan Banten")
  })

  it("memetakan cjr-01 ke Cianjur dan Cipanas", () => {
    expect(getCabangDisplayName("cjr-01")).toBe("Cianjur dan Cipanas")
  })

  it("bersifat case-insensitive", () => {
    expect(getCabangDisplayName("BGR-1")).toBe("Bogor dan Banten")
    expect(getCabangDisplayName("CJR-01")).toBe("Cianjur dan Cipanas")
  })

  it("mengembalikan string kosong untuk kode yang tidak dikenali", () => {
    expect(getCabangDisplayName("unknown")).toBe("")
    expect(getCabangDisplayName(null)).toBe("")
    expect(getCabangDisplayName(undefined)).toBe("")
  })
})

describe("KONTRIBUSI_CABANG_NAMES", () => {
  it("memuat kedua pemetaan wajib", () => {
    expect(KONTRIBUSI_CABANG_NAMES["bgr-1"]).toBe("Bogor dan Banten")
    expect(KONTRIBUSI_CABANG_NAMES["cjr-01"]).toBe("Cianjur dan Cipanas")
  })
})
