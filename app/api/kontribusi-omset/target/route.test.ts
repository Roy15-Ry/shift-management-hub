import { beforeEach, describe, expect, it, vi } from "vitest"

import { POST, GET } from "@/app/api/kontribusi-omset/target/route"

// ============================================================
// Mock minimal Firebase Admin: seluruh pengujian berjalan tanpa
// menyentuh Firestore nyata — map in-memory + rekaman operasi.
// ============================================================

const fx = vi.hoisted(() => {
  const db = {
    docs: new Map<string, Record<string, unknown>>(),
    storesByCabang: {} as Record<string, Array<Record<string, any>>>,
    ops: [] as Array<{ kind: string; path: string; data: any }>,
    histSeq: 0,
    reset() {
      db.docs.clear()
      db.ops.length = 0
      db.histSeq = 0
      db.storesByCabang = {}
    },
    seedStore(id: string, data: Record<string, unknown>) {
      const merged = { ...data, __id: id }
      db.docs.set(`stores/${id}`, { ...merged })
      const cabangId = String(data.cabangId ?? "")
      if (cabangId) {
        db.storesByCabang[cabangId] = db.storesByCabang[cabangId] ?? []
        db.storesByCabang[cabangId].push(merged)
      }
    },
    seedUser(uid: string, data: Record<string, unknown>) {
      db.docs.set(`users/${uid}`, { ...data })
    },
    seedTarget(storeId: string, periode: string, data: Record<string, unknown>) {
      db.docs.set(`kontribusi_omset_targets/${storeId}__${periode}`, { ...data })
    },
  }

  function snapshot(exists: boolean, data: unknown) {
    return { exists, id: "snap", data: () => data }
  }

  function docRef(collectionName: string, id?: string) {
    const realId = id ?? `HIST_${++db.histSeq}`
    const path = `${collectionName}/${realId}`
    return {
      id: realId,
      path,
      get: async () => {
        const has = db.docs.has(path)
        return snapshot(has, has ? db.docs.get(path) : undefined)
      },
    }
  }

  const adminDb = {
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const tx = {
        get: async (ref: { path: string }) => {
          const has = db.docs.has(ref.path)
          return snapshot(has, has ? db.docs.get(ref.path) : undefined)
        },
        set: (ref: { path: string }, data: any) => {
          db.ops.push({ kind: "set", path: ref.path, data })
          // Materialisasi agar operasi kembali terlihat oleh GET
          // (semantik: set menimpa dengan merge atas data lama).
          db.docs.set(ref.path, { ...(db.docs.get(ref.path) ?? {}), ...data })
        },
        update: (ref: { path: string }, data: any) => {
          db.ops.push({ kind: "update", path: ref.path, data })
          db.docs.set(ref.path, { ...(db.docs.get(ref.path) ?? {}), ...data })
        },
        create: (ref: { path: string }, data: any) => {
          db.ops.push({ kind: "create", path: ref.path, data })
          db.docs.set(ref.path, { ...data })
        },
      }
      return fn(tx)
    },
    collection: (name: string) => ({
      doc: (id?: string) => docRef(name, id),
      where: (_field: string, _op: string, value: string) => ({
        get: async () => ({
          docs: (db.storesByCabang[value] ?? []).map((s) => ({
            id: s.__id,
            data: () => s,
          })),
        }),
      }),
    }),
  }

  const adminAuth = {
    verifyIdToken: async (token: string) => ({ uid: token }),
  }

  return { db, adminDb, adminAuth }
})

vi.mock("@/lib/firebase-admin", () => ({
  adminDb: fx.adminDb,
  adminAuth: fx.adminAuth,
}))

const TARGET_COLLECTION_PATH = "kontribusi_omset_targets"

