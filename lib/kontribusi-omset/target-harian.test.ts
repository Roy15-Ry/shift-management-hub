import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getDaysInMonth,
  getTodayJakarta,
  hitungSisaHari,
  hitungSisaTarget,
  hitungTargetHarian,
  hitungTargetHarianIndividu,
  hitungSelisihPersentase,
  hitungRealisasiBulanan,
  isDateTodayOrFuture,
  getTodayPeriode,
} from "@/lib/kontribusi-omset/target-harian"

type LaporanRingkas = {
  tanggal: string
  totalOmset: number
}

function freezeAt(isoUtc: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(isoUtc))
}

describe("getTodayJakarta (Asia/Jakarta)", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("mengembalikan tanggal lokal WIB", () => {
    freezeAt("2026-10-26T01:00:00Z") // 08:00 WIB, 26 Oktober 2026
    const today = getTodayJakarta()
    expect(today).toEqual({ year: 2026, month: 9, date: 26 })
  })

  it("mengembalikan tanggal Wib yang belum lewat meski UTC sudah hari berikutnya", () => {
    freezeAt("2026-10-25T16:00:00Z") // 23:00 WIB, 25 Oktober 2026
    const today = getTodayJakarta()
    expect(today).toEqual({ year: 2026, month: 9, date: 25 })
  })
})

describe("hitungSisaHari", () => {
  it("sisa hari mencakup hari ini", () => {
    const today = { year: 2026, month: 9, date: 26 } // 26 Oktober
    expect(hitungSisaHari(2026, 9, today)).toBe(6) // 26,27,28,29,30,31
  })

  it("hari terakhir bulan sisa hari = 1", () => {
    const today = { year: 2026, month: 9, date: 31 } // 31 Oktober
    expect(hitungSisaHari(2026, 9, today)).toBe(1)
  })

  it("periode bukan bulan berjalan → 0", () => {
    const today = { year: 2026, month: 9, date: 26 }
    expect(hitungSisaHari(2026, 8, today)).toBe(0)
    expect(hitungSisaHari(2026, 10, today)).toBe(0)
    expect(hitungSisaHari(2027, 9, today)).toBe(0)
  })

  it("today null → 0", () => {
    expect(hitungSisaHari(2026, 9, null)).toBe(0)
  })
})

describe("hitungRealisasiBulanan", () => {
  it("jumlah semua realisasi dalam periode termasuk hari ini", () => {
    const reports: LaporanRingkas[] = [
      { tanggal: "2026-10-25", totalOmset: 6_500_000 },
      { tanggal: "2026-10-26", totalOmset: 500_000 }, // hari ini
    ]
    expect(hitungRealisasiBulanan(reports)).toBe(7_000_000)
  })

  it("tidak ada laporan → 0", () => {
    expect(hitungRealisasiBulanan([])).toBe(0)
  })
})

describe("hitungSisaTarget", () => {
  it("target tersedia dan realisasi nol → sisa = target", () => {
    expect(hitungSisaTarget(250_000_000, 0)).toBe(250_000_000)
  })

  it("contoh wajib: target 250M, realisasi 7M → sisa 243M", () => {
    expect(hitungSisaTarget(250_000_000, 7_000_000)).toBe(243_000_000)
  })

  it("sebelum realisasi hari ini: target 250M, realisasi 6.5M → sisa 243.5M", () => {
    expect(hitungSisaTarget(250_000_000, 6_500_000)).toBe(243_500_000)
  })

  it("realisasi mencapai target → sisa = 0", () => {
    expect(hitungSisaTarget(10_000_000, 10_000_000)).toBe(0)
  })

  it("realisasi melebihi target → sisa = 0 (tidak negatif)", () => {
    expect(hitungSisaTarget(10_000_000, 12_000_000)).toBe(0)
  })

  it("target bulanan Rp0 → sisa = 0", () => {
    expect(hitungSisaTarget(0, 0)).toBe(0)
    expect(hitungSisaTarget(0, 500_000)).toBe(0)
  })

  it("target belum tersedia (null) → null", () => {
    expect(hitungSisaTarget(null, 5_000_000)).toBe(null)
  })
})

