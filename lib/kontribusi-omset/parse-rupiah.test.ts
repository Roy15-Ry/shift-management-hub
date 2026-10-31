import { describe, expect, it } from "vitest"

import { parseRupiahInput, formatDigitsWithThousandSeparators } from "@/lib/kontribusi-omset/format-rupiah"

describe("parseRupiahInput", () => {
  it("mengembalikan 0 untuk string kosong", () => {
    expect(parseRupiahInput("")).toBe(0)
  })

  it("mengembalikan 0 untuk string hanya simbol Rp", () => {
    expect(parseRupiahInput("Rp")).toBe(0)
  })

  it("memparsing angka bulat tanpa pemisah", () => {
    expect(parseRupiahInput("50000")).toBe(50000)
  })

  it("memparsing angka dengan titik pemisah ribuan (format Indonesia)", () => {
    expect(parseRupiahInput("50.000")).toBe(50000)
    expect(parseRupiahInput("1.250.000")).toBe(1250000)
    expect(parseRupiahInput("7.500.000")).toBe(7500000)
    expect(parseRupiahInput("25.000.000")).toBe(25000000)
  })

  it("memparsing angka dengan awalan Rp", () => {
    expect(parseRupiahInput("Rp50.000")).toBe(50000)
    expect(parseRupiahInput("Rp1.250.000")).toBe(1250000)
  })

  it("memparsing nilai nol", () => {
    expect(parseRupiahInput("0")).toBe(0)
  })

  it("tidak mengembalikan negatif untuk input negatif", () => {
    expect(parseRupiahInput("-50000")).toBe(0)
  })

  it("mengabaikan karakter non-angka selain koma dan titik", () => {
    expect(parseRupiahInput("abc50.000def")).toBe(50000)
  })

  it("memparsing desimal dengan koma (format Indonesia)", () => {
    expect(parseRupiahInput("50.000,50")).toBe(50000.5)
  })

  it("memparsing desimal dengan titik", () => {
    expect(parseRupiahInput("50000.5")).toBe(50000.5)
  })
})

describe("formatDigitsWithThousandSeparators", () => {
  it("mengembalikan string kosong untuk input kosong", () => {
    expect(formatDigitsWithThousandSeparators("")).toBe("")
  })

  it("format 5000 menjadi 5.000", () => {
    expect(formatDigitsWithThousandSeparators("5000")).toBe("5.000")
  })

  it("format 50000 menjadi 50.000", () => {
    expect(formatDigitsWithThousandSeparators("50000")).toBe("50.000")
  })

  it("format 5000000 menjadi 5.000.000", () => {
    expect(formatDigitsWithThousandSeparators("5000000")).toBe("5.000.000")
  })

  it("format 25000000 menjadi 25.000.000", () => {
    expect(formatDigitsWithThousandSeparators("25000000")).toBe("25.000.000")
  })

  it("format 5000000000 menjadi 5.000.000.000", () => {
    expect(formatDigitsWithThousandSeparators("5000000000")).toBe("5.000.000.000")
  })

  it("format 123 tetap 123 (kurang dari 1000)", () => {
    expect(formatDigitsWithThousandSeparators("123")).toBe("123")
  })

  it("format 1234 menjadi 1.234", () => {
    expect(formatDigitsWithThousandSeparators("1234")).toBe("1.234")
  })
})
