import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const fx = vi.hoisted(() => {
  const docs = new Map<
    string,
    Record<string, unknown>
  >()

  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const path = `${name}/${id}`
          const data = docs.get(path)

          return {
            exists: data !== undefined,
            data: () => data,
          }
        },
      }),
    }),
  }

  return { docs, adminDb }
})

vi.mock("@/lib/firebase-admin", () => ({
  adminDb: fx.adminDb,
}))

import {
  getStoreProgramAccessConfig,
  isStoreParfumProgramEnabled,
  isStoreProgramEnabled,
  readStoreProgramAccess,
} from "@/lib/store-program-access/server"

beforeEach(() => {
  fx.docs.clear()
})

describe("readStoreProgramAccess", () => {
  it("mengembalikan default tanpa menulis dokumen", async () => {
    const result = await readStoreProgramAccess("ST01")

    expect(result.source).toBe("default")
    expect(result.config).toMatchObject({
      storeId: "ST01",
      cabangId: "",
      targetPenjualanEnabled: true,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: true,
      version: 0,
      updatedAt: null,
      updatedByUid: "",
      updatedByName: "",
      updatedByRole: "",
    })
    expect(fx.docs.size).toBe(0)
  })

  it("membaca dokumen tersimpan dan nilai false", async () => {
    fx.docs.set("store_program_access/ST01", {
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 4,
      updatedAt: "2026-11-28T00:00:00.000Z",
      updatedByUid: "uid-1",
      updatedByName: "Admin",
      updatedByRole: "central_pusat",
    })

    const result = await readStoreProgramAccess("ST01")

    expect(result.source).toBe("stored")
    expect(result.config).toMatchObject({
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 4,
      updatedAt: "2026-11-28T00:00:00.000Z",
      updatedByUid: "uid-1",
      updatedByName: "Admin",
      updatedByRole: "central_pusat",
    })
  })

  it("field boolean yang hilang dianggap aktif", async () => {
    fx.docs.set("store_program_access/ST01", {
      cabangId: "CAB1",
    })

    const config =
      await getStoreProgramAccessConfig("ST01")

    expect(config.targetPenjualanEnabled).toBe(true)
    expect(config.monitoringErrorEnabled).toBe(true)
    expect(config.kontribusiOmsetEnabled).toBe(true)
  })

  it("memeriksa program dan Parfum mengikuti Target Penjualan", async () => {
    fx.docs.set("store_program_access/ST01", {
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
    })

    expect(
      await isStoreProgramEnabled(
        "ST01",
        "targetPenjualan",
      ),
    ).toBe(false)
    expect(
      await isStoreProgramEnabled(
        "ST01",
        "monitoringError",
      ),
    ).toBe(true)
    expect(
      await isStoreProgramEnabled(
        "ST01",
        "kontribusiOmset",
      ),
    ).toBe(false)
    expect(
      await isStoreParfumProgramEnabled("ST01"),
    ).toBe(false)
  })
})
