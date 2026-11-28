import { beforeEach, describe, expect, it, vi } from "vitest"

const fx = vi.hoisted(() => {
  type DocData = Record<string, unknown>
  type Op = {
    kind: "set" | "update" | "create"
    path: string
    data: DocData
  }

  const state = {
    users: new Map<string, DocData>(),
    stores: new Map<string, DocData>(),
    access: new Map<string, DocData>(),
    history: new Map<string, DocData>(),
    ops: [] as Op[],
    reads: [] as string[],
    historySeq: 0,
    failOn: null as null | {
      kind: Op["kind"]
      pathPrefix: string
    },
  }

  function mapFor(
    collectionName: string,
  ): Map<string, DocData> | null {
    if (collectionName === "users") return state.users
    if (collectionName === "stores") return state.stores
    if (collectionName === "store_program_access") {
      return state.access
    }
    if (collectionName === "store_program_access_history") {
      return state.history
    }
    return null
  }

  function getData(path: string): DocData | undefined {
    const [collectionName, id] = path.split("/")
    const map = mapFor(collectionName)
    return map?.get(id)
  }

  function snapshot(path: string) {
    const data = getData(path)

    return {
      exists: data !== undefined,
      id: path.split("/")[1],
      data: () => data,
    }
  }

  function docRef(collectionName: string, id?: string) {
    const realId = id ?? `HIST_${++state.historySeq}`
    const path = `${collectionName}/${realId}`

    return {
      id: realId,
      path,
      get: async () => {
        state.reads.push(path)
        return snapshot(path)
      },
    }
  }

  function apply(op: Op) {
    const [collectionName, id] = op.path.split("/")
    const map = mapFor(collectionName)

    if (!map) {
      throw new Error(`Unexpected collection: ${collectionName}`)
    }

    if (op.kind === "update") {
      map.set(id, { ...(map.get(id) ?? {}), ...op.data })
      return
    }

    map.set(id, { ...op.data })
  }

  function failIfNeeded(kind: Op["kind"], path: string) {
    if (
      state.failOn &&
      state.failOn.kind === kind &&
      path.startsWith(state.failOn.pathPrefix)
    ) {
      throw new Error("TX_FAILED")
    }
  }

  const adminDb = {
    collection: (collectionName: string) => ({
      doc: (id?: string) => docRef(collectionName, id),
    }),
    runTransaction: async (
      fn: (tx: unknown) => Promise<unknown>,
    ) => {
      const staged: Op[] = []
      const tx = {
        get: async (ref: { path: string }) => {
          state.reads.push(ref.path)
          return snapshot(ref.path)
        },
        set: (ref: { path: string }, data: DocData) => {
          failIfNeeded("set", ref.path)
          staged.push({
            kind: "set",
            path: ref.path,
            data,
          })
        },
        update: (ref: { path: string }, data: DocData) => {
          failIfNeeded("update", ref.path)
          staged.push({
            kind: "update",
            path: ref.path,
            data,
          })
        },
        create: (ref: { path: string }, data: DocData) => {
          failIfNeeded("create", ref.path)
          staged.push({
            kind: "create",
            path: ref.path,
            data,
          })
        },
      }

      const result = await fn(tx)

      for (const op of staged) {
        apply(op)
      }

      state.ops.push(...staged)

      return result
    },
  }

  const adminAuth = {
    verifyIdToken: async (token: string) => ({
      uid: token,
    }),
  }

  function seedUser(uid: string, data: DocData) {
    state.users.set(uid, { ...data })
  }

  function seedStore(id: string, data: DocData) {
    state.stores.set(id, { storeId: id, ...data })
  }

  function seedAccess(id: string, data: DocData) {
    state.access.set(id, { storeId: id, ...data })
  }

  function reset() {
    state.users.clear()
    state.stores.clear()
    state.access.clear()
    state.history.clear()
    state.ops.length = 0
    state.reads.length = 0
    state.historySeq = 0
    state.failOn = null
  }

  return {
    state,
    adminDb,
    adminAuth,
    seedUser,
    seedStore,
    seedAccess,
    reset,
  }
})

vi.mock("@/lib/firebase-admin", () => ({
  adminDb: fx.adminDb,
  adminAuth: fx.adminAuth,
}))

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(
      () => "__SERVER_TIMESTAMP__",
    ),
  },
}))

import {
  GET,
  PATCH,
} from "@/app/api/admin/store-program-access/route"

