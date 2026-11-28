import { describe, expect, it } from "vitest"

import {
  PARFUM_PROGRAM_KEY,
  PROGRAM_FIELD_BY_KEY,
  PROGRAM_KEYS,
  STORE_PROGRAM_ACCESS_COLLECTION,
  STORE_PROGRAM_ACCESS_HISTORY_COLLECTION,
  isProgramKey,
} from "@/lib/store-program-access/constants"

import {
  createDefaultProgramAccess,
  createDefaultStoreProgramAccessConfig,
  getProgramAccessMap,
  getProgramAccessStatus,
  getStoreProgramAccessDocId,
  isParfumProgramEnabled,
  isProgramEnabled,
  resolveProgramAccessFromDocument,
  resolveStoreProgramAccessConfig,
} from "@/lib/store-program-access/config"

const ALL_ENABLED = {
  targetPenjualan: true,
  monitoringError: true,
  kontribusiOmset: true,
} as const

describe("konstanta program", () => {
  it("mengenali tepat tiga program dengan key final", () => {
    expect(PROGRAM_KEYS).toEqual([
      "targetPenjualan",
      "monitoringError",
      "kontribusiOmset",
    ])

    for (const key of PROGRAM_KEYS) {
      expect(isProgramKey(key)).toBe(true)
    }

    expect(isProgramKey("parfum")).toBe(false)
    expect(isProgramKey("")).toBe(false)
  })

  it("memetakan setiap program ke field boolean yang benar", () => {
    expect(PROGRAM_FIELD_BY_KEY).toEqual({
      targetPenjualan: "targetPenjualanEnabled",
      monitoringError: "monitoringErrorEnabled",
      kontribusiOmset: "kontribusiOmsetEnabled",
    })
  })

  it("Target Penjualan Parfum mengikuti key Target Penjualan", () => {
    expect(PARFUM_PROGRAM_KEY).toBe("targetPenjualan")
  })

  it("memakai nama collection final", () => {
    expect(STORE_PROGRAM_ACCESS_COLLECTION).toBe(
      "store_program_access",
    )
    expect(STORE_PROGRAM_ACCESS_HISTORY_COLLECTION).toBe(
      "store_program_access_history",
    )
  })
})

describe("default konfigurasi akses", () => {
  it("semua fitur aktif", () => {
    expect(createDefaultProgramAccess()).toEqual(
      ALL_ENABLED,
    )
  })

  it("dokumen belum tersedia dianggap semua aktif", () => {
    expect(resolveProgramAccessFromDocument()).toEqual(
      ALL_ENABLED,
    )
    expect(
      resolveProgramAccessFromDocument(null),
    ).toEqual(ALL_ENABLED)
    expect(resolveProgramAccessFromDocument({})).toEqual(
      ALL_ENABLED,
    )
  })

  it("field boolean yang hilang dianggap aktif", () => {
    expect(
      resolveProgramAccessFromDocument({
        targetPenjualanEnabled: false,
      }),
    ).toEqual({
      targetPenjualan: false,
      monitoringError: true,
      kontribusiOmset: true,
    })
  })

  it("nilai false tetap nonaktif", () => {
    expect(
      resolveProgramAccessFromDocument({
        targetPenjualanEnabled: false,
        monitoringErrorEnabled: false,
        kontribusiOmsetEnabled: false,
      }),
    ).toEqual({
      targetPenjualan: false,
      monitoringError: false,
      kontribusiOmset: false,
    })
  })

  it("nilai true tetap aktif", () => {
    expect(
      resolveProgramAccessFromDocument({
        targetPenjualanEnabled: true,
        monitoringErrorEnabled: true,
        kontribusiOmsetEnabled: true,
      }),
    ).toEqual(ALL_ENABLED)
  })

  it("nilai non-boolean tidak menonaktifkan", () => {
    expect(
      resolveProgramAccessFromDocument({
        targetPenjualanEnabled: "false",
        monitoringErrorEnabled: 0,
      }),
    ).toEqual(ALL_ENABLED)
  })
})