function postRequest(body: unknown, token: string) {
  return new Request("http://localhost/api/kontribusi-omset/target", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

function getRequest(query: string, token: string) {
  return new Request(`http://localhost/api/kontribusi-omset/target?${query}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  })
}

const PERIODE_MENDATANG = "2099-01"
const ALASAN_VALID = "Penyesuaian target sesuai rencana penjualan toko."

beforeEach(() => {
  fx.db.reset()
})

describe("POST /api/kontribusi-omset/target — hak akses", () => {
  it("STORE membuat target tokonya sendiri; storeId body diabaikan", async () => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })

    const res = await POST(
      postRequest(
        {
          // Manipulasi: body menunjuk toko lain — server memakai profil.
          storeId: "ST99",
          periode: PERIODE_MENDATANG,
          targetBulanan: 5_000_000,
          alasan: ALASAN_VALID,
        },
        "uid-st",
      ),
    )
    const json = (await res.json()) as any

    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    expect(json.id).toBe("ST01__2099-01")

    const creates = fx.db.ops.filter((op) => op.kind === "create")
    expect(creates).toHaveLength(1)
    expect(creates[0].path).toBe(`${TARGET_COLLECTION_PATH}/ST01__2099-01`)
    expect(creates[0].data.storeId).toBe("ST01")
    expect(creates[0].data.cabangId).toBe("CAB1")
    expect(creates[0].data.targetBulanan).toBe(5_000_000)

    const hist = fx.db.ops.filter((op) => op.path.startsWith("kontribusi_omset_target_history"))
    expect(hist).toHaveLength(1)
    expect(hist[0].kind).toBe("set")
    expect(hist[0].data.targetSebelum).toBeNull()
    expect(hist[0].data.targetSesudah).toBe(5_000_000)
    expect(hist[0].data.storeId).toBe("ST01")
    expect(hist[0].data.actorUid).toBe("uid-st")
    expect(hist[0].data.alasan).toBe(ALASAN_VALID)
  })

  it(" STORE memperbarui targetnya sendiri — sebelum/sesudah tercatat benar", async () => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: 3_000_000,
    })

    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: PERIODE_MENDATANG,
          targetBulanan: 4_500_000,
          alasan: ALASAN_VALID,
        },
        "uid-st",
      ),
    )
    const json = (await res.json()) as any

    expect(res.status).toBe(200)
    expect(json.created).toBe(false)
    expect(json.targetSebelum).toBe(3_000_000)

    const updates = fx.db.ops.filter((op) => op.kind === "update")
    expect(updates).toHaveLength(1)
    expect(updates[0].path).toBe(`${TARGET_COLLECTION_PATH}/ST01__2099-01`)
    expect(updates[0].data.targetBulanan).toBe(4_500_000)

    const hist = fx.db.ops.filter((op) => op.path.startsWith("kontribusi_omset_target_history"))
    expect(hist).toHaveLength(1)
    expect(hist[0].data.targetSebelum).toBe(3_000_000)
    expect(hist[0].data.targetSesudah).toBe(4_500_000)
  })

  it("STORE ditolak memaksa target LAIN — server memakai profil, bukan body", async () => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })

    const res = await POST(
      postRequest(
        {
          storeId: "ST99",
          periode: PERIODE_MENDATANG,
          targetBulanan: 999,
          alasan: ALASAN_VALID,
        },
        "uid-st",
      ),
    )
    const json = (await res.json()) as any

    // Toko target tetap milik akun (ST01), bukan ST99 — tanpa
    // operasi apa pun ke ST99.
    expect([200, 201]).toContain(res.status)
    expect(json.id).toBe("ST01__2099-01")
    expect(
      fx.db.ops.some((op) => op.path.startsWith(`${TARGET_COLLECTION_PATH}/ST99`)),
    ).toBe(false)
  })

  it("CENTRAL_CABANG membuat target toko dalam cabangnya", async () => {
    fx.db.seedUser("uid-cb", {
      role: "central_cabang",
      storeId: "",
      cabangId: "CAB1",
      nama: "Cabang Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })

    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: PERIODE_MENDATANG,
          targetBulanan: 7_500_000,
          alasan: ALASAN_VALID,
        },
        "uid-cb",
      ),
    )
    const json = (await res.json()) as any

    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    expect(json.id).toBe("ST01__2099-01")
  })

  it("CENTRAL_CABANG ditolak untuk toko di luar cabangnya", async () => {
    fx.db.seedUser("uid-cb", {
      role: "central_cabang",
      storeId: "",
      cabangId: "CAB1",
      nama: "Cabang Sate",
      aktif: true,
    })
    fx.db.seedStore("ST99", { cabangId: "CAB2", storeId: "ST99", aktif: true })

    const res = await POST(
      postRequest(
        {
          storeId: "ST99",
          periode: PERIODE_MENDATANG,
          targetBulanan: 1_000_000,
          alasan: ALASAN_VALID,
        },
        "uid-cb",
      ),
    )

    expect(res.status).toBe(403)
    expect(fx.db.ops).toHaveLength(0)
  })

  it("CENTRAL_PUSAT membuat target toko pilihannya di cabang mana pun", async () => {
    fx.db.seedUser("uid-pu", {
      role: "central_pusat",
      storeId: "",
      cabangId: "",
      nama: "Pusat",
      aktif: true,
    })
    fx.db.seedStore("ST05", { cabangId: "CAB3", storeId: "ST05", aktif: true })

    const res = await POST(
      postRequest(
        {
          storeId: "ST05",
          periode: PERIODE_MENDATANG,
          targetBulanan: 9_000_000,
          alasan: ALASAN_VALID,
        },
        "uid-pu",
      ),
    )
    const json = (await res.json()) as any

    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    expect(json.id).toBe("ST05__2099-01")
  })

  it("role tak dikenal ditolak", async () => {
    fx.db.seedUser("uid-x", {
      role: "karyawan_biasa",
      storeId: "ST01",
      cabangId: "",
      nama: "X",
      aktif: true,
    })
    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: PERIODE_MENDATANG,
          targetBulanan: 1_000_000,
          alasan: ALASAN_VALID,
        },
        "uid-x",
      ),
    )
    expect(res.status).toBe(403)
    expect(fx.db.ops).toHaveLength(0)
  })
})

describe("POST /api/kontribusi-omset/target — validasi bisnis", () => {
  beforeEach(() => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })
  })

  const createBase = {
    storeId: "ST01",
    periode: PERIODE_MENDATANG,
    targetBulanan: 1_000_000,
    alasan: ALASAN_VALID,
  }

  it.each([-1, 1_000_000_000_000, "abc", null])(
    "nominal tidak valid ditolak: %s",
    async (nominal) => {
      const res = await POST(postRequest({ ...createBase, targetBulanan: nominal }, "uid-st"))
      expect(res.status).toBe(400)
      expect(fx.db.ops).toHaveLength(0)
    },
  )

  it("nominal desimal dengan titik diterima", async () => {
    const res = await POST(
      postRequest({ ...createBase, targetBulanan: 7_500_000.50 }, "uid-st"),
    )
    expect(res.status).toBe(201)
    const creates = fx.db.ops.filter((op) => op.kind === "create")
    expect(creates[0].data.targetBulanan).toBe(7_500_000.50)
  })

  it("nominal 0 (Rp0) diterima dan tercatat tersedia", async () => {
    const res = await POST(postRequest({ ...createBase, targetBulanan: 0 }, "uid-st"))
    const json = (await res.json()) as any
    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    const creates = fx.db.ops.filter((op) => op.kind === "create")
    expect(creates[0].data.targetBulanan).toBe(0)
  })

  it("alasan pendek pada PEMBUATAN awal (target belum ada) diterima sebagai opsional", async () => {
    const res = await POST(
      postRequest({ ...createBase, alasan: "singkat   " }, "uid-st"),
    )
    expect(res.status).toBe(201)
    const hist = fx.db.ops.filter((op) =>
      op.path.startsWith("kontribusi_omset_target_history"),
    )
    expect(hist).toHaveLength(1)
    expect(hist[0].data.alasan).toBe("singkat")
  })

  it("periode lampau ditolak", async () => {
    const res = await POST(
      postRequest({ ...createBase, periode: "2020-01" }, "uid-st"),
    )
    expect(res.status).toBe(400)
    expect(fx.db.ops).toHaveLength(0)
  })

  it("periode tidak valid ditolak", async () => {
    const res = await POST(
      postRequest({ ...createBase, periode: "2099-13" }, "uid-st"),
    )
    expect(res.status).toBe(400)
  })

  it("toko tidak aktif ditolak (Central Cabang cabangnya)", async () => {
    fx.db.seedUser("uid-cb", {
      role: "central_cabang",
      storeId: "",
      cabangId: "CAB1",
      nama: "Cabang Sate",
      aktif: true,
    })
    fx.db.seedStore("STOFF", { cabangId: "CAB1", storeId: "STOFF", aktif: false })
    const res = await POST(
      postRequest({ ...createBase, storeId: "STOFF" }, "uid-cb"),
    )
    expect(res.status).toBe(400)
    expect(fx.db.ops).toHaveLength(0)
  })

  it("STORE: toko nonaktif milik profil tetap ditolak", async () => {
    fx.db.docs.set("stores/ST01", { cabangId: "CAB1", storeId: "ST01", aktif: false })
    fx.db.storesByCabang = { CAB1: [] }
    const res = await POST(postRequest({ ...createBase }, "uid-st"))
    expect(res.status).toBe(400)
    expect(fx.db.ops).toHaveLength(0)
  })

  it("token tanpa header auth ditolak 401", async () => {
    const req = new Request("http://localhost/api/kontribusi-omset/target", {
      method: "POST",
      body: JSON.stringify(createBase),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe("POST — transaksi, fail-closed, histori", () => {
  beforeEach(() => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })
  })

  it("target korup → 409 dan TIDAK ADA operasi target maupun histori", async () => {
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: "CORRUPT",
    })
    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: PERIODE_MENDATANG,
          targetBulanan: 2_000_000,
          alasan: ALASAN_VALID,
        },
        "uid-st",
      ),
    )
    expect(res.status).toBe(409)
    expect(fx.db.ops).toHaveLength(0)
  })

  it.each([0, 123])(
    "update di atas target lama valid %s menulis histori setiap kali",
    async (nilaiLama) => {
      fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
        storeId: "ST01",
        cabangId: "CAB1",
        periode: PERIODE_MENDATANG,
        targetBulanan: nilaiLama,
      })
      const res = await POST(
        postRequest(
          {
            storeId: "ST01",
            periode: PERIODE_MENDATANG,
            targetBulanan: 3_000_000,
            alasan: ALASAN_VALID,
          },
          "uid-st",
        ),
      )
      expect(res.status).toBe(200)
      const hist = fx.db.ops.filter((op) =>
        op.path.startsWith("kontribusi_omset_target_history"),
      )
      const targetOps = fx.db.ops.filter((op) =>
        op.path.startsWith("kontribusi_omset_targets"),
      )
      // Satu histori + satu update target — konsisten satu banding satu.
      expect(hist).toHaveLength(1)
      expect(targetOps).toHaveLength(1)
      expect(hist[0].data.targetSebelum).toBe(nilaiLama)
      expect(hist[0].data.targetSesudah).toBe(3_000_000)
    },
  )
})

describe("POST — mode create/edit & alasan kondisional", () => {
  beforeEach(() => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })
  })

  const base = {
    storeId: "ST01",
    periode: PERIODE_MENDATANG,
    targetBulanan: 5_000_000,
  }

  it("pembuatan pertama TANPA alasan (mode create) berhasil — riwayat tetap, alasan kosong", async () => {
    const res = await POST(
      postRequest({ ...base, mode: "create", alasan: "   " }, "uid-st"),
    )
    const json = (await res.json()) as any

    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    expect(json.targetSebelum).toBeNull()
    const hist = fx.db.ops.filter((op) =>
      op.path.startsWith("kontribusi_omset_target_history"),
    )
    expect(hist).toHaveLength(1)
    expect(hist[0].data.targetSebelum).toBeNull()
    expect(hist[0].data.targetSesudah).toBe(5_000_000)
    expect(hist[0].data.alasan).toBe("")
  })

  it("pembuatan pertama dengan alasan opsional disimpan ter-trim", async () => {
    const res = await POST(
      postRequest({ ...base, mode: "create", alasan: "  Target awal periode baru.  " }, "uid-st"),
    )
    const json = (await res.json()) as any
    expect(res.status).toBe(201)
    const hist = fx.db.ops.filter((op) =>
      op.path.startsWith("kontribusi_omset_target_history"),
    )
    expect(hist).toHaveLength(1)
    expect(hist[0].data.alasan).toBe("Target awal periode baru.")
  })

  it("konflik: mode create tetapi target SUDAH ada → 409 tanpa operasi (tidak menimpa)", async () => {
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: 1_000_000,
    })
    const res = await POST(
      postRequest({ ...base, mode: "create", alasan: ALASAN_VALID }, "uid-st"),
    )
    expect(res.status).toBe(409)
    expect(fx.db.ops).toHaveLength(0)
  })

  it("konflik: mode edit tetapi target BELUM ada → 409 tanpa operasi (tidak dibuat diam-diam)", async () => {
    const res = await POST(
      postRequest({ ...base, mode: "edit", alasan: ALASAN_VALID }, "uid-st"),
    )
    expect(res.status).toBe(409)
    expect(fx.db.ops).toHaveLength(0)
  })

  it("perubahan TANPA alasan diterima — mode edit", async () => {
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: 1_000_000,
    })
    const res = await POST(
      postRequest({ ...base, mode: "edit", alasan: "" }, "uid-st"),
    )
    expect(res.status).toBe(200)
    const updates = fx.db.ops.filter((op) => op.kind === "update")
    expect(updates).toHaveLength(1)
    expect(updates[0].data.targetBulanan).toBe(5_000_000)
  })

  it("perubahan alasan pendek diterima — mode edit", async () => {
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: 1_000_000,
    })
    const res = await POST(
      postRequest({ ...base, mode: "edit", alasan: "ragu      " }, "uid-st"),
    )
    expect(res.status).toBe(200)
    const updates = fx.db.ops.filter((op) => op.kind === "update")
    expect(updates).toHaveLength(1)
    expect(updates[0].data.targetBulanan).toBe(5_000_000)
  })

  it("perubahan valid (mode edit) berhasil — sebelum/sesudah + riwayat", async () => {
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: 2_000_000,
    })
    const res = await POST(
      postRequest({ ...base, targetBulanan: 2_500_000, mode: "edit", alasan: ALASAN_VALID }, "uid-st"),
    )
    const json = (await res.json()) as any
    expect(res.status).toBe(200)
    expect(json.created).toBe(false)
    expect(json.targetSebelum).toBe(2_000_000)
    const hist = fx.db.ops.filter((op) =>
      op.path.startsWith("kontribusi_omset_target_history"),
    )
    const updates = fx.db.ops.filter((op) => op.kind === "update")
    expect(hist).toHaveLength(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].data.targetBulanan).toBe(2_500_000)
  })

  it("legacy tanpa flag mode: alasan tidak lagi wajib pada update", async () => {
    fx.db.seedTarget("ST01", PERIODE_MENDATANG, {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: PERIODE_MENDATANG,
      targetBulanan: 1_000_000,
    })
    const res = await POST(
      postRequest({ ...base, alasan: "pendek    " }, "uid-st"),
    )
    expect(res.status).toBe(200)
    const updates = fx.db.ops.filter((op) => op.kind === "update")
    expect(updates).toHaveLength(1)
    expect(updates[0].data.targetBulanan).toBe(5_000_000)
  })

  it("legacy tanpa flag mode: pembuatan awal tetap memungkinkan alasan kosong", async () => {
    const res = await POST(postRequest({ ...base, alasan: "" }, "uid-st"))
    const json = (await res.json()) as any
    expect(res.status).toBe(201)
    expect(json.created).toBe(true)
    const hist = fx.db.ops.filter((op) =>
      op.path.startsWith("kontribusi_omset_target_history"),
    )
    expect(hist[0].data.targetSebelum).toBeNull()
  })

  it("mode tidak dikenal ditolak", async () => {
    const res = await POST(
      postRequest({ ...base, mode: "replace-all", alasan: ALASAN_VALID }, "uid-st"),
    )
    expect(res.status).toBe(400)
  })

  it("Rp0 via mode create tetap tersaji sebagai target tersedia", async () => {
    const res = await POST(
      postRequest({ ...base, targetBulanan: 0, mode: "create", alasan: "" }, "uid-st"),
    )
    const json = (await res.json()) as any
    expect(res.status).toBe(201)
    const creates = fx.db.ops.filter((op) => op.kind === "create")
    expect(creates[0].data.targetBulanan).toBe(0)
    const getRes = await GET(getRequest("year=2099&month=0&store=ST01", "uid-st"))
    const getJson = (await getRes.json()) as any
    expect(getJson.targets[0].targetTersedia).toBe(true)
    expect(getJson.targets[0].targetBulanan).toBe(0)
  })
})

describe("GET /api/kontribusi-omset/target — scope", () => {
  beforeEach(() => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })
  })

  it("STORE ditolak membaca toko lain via query store", async () => {
    const res = await GET(getRequest("year=2099&month=0&store=ST99", "uid-st"))
    expect(res.status).toBe(403)
  })

  it("STORE tanpa target → targetTersedia false, targetBulanan null", async () => {
    const res = await GET(getRequest("year=2099&month=0&store=ST01", "uid-st"))
    const json = (await res.json()) as any
    expect(res.status).toBe(200)
    expect(json.targets[0].targetTersedia).toBe(false)
    expect(json.targets[0].targetBulanan).toBeNull()
  })

  it("STORE dengan target Rp0 → targetTersedia true, nilai 0 (bukan belum tersedia)", async () => {
    fx.db.seedTarget("ST01", "2099-01", {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: "2099-01",
      targetBulanan: 0,
    })
    const res = await GET(getRequest("year=2099&month=0&store=ST01", "uid-st"))
    const json = (await res.json()) as any
    expect(res.status).toBe(200)
    expect(json.targets[0].targetTersedia).toBe(true)
    expect(json.targets[0].targetBulanan).toBe(0)
  })
})

describe("POST — employeeCountSnapshot penyimpanan snapshot", () => {
  beforeEach(() => {
    fx.db.seedUser("uid-st", {
      role: "store",
      storeId: "ST01",
      cabangId: "CAB1",
      nama: "Toko Sate",
      aktif: true,
    })
    fx.db.seedStore("ST01", { cabangId: "CAB1", storeId: "ST01", aktif: true })
  })

  const ALASAN_VALID = "Penyesuaian target sesuai rencana penjualan toko."

  it("Pembuatan target menyimpan employeeCountSnapshot dari body", async () => {
    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: "2099-01",
          targetBulanan: 600_000_000,
          alasan: ALASAN_VALID,
          employeeCountSnapshot: 10,
        },
        "uid-st",
      ),
    )
    const json = (await res.json()) as any
    expect(res.status).toBe(201)
    expect(json.created).toBe(true)

    const creates = fx.db.ops.filter((op) => op.kind === "create")
    expect(creates).toHaveLength(1)
    expect(creates[0].data.employeeCountSnapshot).toBe(10)

    const getRes = await GET(getRequest("year=2099&month=0&store=ST01", "uid-st"))
    const getJson = (await getRes.json()) as any
    expect(getJson.targets[0].employeeCountSnapshot).toBe(10)
  })

  it("Pembuatan target tanpa employeeCountSnapshot disimpan sebagai null", async () => {
    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: "2099-01",
          targetBulanan: 600_000_000,
          alasan: ALASAN_VALID,
        },
        "uid-st",
      ),
    )
    expect(res.status).toBe(201)

    const creates = fx.db.ops.filter((op) => op.kind === "create")
    expect(creates[0].data.employeeCountSnapshot).toBeNull()
  })

  it("Perubahan target dengan employeeCountSnapshot baru memperbarui snapshot", async () => {
    fx.db.seedTarget("ST01", "2099-01", {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: "2099-01",
      targetBulanan: 600_000_000,
      employeeCountSnapshot: 10,
    })

    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: "2099-01",
          targetBulanan: 750_000_000,
          alasan: ALASAN_VALID,
          employeeCountSnapshot: 15,
          mode: "edit",
        },
        "uid-st",
      ),
    )
    expect(res.status).toBe(200)

    const updates = fx.db.ops.filter((op) => op.kind === "update")
    expect(updates).toHaveLength(1)
    expect(updates[0].data.employeeCountSnapshot).toBe(15)

    const getRes = await GET(getRequest("year=2099&month=0&store=ST01", "uid-st"))
    const getJson = (await getRes.json()) as any
    expect(getJson.targets[0].employeeCountSnapshot).toBe(15)
  })

  it("Perubahan target tanpa employeeCountSnapshot tidak menimpa snapshot lama", async () => {
    fx.db.seedTarget("ST01", "2099-01", {
      storeId: "ST01",
      cabangId: "CAB1",
      periode: "2099-01",
      targetBulanan: 600_000_000,
      employeeCountSnapshot: 10,
    })

    const res = await POST(
      postRequest(
        {
          storeId: "ST01",
          periode: "2099-01",
          targetBulanan: 750_000_000,
          alasan: ALASAN_VALID,
          mode: "edit",
        },
        "uid-st",
      ),
    )
    expect(res.status).toBe(200)

    const updates = fx.db.ops.filter((op) => op.kind === "update")
    // employeeCountSnapshot tidak ada di data update → tidak ditimpa
    expect(updates[0].data.employeeCountSnapshot).toBeUndefined()

    const getRes = await GET(getRequest("year=2099&month=0&store=ST01", "uid-st"))
    const getJson = (await getRes.json()) as any
    expect(getJson.targets[0].employeeCountSnapshot).toBe(10)
  })
})
