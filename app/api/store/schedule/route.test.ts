import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => {
  type RecordFixture = { id: string; data: Record<string, unknown> }

  const state: {
    profile: Record<string, unknown>
    employees: RecordFixture[]
    stores: RecordFixture[]
    drafts: Record<string, Record<string, unknown>>
    finals: Record<string, Record<string, unknown>>
  } = {
    profile: {},
    employees: [],
    stores: [],
    drafts: {},
    finals: {},
  }
  const writes: Array<Record<string, unknown>> = []

  const adminAuth = {
    verifyIdToken: vi.fn(async (token: string) => {
      if (token !== "fixture-token") throw new Error("Unexpected token in test fixture")
      return { uid: "fixture-user" }
    }),
  }

  const adminDb = {
    collection: vi.fn((collectionName: string) => {
      const recordsFor = (name: string): RecordFixture[] => {
        if (name === "employees") return state.employees
        if (name === "stores") return state.stores
        if (name === "schedule_drafts") {
          return Object.entries(state.drafts).map(([id, data]) => ({ id, data }))
        }
        if (name === "schedules") {
          return Object.entries(state.finals).map(([id, data]) => ({ id, data }))
        }
        throw new Error(`Unexpected mocked collection access: ${name}`)
      }

      return {
        doc: (id: string) => ({
          get: async () => {
            if (collectionName === "users") {
              const exists = id === "fixture-user"
              return {
                exists,
                data: () => exists ? state.profile : undefined,
              }
            }

            const record = collectionName === "schedule_drafts"
              ? state.drafts[id]
              : collectionName === "schedules"
                ? state.finals[id]
                : undefined
            if (!record && collectionName !== "schedule_drafts" && collectionName !== "schedules") {
              throw new Error(`Unexpected mocked document access: ${collectionName}/${id}`)
            }
            return { exists: Boolean(record), data: () => record }
          },
          set: async (data: Record<string, unknown>, options?: Record<string, unknown>) => {
            writes.push({ operation: "set", collection: collectionName, id, data, options })
            if (collectionName === "schedule_drafts") {
              state.drafts[id] = { ...(state.drafts[id] ?? {}), ...data }
            }
            if (collectionName === "schedules") {
              state.finals[id] = { ...(state.finals[id] ?? {}), ...data }
            }
          },
        delete: async () => {
          writes.push({ operation: "delete", collection: collectionName, id })
          if (collectionName === "schedules") delete state.finals[id]
          if (collectionName === "schedule_drafts") delete state.drafts[id]
        },
        }),
        where: (field: string, operator: string, value: unknown) => {
          if (operator !== "==") throw new Error(`Unexpected mocked query operator: ${operator}`)
          const filters: Array<[string, unknown]> = [[field, value]]
          const query = {
            where: (nextField: string, nextOperator: string, nextValue: unknown) => {
              if (nextOperator !== "==") throw new Error(`Unexpected mocked query operator: ${nextOperator}`)
              filters.push([nextField, nextValue])
              return query
            },
            get: async () => {
              const docs = recordsFor(collectionName)
                .filter((record) => filters.every(([filterField, filterValue]) => record.data[filterField] === filterValue))
                .map((record) => ({
                  id: record.id,
                  data: () => record.data,
                  ref: {
                    delete: async () => {
                      writes.push({ operation: "delete", collection: collectionName, id: record.id })
                      if (collectionName === "schedules") delete state.finals[record.id]
                      if (collectionName === "schedule_drafts") delete state.drafts[record.id]
                    },
                  },
                }))
              return { docs }
            },
          }
          return query
        },
      }
    }),
  }

  function reset() {
    state.profile = {
      role: "store",
      aktif: true,
      storeId: "STORE-1",
      cabangId: "BRANCH-1",
    }
    state.employees = [
      { id: "EMP-1", data: { storeId: "STORE-1" } },
      { id: "EMP-OTHER", data: { storeId: "STORE-OTHER" } },
    ]
    state.stores = [
      { id: "STORE-1", data: { storeId: "STORE-1", cabangId: "BRANCH-1", aktif: true } },
      { id: "STORE-2", data: { storeId: "STORE-2", cabangId: "BRANCH-1", aktif: true } },
      { id: "STORE-OFF", data: { storeId: "STORE-OFF", cabangId: "BRANCH-1", aktif: false } },
      { id: "STORE-OTHER-BRANCH", data: { storeId: "STORE-OTHER-BRANCH", cabangId: "BRANCH-2", aktif: true } },
    ]
    state.drafts = {}
    state.finals = {}
    writes.length = 0
  }

  return { state, writes, adminAuth, adminDb, reset }
})