function getRequest(
  token: string,
  storeId?: string,
) {
  const url = new URL(
    "http://localhost/api/admin/store-program-access",
  )

  if (storeId !== undefined) {
    url.searchParams.set("storeId", storeId)
  }

  return new Request(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

function patchRequest(
  token: string,
  body: unknown,
) {
  return new Request(
    "http://localhost/api/admin/store-program-access",
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  )
}

function seedUser(
  uid: string,
  role: string,
  extra: Record<string, unknown> = {},
) {
  fx.seedUser(uid, {
    role,
    aktif: true,
    nama: `Nama ${uid}`,
    ...extra,
  })
}

function seedAccess(
  storeId: string,
  overrides: Record<string, unknown> = {},
) {
  fx.seedAccess(storeId, {
    cabangId: "CAB1",
    targetPenjualanEnabled: true,
    monitoringErrorEnabled: true,
    kontribusiOmsetEnabled: true,
    version: 1,
    updatedAt: "2026-11-28T00:00:00.000Z",
    updatedByUid: "uid-seed",
    updatedByName: "Seed",
    updatedByRole: "central_pusat",
    ...overrides,
  })
}

function accessBody(
  overrides: Record<string, unknown> = {},
) {
  return {
    storeId: "ST01",
    targetPenjualanEnabled: false,
    monitoringErrorEnabled: true,
    kontribusiOmsetEnabled: false,
    version: 0,
    ...overrides,
  }
}

beforeEach(() => {
  fx.reset()
})

describe("GET /api/admin/store-program-access", () => {
  it("CENTRAL PUSAT dapat membaca toko mana pun", async () => {
    seedUser("uid-pusat", "central_pusat", {
      cabangId: "CAB0",
    })
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })
    seedAccess("ST01", {
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 4,
    })

    const response = await GET(
      getRequest("uid-pusat", "ST01"),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 4,
      source: "stored",
    })
  })

  it("CENTRAL CABANG dapat membaca toko dalam cabangnya", async () => {
    seedUser("uid-cabang", "central_cabang", {
      cabangId: "CAB1",
    })
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })

    const response = await GET(
      getRequest("uid-cabang", "ST01"),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      storeId: "ST01",
      cabangId: "CAB1",
      source: "default",
    })
  })

  it("CENTRAL CABANG ditolak membaca toko lintas cabang", async () => {
    seedUser("uid-cabang", "central_cabang", {
      cabangId: "CAB1",
    })
    fx.seedStore("ST02", {
      cabangId: "CAB2",
      aktif: true,
    })
    seedAccess("ST02")

    const response = await GET(
      getRequest("uid-cabang", "ST02"),
    )

    expect(response.status).toBe(403)
    expect(fx.state.reads).not.toContain(
      "store_program_access/ST02",
    )
  })

  it("STORE hanya dapat membaca toko sendiri dan mengabaikan storeId request", async () => {
    seedUser("uid-store", "store", {
      storeId: "ST01",
      cabangId: "CAB1",
    })
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })
    fx.seedStore("ST99", {
      cabangId: "CAB1",
      aktif: true,
    })
    seedAccess("ST01", { version: 2 })
    seedAccess("ST99", { version: 9 })

    const response = await GET(
      getRequest("uid-store", "ST99"),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json.storeId).toBe("ST01")
    expect(json.version).toBe(2)
    expect(fx.state.reads).not.toContain(
      "store_program_access/ST99",
    )
  })

  it("dokumen belum tersedia mengembalikan default aktif tanpa write", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })

    const response = await GET(
      getRequest("uid-pusat", "ST01"),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      targetPenjualanEnabled: true,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: true,
      version: 0,
      updatedAt: null,
      source: "default",
    })
    expect(fx.state.ops).toHaveLength(0)
  })
})