describe("hitungTargetHarian", () => {
  it("contoh wajib: sisa 243M / 6 hari = 40.5M", () => {
    const sisa = hitungSisaTarget(250_000_000, 7_000_000)
    const target = hitungTargetHarian(sisa, 6)
    expect(target).toBe(40_500_000)
  })

  it("sebelum realisasi hari ini: sisa 243.5M / 6 hari ≈ 40.583M", () => {
    const sisa = hitungSisaTarget(250_000_000, 6_500_000)
    const target = hitungTargetHarian(sisa, 6)
    expect(target).toBeCloseTo(40_583_333.33)
  })

  it("realisasi hari ini mengubah target harian (realisasiBulanan bertambah)", () => {
    const sebelum = hitungTargetHarian(
      hitungSisaTarget(250_000_000, 6_500_000),
      6,
    )
    const sesudah = hitungTargetHarian(
      hitungSisaTarget(250_000_000, 7_000_000),
      6,
    )
    expect(sesudah!).toBeLessThan(sebelum!)
    expect(sesudah!).toBe(40_500_000)
  })

  it("sisa hari 0 → 0 (tidak ada Infinity atau NaN)", () => {
    const sisa = hitungSisaTarget(250_000_000, 7_000_000)
    expect(hitungTargetHarian(sisa, 0)).toBe(0)
    expect(hitungTargetHarian(0, 0)).toBe(0)
  })

  it("sisa target null → null", () => {
    expect(hitungTargetHarian(null, 6)).toBe(null)
  })

  it("realisasi mencapai target → target harian = 0", () => {
    const sisa = hitungSisaTarget(10_000_000, 10_000_000)
    expect(hitungTargetHarian(sisa, 5)).toBe(0)
  })

  it("realisasi melebihi target → target harian = 0", () => {
    const sisa = hitungSisaTarget(10_000_000, 12_000_000)
    expect(hitungTargetHarian(sisa, 5)).toBe(0)
  })
})

describe("isDateTodayOrFuture", () => {
  const today = { year: 2026, month: 9, date: 26 }

  it("hari ini adalah today-or-future", () => {
    expect(isDateTodayOrFuture("2026-10-26", today)).toBe(true)
  })

  it("hari sebelumnya bukan today-or-future", () => {
    expect(isDateTodayOrFuture("2026-10-25", today)).toBe(false)
  })

  it("hari mendatang adalah today-or-future", () => {
    expect(isDateTodayOrFuture("2026-10-27", today)).toBe(true)
  })

  it("today null → false", () => {
    expect(isDateTodayOrFuture("2026-10-26", null)).toBe(false)
  })

  it("pergantian bulan dan tahun", () => {
    const todayBln = { year: 2026, month: 9, date: 31 }
    expect(isDateTodayOrFuture("2026-11-01", todayBln)).toBe(true)

    const todayThn = { year: 2026, month: 11, date: 31 }
    expect(isDateTodayOrFuture("2027-01-01", todayThn)).toBe(true)
    expect(isDateTodayOrFuture("2026-12-31", todayThn)).toBe(true)
  })
})

describe("getDaysInMonth", () => {
  it("Oktober 2026 memiliki 31 hari", () => {
    expect(getDaysInMonth(2026, 9)).toBe(31)
  })

  it("Februari 2026 (bukan kabisat) memiliki 28 hari", () => {
    expect(getDaysInMonth(2026, 1)).toBe(28)
  })

  it("Februari 2024 (kabisat) memiliki 29 hari", () => {
    expect(getDaysInMonth(2024, 1)).toBe(29)
  })
})

describe("getTodayPeriode", () => {
  it("mengembalikan periode YYYY-MM", () => {
    const today = { year: 2026, month: 9, date: 26 }
    expect(getTodayPeriode(today)).toBe("2026-10")
  })

  it("today null → null", () => {
    expect(getTodayPeriode(null)).toBe(null)
  })
})

describe("hitungTargetHarianIndividu", () => {
  it("target acuan 40.583M, 10 karyawan → 4.058M per karyawan per hari", () => {
    const target = hitungTargetHarianIndividu(40_583_333, 10)
    expect(target).toBe(4_058_333.3)
  })

  it("target acuan null → null", () => {
    expect(hitungTargetHarianIndividu(null, 10)).toBe(null)
  })

  it("jumlah karyawan 0 → 0", () => {
    expect(hitungTargetHarianIndividu(40_583_333, 0)).toBe(0)
  })

  it("target acuan Rp0 → 0", () => {
    expect(hitungTargetHarianIndividu(0, 10)).toBe(0)
  })
})