// These mocks are hoisted before the route's dynamic import. No test imports
// lib/firebase-admin or initializes an Admin SDK app.
vi.mock("@/lib/firebase-admin", () => ({
  adminAuth: fixture.adminAuth,
  adminDb: fixture.adminDb,
}))

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: vi.fn(() => "__FIXTURE_DELETE__"),
    serverTimestamp: vi.fn(() => "__FIXTURE_TIMESTAMP__"),
  },
}))

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { updateScheduleCellAfterDelete } from "@/lib/schedule-cell"

let POST: typeof import("./route").POST

beforeAll(async () => {
  ;({ POST } = await import("./route"))
})

const STORE_ID = "STORE-1"
const BRANCH_ID = "BRANCH-1"
const EMPLOYEE_ID = "EMP-1"
const DATE = "2026-10-02"
const SCHEDULE_ID = `${STORE_ID}_${DATE}_${EMPLOYEE_ID}`

function requestFor(mode: "draft" | "final", body: Record<string, unknown>) {
  return new Request(`http://unit.test/api/store/schedule?mode=${mode}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

function draftBody(...entries: Array<[string, unknown]>) {
  return {
    days: [
      {
        tanggal: DATE,
        ...Object.fromEntries(entries),
      },
    ],
  }
}

function finalBody(
  cell: Record<string, unknown>,
  employeeId = EMPLOYEE_ID,
) {
  return {
    year: 2026,
    month: 9,
    cells: [{ employeeId, tanggal: DATE, ...cell }],
  }
}

function backupCell(tokoTujuan?: string) {
  return {
    status: "status_khusus",
    statusKhusus: "backup_toko_lain",
    ...(tokoTujuan === undefined ? {} : { tokoTujuan }),
  }
}

async function post(mode: "draft" | "final", body: Record<string, unknown>) {
  const response = await POST(requestFor(mode, body))
  return { response, payload: await response.json() as Record<string, unknown> }
}

async function deleteFinalCell(employeeId: string, tanggal: string) {
  const response = await POST(new Request("http://unit.test/api/store/schedule?mode=final-delete", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ employeeId, tanggal }),
  }))
  return { response, payload: await response.json() as Record<string, unknown> }
}

async function deleteDraftCell(employeeId: string, tanggal: string) {
  const response = await POST(new Request("http://unit.test/api/store/schedule?mode=draft-delete", {
    method: "POST",
    headers: {
      Authorization: "Bearer fixture-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ employeeId, tanggal }),
  }))
  return { response, payload: await response.json() as Record<string, unknown> }
}

function addLegacyRecord(
  collection: "drafts" | "finals",
  overrides: Record<string, unknown> = {},
) {
  const record = {
    storeId: STORE_ID,
    cabangId: BRANCH_ID,
    employeeId: EMPLOYEE_ID,
    tanggal: DATE,
    status: "status_khusus",
    statusKhusus: "backup_toko_lain",
    ...overrides,
  }
  fixture.state[collection][SCHEDULE_ID] = record
}

beforeEach(() => {
  fixture.reset()
  fixture.adminAuth.verifyIdToken.mockClear()
  fixture.adminDb.collection.mockClear()
})

describe("POST /api/store/schedule with isolated Firebase fixtures", () => {
  it("uses the mock Firebase modules before loading the route", () => {
    expect(adminAuth).toBe(fixture.adminAuth)
    expect(adminDb).toBe(fixture.adminDb)
  })

  it("deletes only the selected final schedule cell for the authenticated store", async () => {
    fixture.state.finals[SCHEDULE_ID] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }
    fixture.state.finals["OTHER-CELL"] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: "EMP-OTHER",
      tanggal: DATE,
      status: "shift_siang",
    }

    const result = await deleteFinalCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(result.payload.deleted).toBe(1)
    expect(fixture.state.finals[SCHEDULE_ID]).toBeUndefined()
    expect(fixture.state.finals["OTHER-CELL"]).toBeDefined()
    expect(fixture.writes).toEqual([
      { operation: "delete", collection: "schedules", id: SCHEDULE_ID },
    ])
  })

  it("deletes a final cell whose legacy document ID is not deterministic", async () => {
    fixture.state.finals["legacy-final-document"] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "status_khusus",
      statusKhusus: "training",
    }

    const tableReadCell = () => Object.values(fixture.state.finals).filter(
      (record) =>
        record.storeId === STORE_ID &&
        record.tanggal === DATE &&
        record.employeeId === EMPLOYEE_ID,
    )
    expect(tableReadCell()).toHaveLength(1)

    const result = await deleteFinalCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(result.payload.deleted).toBe(1)
    expect(fixture.state.finals["legacy-final-document"]).toBeUndefined()
    expect(tableReadCell()).toHaveLength(0)
    expect(fixture.writes).toEqual([
      { operation: "delete", collection: "schedules", id: "legacy-final-document" },
    ])
  })

  it("rejects an ambiguous final cell without deleting any matching record", async () => {
    fixture.state.finals[SCHEDULE_ID] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }
    fixture.state.finals["duplicate-final-document"] = {
      storeId: STORE_ID,
      cabangId: "BRANCH-OTHER",
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "status_khusus",
      statusKhusus: "training",
    }

    const result = await deleteFinalCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(409)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.finals[SCHEDULE_ID]).toBeDefined()
    expect(fixture.state.finals["duplicate-final-document"]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it("does not delete a matching cell outside the authenticated branch", async () => {
    fixture.state.finals["other-branch-cell"] = {
      storeId: STORE_ID,
      cabangId: "BRANCH-OTHER",
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }

    const result = await deleteFinalCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(404)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.finals["other-branch-cell"]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it("does not report success or delete another cell when the final cell is absent", async () => {
    fixture.state.finals["OTHER-CELL"] = {
      storeId: STORE_ID,
      employeeId: "EMP-OTHER",
      tanggal: DATE,
      status: "shift_siang",
    }

    const result = await deleteFinalCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(404)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.finals["OTHER-CELL"]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it("removes the deleted final cell from the UI schedule state and preserves other cells", () => {
    const scheduleState = [
      { employeeId: EMPLOYEE_ID, tanggal: DATE, status: "status_khusus", statusKhusus: "training" },
      { employeeId: "EMP-OTHER", tanggal: DATE, status: "shift_siang" },
    ]

    const updatedState = updateScheduleCellAfterDelete(scheduleState, EMPLOYEE_ID, DATE, true)

    expect(updatedState).toEqual([
      { employeeId: "EMP-OTHER", tanggal: DATE, status: "shift_siang" },
    ])
  })

  it("keeps the final cell visible in UI state when deletion fails", () => {
    const scheduleState = [
      { employeeId: EMPLOYEE_ID, tanggal: DATE, status: "status_khusus", statusKhusus: "training" },
    ]

    const updatedState = updateScheduleCellAfterDelete(scheduleState, EMPLOYEE_ID, DATE, false)

    expect(updatedState).toBe(scheduleState)
    expect(updatedState).toHaveLength(1)
  })

  it("keeps final cell deletion restricted to store accounts", async () => {
    fixture.state.profile.role = "central_cabang"

    const result = await deleteFinalCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(403)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it("deletes a matching legacy draft by field identity and preserves other cells", async () => {
    fixture.state.drafts["legacy-draft-document"] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "status_khusus",
      statusKhusus: "training",
    }
    fixture.state.drafts["other-draft-cell"] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: "EMP-OTHER",
      tanggal: DATE,
      status: "shift_siang",
    }

    const result = await deleteDraftCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(result.payload.deleted).toBe(1)
    expect(fixture.state.drafts["legacy-draft-document"]).toBeUndefined()
    expect(fixture.state.drafts["other-draft-cell"]).toBeDefined()
    expect(fixture.writes).toEqual([
      { operation: "delete", collection: "schedule_drafts", id: "legacy-draft-document" },
    ])
  })

  it("returns 404 without writes when the draft cell does not exist", async () => {
    fixture.state.drafts["other-draft-cell"] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: "EMP-OTHER",
      tanggal: DATE,
      status: "shift_siang",
    }

    const result = await deleteDraftCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(404)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.drafts["other-draft-cell"]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it("returns 409 without deleting when multiple draft records match one cell", async () => {
    fixture.state.drafts[SCHEDULE_ID] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }
    fixture.state.drafts["duplicate-legacy-draft"] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "status_khusus",
      statusKhusus: "training",
    }

    const result = await deleteDraftCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(409)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.drafts[SCHEDULE_ID]).toBeDefined()
    expect(fixture.state.drafts["duplicate-legacy-draft"]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it("does not delete a draft from another branch", async () => {
    fixture.state.drafts["other-branch-draft"] = {
      storeId: STORE_ID,
      cabangId: "BRANCH-OTHER",
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }

    const result = await deleteDraftCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(404)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.drafts["other-branch-draft"]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it("keeps draft cell deletion restricted to store accounts", async () => {
    fixture.state.profile.role = "central_cabang"
    fixture.state.drafts[SCHEDULE_ID] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }

    const result = await deleteDraftCell(EMPLOYEE_ID, DATE)

    expect(result.response.status).toBe(403)
    expect(result.payload.success).toBe(false)
    expect(fixture.state.drafts[SCHEDULE_ID]).toBeDefined()
    expect(fixture.writes).toEqual([])
  })

  it.each(["draft", "final"] as const)("accepts a valid employee for %s using the deterministic document ID", async (mode) => {
    const result = mode === "draft"
      ? await post(mode, draftBody([EMPLOYEE_ID, "shift_pagi"]))
      : await post(mode, finalBody({ status: "shift_pagi" }))

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(fixture.writes).toMatchObject([
      {
        operation: "set",
        collection: mode === "draft" ? "schedule_drafts" : "schedules",
        id: SCHEDULE_ID,
      },
    ])
    expect(Object.keys(mode === "draft" ? fixture.state.drafts : fixture.state.finals)).toEqual([SCHEDULE_ID])
  })

  it.each([
    ["draft", "unknown employee", "EMP-MISSING"],
    ["draft", "employee from another store", "EMP-OTHER"],
    ["final", "unknown employee", "EMP-MISSING"],
    ["final", "employee from another store", "EMP-OTHER"],
  ] as const)("rejects %s with %s without writes", async (mode, _label, employeeId) => {
    const result = mode === "draft"
      ? await post(mode, draftBody([employeeId, "shift_pagi"]))
      : await post(mode, finalBody({ status: "shift_pagi" }, employeeId))

    expect(result.response.status).toBe(400)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it("rejects malformed draft mixed with a valid cell before writes", async () => {
    const result = await post("draft", draftBody(
      [EMPLOYEE_ID, "shift_pagi"],
      ["EMP-2", { status: "not-a-valid-status" }],
    ))

    expect(result.response.status).toBe(400)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it("rejects malformed final mixed with a valid cell before writes", async () => {
    const result = await post("final", {
      year: 2026,
      month: 9,
      cells: [
        { employeeId: EMPLOYEE_ID, tanggal: DATE, status: "shift_pagi" },
        { employeeId: EMPLOYEE_ID, tanggal: DATE, status: "invalid" },
      ],
    })

    expect(result.response.status).toBe(400)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it.each([
    ["draft", ""],
    ["draft", "   "],
    ["final", ""],
    ["final", "   "],
  ] as const)("rejects lainnya with blank keterangan for %s before writes", async (mode, keterangan) => {
    const cell = {
      status: "status_khusus",
      statusKhusus: "lainnya",
      keterangan,
    }
    const result = mode === "draft"
      ? await post(mode, draftBody([EMPLOYEE_ID, cell]))
      : await post(mode, finalBody(cell))

    expect(result.response.status).toBe(400)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it.each([
    ["draft", "empty", ""],
    ["draft", "unknown", "STORE-MISSING"],
    ["draft", "inactive", "STORE-OFF"],
    ["draft", "in another branch", "STORE-OTHER-BRANCH"],
    ["draft", "the owning store itself", STORE_ID],
    ["final", "empty", ""],
    ["final", "unknown", "STORE-MISSING"],
    ["final", "inactive", "STORE-OFF"],
    ["final", "in another branch", "STORE-OTHER-BRANCH"],
    ["final", "the owning store itself", STORE_ID],
  ] as const)("rejects a %s backup target that is %s without writes", async (mode, _label, targetId) => {
    const result = mode === "draft"
      ? await post(mode, draftBody([EMPLOYEE_ID, backupCell(targetId)]))
      : await post(mode, finalBody(backupCell(targetId)))

    expect(result.response.status).toBe(400)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it.each(["draft", "final"] as const)("accepts and canonicalizes a valid backup target for %s", async (mode) => {
    const submitted = backupCell(" store-2 ")
    const result = mode === "draft"
      ? await post(mode, draftBody([EMPLOYEE_ID, submitted]))
      : await post(mode, finalBody(submitted))

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    const targetWrite = fixture.writes.find((write) => write.operation === "set")
    expect(targetWrite).toMatchObject({
      collection: mode === "draft" ? "schedule_drafts" : "schedules",
      data: { tokoTujuan: "STORE-2" },
    })
  })

  it("preserves an unchanged legacy backup without target when the effective draft identity matches", async () => {
    addLegacyRecord("drafts")

    const result = await post("draft", draftBody([EMPLOYEE_ID, backupCell()]))

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(fixture.writes).toMatchObject([
      { operation: "set", collection: "schedule_drafts", data: { statusKhusus: "backup_toko_lain" } },
    ])
  })

  it.each(["draft", "final"] as const)(
    "preserves an unchanged legacy backup without target from a non-deterministic %s document ID",
    async (mode) => {
      const collection = mode === "draft" ? "drafts" : "finals"
      fixture.state[collection][`legacy-${mode}-backup-document`] = {
        storeId: STORE_ID,
        cabangId: BRANCH_ID,
        employeeId: EMPLOYEE_ID,
        tanggal: DATE,
        status: "status_khusus",
        statusKhusus: "backup_toko_lain",
      }

      const result = mode === "draft"
        ? await post(mode, draftBody([EMPLOYEE_ID, backupCell()]))
        : await post(mode, finalBody(backupCell()))

      expect(result.response.status).toBe(200)
      expect(result.payload.success).toBe(true)
      expect(fixture.writes).toMatchObject([
        {
          operation: "set",
          collection: mode === "draft" ? "schedule_drafts" : "schedules",
          id: `legacy-${mode}-backup-document`,
          data: { statusKhusus: "backup_toko_lain" },
        },
      ])
      expect(Object.keys(collection === "drafts" ? fixture.state.drafts : fixture.state.finals)).toEqual([
        `legacy-${mode}-backup-document`,
      ])
    },
  )

  it.each(["draft", "final"] as const)(
    "rejects multiple matching %s documents before writing any cell",
    async (mode) => {
      const collection = mode === "draft" ? "drafts" : "finals"
      const records = mode === "draft" ? fixture.state.drafts : fixture.state.finals
      records[`${mode}-legacy-one`] = {
        storeId: STORE_ID,
        cabangId: BRANCH_ID,
        employeeId: EMPLOYEE_ID,
        tanggal: DATE,
        status: "shift_pagi",
      }
      records[`${mode}-legacy-two`] = {
        storeId: STORE_ID,
        cabangId: BRANCH_ID,
        employeeId: EMPLOYEE_ID,
        tanggal: DATE,
        status: "shift_siang",
      }

      const result = mode === "draft"
        ? await post(mode, draftBody([EMPLOYEE_ID, "libur"]))
        : await post(mode, finalBody({ status: "libur" }))

      expect(result.response.status).toBe(409)
      expect(result.payload.success).toBe(false)
      expect(fixture.writes).toEqual([])
      expect(Object.keys(records)).toEqual([`${mode}-legacy-one`, `${mode}-legacy-two`])
    },
  )

  it.each(["draft", "final"] as const)(
    "rejects a matching %s document outside the authenticated branch before writing",
    async (mode) => {
      const records = mode === "draft" ? fixture.state.drafts : fixture.state.finals
      records[`${mode}-other-branch`] = {
        storeId: STORE_ID,
        cabangId: "BRANCH-OTHER",
        employeeId: EMPLOYEE_ID,
        tanggal: DATE,
        status: "shift_pagi",
      }

      const result = mode === "draft"
        ? await post(mode, draftBody([EMPLOYEE_ID, "libur"]))
        : await post(mode, finalBody({ status: "libur" }))

      expect(result.response.status).toBe(409)
      expect(result.payload.success).toBe(false)
      expect(fixture.writes).toEqual([])
      expect(Object.keys(records)).toEqual([`${mode}-other-branch`])
    },
  )

  it.each(["draft", "final"] as const)(
    "does not treat a backup without target as legacy when no %s record matches",
    async (mode) => {
      const result = mode === "draft"
        ? await post(mode, draftBody([EMPLOYEE_ID, backupCell()]))
        : await post(mode, finalBody(backupCell()))

      expect(result.response.status).toBe(400)
      expect(result.payload.success).toBe(false)
      expect(fixture.writes).toEqual([])
    },
  )

  it.each(["draft", "final"] as const)(
    "rejects an ambiguous legacy %s backup without choosing a document",
    async (mode) => {
      const collection = mode === "draft" ? "drafts" : "finals"
      for (const id of [`legacy-${mode}-one`, `legacy-${mode}-two`]) {
        fixture.state[collection][id] = {
          storeId: STORE_ID,
          cabangId: BRANCH_ID,
          employeeId: EMPLOYEE_ID,
          tanggal: DATE,
          status: "status_khusus",
          statusKhusus: "backup_toko_lain",
        }
      }

      const result = mode === "draft"
        ? await post(mode, draftBody([EMPLOYEE_ID, backupCell()]))
        : await post(mode, finalBody(backupCell()))

      expect(result.response.status).toBe(400)
      expect(result.payload.success).toBe(false)
      expect(fixture.writes).toEqual([])
    },
  )

  it.each(["draft", "final"] as const)(
    "rejects a legacy %s backup outside the authenticated branch",
    async (mode) => {
      const collection = mode === "draft" ? "drafts" : "finals"
      fixture.state[collection][`out-of-scope-${mode}-backup`] = {
        storeId: STORE_ID,
        cabangId: "BRANCH-OTHER",
        employeeId: EMPLOYEE_ID,
        tanggal: DATE,
        status: "status_khusus",
        statusKhusus: "backup_toko_lain",
      }

      const result = mode === "draft"
        ? await post(mode, draftBody([EMPLOYEE_ID, backupCell()]))
        : await post(mode, finalBody(backupCell()))

      expect(result.response.status).toBe(400)
      expect(result.payload.success).toBe(false)
      expect(fixture.writes).toEqual([])
    },
  )

  it("uses the matching draft over a different legacy final record", async () => {
    fixture.state.drafts[SCHEDULE_ID] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: EMPLOYEE_ID,
      tanggal: DATE,
      status: "shift_pagi",
    }
    addLegacyRecord("finals")

    const result = await post("draft", draftBody([EMPLOYEE_ID, backupCell()]))

    expect(result.response.status).toBe(400)
    expect(result.payload.success).toBe(false)
    expect(fixture.writes).toEqual([])
  })

  it("falls back to a matching final legacy record when the draft identity does not match", async () => {
    fixture.state.drafts[SCHEDULE_ID] = {
      storeId: STORE_ID,
      cabangId: BRANCH_ID,
      employeeId: "EMP-STALE",
      tanggal: DATE,
      status: "shift_pagi",
    }
    addLegacyRecord("finals")

    const result = await post("draft", draftBody([EMPLOYEE_ID, backupCell()]))

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(fixture.writes).toMatchObject([
      { operation: "set", collection: "schedule_drafts" },
    ])
  })

  it("allows finalizing a matching legacy final backup without target when no draft exists", async () => {
    addLegacyRecord("finals")

    const result = await post("final", finalBody(backupCell()))

    expect(result.response.status).toBe(200)
    expect(result.payload.success).toBe(true)
    expect(fixture.writes).toMatchObject([
      { operation: "set", collection: "schedules", data: { statusKhusus: "backup_toko_lain" } },
    ])
  })
})