describe("konfigurasi akses per toko", () => {
  it("membuat default config tanpa metadata dan version 0", () => {
    const config =
      createDefaultStoreProgramAccessConfig(
        "ST01",
        "CAB1",
      )

    expect(config).toMatchObject({
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: true,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: true,
      version: 0,
      updatedAt: null,
      updatedByUid: "",
      updatedByName: "",
      updatedByRole: "",
    })
    expect(getProgramAccessMap(config)).toEqual(
      ALL_ENABLED,
    )
  })

  it("mempertahankan casing kanonik storeId dan hanya trim", () => {
    expect(getStoreProgramAccessDocId("  ST01  ")).toBe(
      "ST01",
    )
    expect(getStoreProgramAccessDocId("st01")).toBe(
      "st01",
    )
    expect(() =>
      getStoreProgramAccessDocId("   "),
    ).toThrow("STORE_ID_REQUIRED")
  })

  it("membaca field tersimpan dan metadata", () => {
    const updatedAt = "2026-11-28T00:00:00.000Z"
    const config = resolveStoreProgramAccessConfig(
      "ST01",
      {
        storeId: "ST01",
        cabangId: "CAB1",
        targetPenjualanEnabled: false,
        monitoringErrorEnabled: true,
        kontribusiOmsetEnabled: false,
        version: 3,
        updatedAt,
        updatedByUid: "uid-1",
        updatedByName: "Admin",
        updatedByRole: "central_pusat",
      },
    )

    expect(config).toEqual({
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 3,
      updatedAt,
      updatedByUid: "uid-1",
      updatedByName: "Admin",
      updatedByRole: "central_pusat",
    })
  })

  it("field boolean yang hilang tetap aktif", () => {
    const config = resolveStoreProgramAccessConfig(
      "ST01",
      {
        cabangId: "CAB1",
        version: 2,
      },
    )

    expect(config.targetPenjualanEnabled).toBe(true)
    expect(config.monitoringErrorEnabled).toBe(true)
    expect(config.kontribusiOmsetEnabled).toBe(true)
    expect(config.version).toBe(2)
    expect(config.updatedAt).toBe(null)
    expect(config.updatedByUid).toBe("")
    expect(config.updatedByName).toBe("")
    expect(config.updatedByRole).toBe("")
  })

  it("memakai fallback cabangId bila dokumen tidak memilikinya", () => {
    expect(
      resolveStoreProgramAccessConfig(
        "ST01",
        {},
        "CAB1",
      ).cabangId,
    ).toBe("CAB1")
    expect(
      resolveStoreProgramAccessConfig(
        "ST01",
        { cabangId: "CAB2" },
        "CAB1",
      ).cabangId,
    ).toBe("CAB2")
  })
})

describe("pemeriksaan status program", () => {
  it("mengenali ketiga program dan status enabled/disabled", () => {
    const config = resolveStoreProgramAccessConfig(
      "ST01",
      { targetPenjualanEnabled: false },
    )

    expect(
      getProgramAccessStatus(config, "targetPenjualan"),
    ).toBe("disabled")
    expect(
      getProgramAccessStatus(config, "monitoringError"),
    ).toBe("enabled")
    expect(
      getProgramAccessStatus(config, "kontribusiOmset"),
    ).toBe("enabled")

    expect(isProgramEnabled(config, "targetPenjualan")).toBe(
      false,
    )

    for (const key of PROGRAM_KEYS) {
      if (key === "targetPenjualan") continue
      expect(isProgramEnabled(config, key)).toBe(true)
    }
  })

  it("Parfum mengikuti Target Penjualan", () => {
    const targetOff =
      resolveStoreProgramAccessConfig("ST01", {
        targetPenjualanEnabled: false,
      })
    const targetOn =
      createDefaultStoreProgramAccessConfig("ST01")

    expect(isParfumProgramEnabled(targetOff)).toBe(false)
    expect(isParfumProgramEnabled(targetOn)).toBe(true)
  })
})