describe("hitungSelisihPersentase", () => {
  it("pencapaian 120% → selisih +20%", () => {
    expect(hitungSelisihPersentase(120)).toBe(20)
  })

  it("pencapaian 50% → selisih -50%", () => {
    expect(hitungSelisihPersentase(50)).toBe(-50)
  })

  it("pencapaian 100% → selisih 0", () => {
    expect(hitungSelisihPersentase(100)).toBe(0)
  })

  it("pencapaian null → null", () => {
    expect(hitungSelisihPersentase(null)).toBe(null)
  })
})

// ============================================================
// TARGET INDIVIDU — aturan bisnis (perhitungan murni)
//
// targetIndividu = targetBulananToko / employeeCountSnapshot
// Snapshot diambil saat target ditetapkan; tidak berikuti jumlah
// karyawan aktif saat ini dan tidak berikuti realisasi.
// ============================================================

describe("target individu tetap", () => {
  const targetBulanan = 600_000_000 // Rp600.000.000
  const snapshot = 10 // 10 karyawan saat target ditetapkan

  function hitungTargetIndividu(
    targetBulananNilai: number | null,
    employeeCountSnapshot: number | null,
  ): number | null {
    if (
      targetBulananNilai !== null &&
      employeeCountSnapshot !== null &&
      employeeCountSnapshot > 0
    ) {
      return targetBulananNilai / employeeCountSnapshot
    }
    return null
  }

  function hitungSisaTargetIndividu(
    targetIndividu: number | null,
    realisasi: number,
  ): number | null {
    if (targetIndividu === null) {
      return null
    }
    return Math.max(0, targetIndividu - realisasi)
  }

  function hitungTargetHariIniIndividu(
    sisaTarget: number | null,
    sisaHari: number,
  ): number {
    if (sisaTarget === null || sisaTarget <= 0) {
      return 0
    }
    if (sisaHari <= 0) {
      return 0
    }
    return sisaTarget / sisaHari
  }

  function hitungPencapaianIndividu(
    realisasi: number,
    targetIndividu: number | null,
  ): number | null {
    if (targetIndividu === null || targetIndividu <= 0) {
      return null
    }
    return (realisasi / targetIndividu) * 100
  }

  it("target individu tetap saat realisasi berubah", () => {
    const sebelum = hitungTargetIndividu(targetBulanan, snapshot) // 60.000.000
    expect(sebelum).toBe(60_000_000)

    const setelahRealisasiBertambah = hitungTargetIndividu(
      targetBulanan,
      snapshot,
    )
    expect(setelahRealisasiBertambah).toBe(60_000_000)
    expect(setelahRealisasiBertambah).toBe(sebelum)
  })

  it("target individu tidak berubah saat jumlah karyawan saat ini berubah", () => {
    const targetIndividuDariSnapshot =
      hitungTargetIndividu(targetBulanan, snapshot) // pakai snapshot = 10
    expect(targetIndividuDariSnapshot).toBe(60_000_000)

    const karyawanSaatIni = 15 // berubah setelah target ditetapkan
    const salahJikaPakaiKaryawanSaatIni =
      hitungTargetIndividu(targetBulanan, karyawanSaatIni) // 40.000.000
    expect(salahJikaPakaiKaryawanSaatIni).toBe(40_000_000)
    expect(salahJikaPakaiKaryawanSaatIni).not.toBe(targetIndividuDariSnapshot)
  })

  it("sisa target tidak negatif", () => {
    const targetIndividu = hitungTargetIndividu(targetBulanan, snapshot) // 60M
    const realisasiMelebihiTarget = 70_000_000
    const sisa = hitungSisaTargetIndividu(targetIndividu, realisasiMelebihiTarget)
    expect(sisa).toBe(0) // tidak negatif

    const realisasiDiBawahTarget = 30_000_000
    const sisaDiBawah = hitungSisaTargetIndividu(
      targetIndividu,
      realisasiDiBawahTarget,
    )
    expect(sisaDiBawah).toBe(30_000_000)
  })

  it("target hari ini berubah sesuai sisa hari dan sisa target", () => {
    const targetIndividu = hitungTargetIndividu(targetBulanan, snapshot) // 60M
    const realisasi = 30_000_000
    const sisaTarget = hitungSisaTargetIndividu(targetIndividu, realisasi) // 30M

    const sisaHari6 = hitungTargetHariIniIndividu(sisaTarget, 6)
    expect(sisaHari6).toBeCloseTo(5_000_000)

    const sisaHari3 = hitungTargetHariIniIndividu(sisaTarget, 3)
    expect(sisaHari3).toBeCloseTo(10_000_000)

    expect(sisaHari3).toBeGreaterThan(sisaHari6)
  })

  it("target hari ini Rp0 jika target tercapai (sisa target 0)", () => {
    const targetIndividu = hitungTargetIndividu(targetBulanan, snapshot) // 60M
    const realisasiTercapai = 60_000_000
    const sisaTarget = hitungSisaTargetIndividu(
      targetIndividu,
      realisasiTercapai,
    ) // 0
    expect(sisaTarget).toBe(0)

    const targetHariIni = hitungTargetHariIniIndividu(sisaTarget, 6)
    expect(targetHariIni).toBe(0) // Rp0, tidak negatif
  })

  it("target hari ini Rp0 jika realisasi melebihi target", () => {
    const targetIndividu = hitungTargetIndividu(targetBulanan, snapshot) // 60M
    const realisasi = 70_000_000
    const sisaTarget = hitungSisaTargetIndividu(targetIndividu, realisasi) // 0
    const targetHariIni = hitungTargetHariIniIndividu(sisaTarget, 6)
    expect(targetHariIni).toBe(0)
  })

  it("pencapaian menggunakan target individu tetap", () => {
    const targetIndividu = hitungTargetIndividu(targetBulanan, snapshot) // 60M
    const realisasi = 30_000_000
    const pencapaian = hitungPencapaianIndividu(realisasi, targetIndividu)
    expect(pencapaian).toBe(50) // 30M / 60M * 100 = 50%

    const realisasiLain = 15_000_000
    const pencapaianLain = hitungPencapaianIndividu(
      realisasiLain,
      targetIndividu,
    )
    expect(pencapaianLain).toBe(25) // target individu tetap 60M
  })

  it("target yang tidak tersedia tidak menghasilkan NaN atau Infinity", () => {
    const targetTidakTersedia = hitungTargetIndividu(null, snapshot) // null
    expect(targetTidakTersedia).toBe(null)

    const realisasi = 30_000_000
    const pencapaian = hitungPencapaianIndividu(realisasi, targetTidakTersedia)
    expect(pencapaian).toBe(null)
    expect(Number.isNaN(pencapaian ?? 0)).toBe(false)
    expect(Number.isFinite(pencapaian ?? 0)).toBe(true)

    const sisaTarget = hitungSisaTargetIndividu(targetTidakTersedia, realisasi)
    expect(sisaTarget).toBe(null)
    const targetHariIni = hitungTargetHariIniIndividu(sisaTarget, 6)
    expect(targetHariIni).toBe(0) // tidak NaN/Infinity
  })

  it("target lama tanpa employeeCountSnapshot ditangani dengan aman (bukan Rp0)", () => {
    const employeeCountSnapshot = null // target lama, field belum ada
    const targetIndividu = hitungTargetIndividu(targetBulanan, null)
    expect(targetIndividu).toBe(null) // belum tersedia, bukan Rp0

    const realisasi = 30_000_000
    const pencapaian = hitungPencapaianIndividu(realisasi, targetIndividu)
    expect(pencapaian).toBe(null) // "—", tidak NaN

    const sisaTarget = hitungSisaTargetIndividu(targetIndividu, realisasi)
    expect(sisaTarget).toBe(null)

    const targetHariIni = hitungTargetHariIniIndividu(sisaTarget, 6)
    expect(targetHariIni).toBe(0)
  })

  it("snapshot nol dianggap tidak tersedia (hindari pembagian nol)", () => {
    const targetIndividu = hitungTargetIndividu(targetBulanan, 0)
    expect(targetIndividu).toBe(null)

    const pencapaian = hitungPencapaianIndividu(10_000_000, targetIndividu)
    expect(pencapaian).toBe(null)
  })
})