describe("PATCH /api/admin/store-program-access", () => {
  it("STORE ditolak dengan HTTP 403", async () => {
    seedUser("uid-store", "store", {
      storeId: "ST01",
      cabangId: "CAB1",
    })

    const response = await PATCH(
      patchRequest("uid-store", accessBody()),
    )

    expect(response.status).toBe(403)
    expect(fx.state.ops).toHaveLength(0)
    expect(fx.state.reads).not.toContain(
      "store_program_access/ST01",
    )
  })

  it("CENTRAL PUSAT berhasil mengubah dan menulis history", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })

    const response = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({ version: 0 }),
      ),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      success: true,
      changed: true,
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 1,
    })

    expect(
      fx.state.access.get("ST01"),
    ).toMatchObject({
      storeId: "ST01",
      cabangId: "CAB1",
      targetPenjualanEnabled: false,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: false,
      version: 1,
      updatedAt: "__SERVER_TIMESTAMP__",
      updatedByUid: "uid-pusat",
      updatedByName: "Nama uid-pusat",
      updatedByRole: "central_pusat",
    })

    expect(fx.state.history.size).toBe(1)

    const history = [
      ...fx.state.history.values(),
    ][0]

    expect(history).toMatchObject({
      storeId: "ST01",
      cabangId: "CAB1",
      before: {
        targetPenjualan: true,
        monitoringError: true,
        kontribusiOmset: true,
      },
      after: {
        targetPenjualan: false,
        monitoringError: true,
        kontribusiOmset: false,
      },
      changedByUid: "uid-pusat",
      changedByName: "Nama uid-pusat",
      changedByRole: "central_pusat",
      changedAt: "__SERVER_TIMESTAMP__",
      version: 1,
    })
  })

  it("CENTRAL CABANG berhasil mengubah toko dalam cabangnya", async () => {
    seedUser("uid-cabang", "central_cabang", {
      cabangId: "CAB1",
    })
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })
    seedAccess("ST01", { version: 2 })

    const response = await PATCH(
      patchRequest(
        "uid-cabang",
        accessBody({
          targetPenjualanEnabled: true,
          monitoringErrorEnabled: false,
          kontribusiOmsetEnabled: true,
          version: 2,
        }),
      ),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json.changed).toBe(true)
    expect(json.version).toBe(3)
    expect(
      fx.state.access.get("ST01"),
    ).toMatchObject({
      version: 3,
      monitoringErrorEnabled: false,
    })

    const history = [
      ...fx.state.history.values(),
    ][0]

    expect(history).toMatchObject({
      before: {
        targetPenjualan: true,
        monitoringError: true,
        kontribusiOmset: true,
      },
      after: {
        targetPenjualan: true,
        monitoringError: false,
        kontribusiOmset: true,
      },
      changedByRole: "central_cabang",
      version: 3,
    })
  })

  it("CENTRAL CABANG ditolak mengubah toko lintas cabang", async () => {
    seedUser("uid-cabang", "central_cabang", {
      cabangId: "CAB1",
    })
    fx.seedStore("ST02", {
      cabangId: "CAB2",
      aktif: true,
    })
    seedAccess("ST02")

    const response = await PATCH(
      patchRequest(
        "uid-cabang",
        accessBody({
          storeId: "ST02",
          version: 1,
        }),
      ),
    )

    expect(response.status).toBe(403)
    expect(fx.state.ops).toHaveLength(0)
    expect(fx.state.reads).not.toContain(
      "store_program_access/ST02",
    )
  })

  it("version tidak cocok menghasilkan 409 VERSION_CONFLICT", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })
    seedAccess("ST01", { version: 3 })

    const response = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({ version: 2 }),
      ),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(409)
    expect(json).toMatchObject({
      success: false,
      code: "VERSION_CONFLICT",
    })
    expect(fx.state.ops).toHaveLength(0)
    expect(fx.state.history.size).toBe(0)
    expect(
      fx.state.access.get("ST01")?.version,
    ).toBe(3)
  })

  it("tidak menulis history jika tidak ada perubahan", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })
    seedAccess("ST01", { version: 5 })

    const response = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({
          targetPenjualanEnabled: true,
          monitoringErrorEnabled: true,
          kontribusiOmsetEnabled: true,
          version: 5,
        }),
      ),
    )
    const json = (await response.json()) as any

    expect(response.status).toBe(200)
    expect(json.changed).toBe(false)
    expect(json.version).toBe(5)
    expect(fx.state.ops).toHaveLength(0)
    expect(fx.state.history.size).toBe(0)
  })

  it("kegagalan transaksi tidak menghasilkan perubahan parsial", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })
    seedAccess("ST01", { version: 1 })
    fx.state.failOn = {
      kind: "set",
      pathPrefix: "store_program_access_history/",
    }

    const response = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({ version: 1 }),
      ),
    )

    expect(response.status).toBe(500)
    expect(fx.state.ops).toHaveLength(0)
    expect(fx.state.history.size).toBe(0)
    expect(
      fx.state.access.get("ST01"),
    ).toMatchObject({
      targetPenjualanEnabled: true,
      monitoringErrorEnabled: true,
      kontribusiOmsetEnabled: true,
      version: 1,
    })
  })

  it("menolak status non-boolean dan version tidak valid", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: true,
    })

    const invalidFlag = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({
          targetPenjualanEnabled: "false",
          version: 0,
        }),
      ),
    )

    const invalidVersion = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({ version: "0" }),
      ),
    )

    expect(invalidFlag.status).toBe(400)
    expect(invalidVersion.status).toBe(400)
    expect(fx.state.ops).toHaveLength(0)
  })

  it("menolak toko yang tidak aktif", async () => {
    seedUser("uid-pusat", "central_pusat")
    fx.seedStore("ST01", {
      cabangId: "CAB1",
      aktif: false,
    })

    const response = await PATCH(
      patchRequest(
        "uid-pusat",
        accessBody({ version: 0 }),
      ),
    )

    expect(response.status).toBe(400)
    expect(fx.state.ops).toHaveLength(0)
  })
})
