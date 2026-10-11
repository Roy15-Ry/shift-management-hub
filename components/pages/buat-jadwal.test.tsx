// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-03`
  const employees = [
    { id: "EMP-A", name: "KARYAWAN A", nik: "A", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
    { id: "EMP-B", name: "KARYAWAN B", nik: "B", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
  ]
  const state: {
    drafts: Record<string, unknown>[]
    finals: Record<string, unknown>[]
    deleteResponse: (mode: string) => Promise<Response>
  } = {
    drafts: [],
    finals: [],
    deleteResponse: async () => Response.json({ success: true, deleted: 1 }),
  }
  const user = { getIdToken: vi.fn(async () => "test-token") }

  return {
    date,
    employees,
    state,
    user,
    profile: { role: "store", storeId: "STORE-1", cabangId: "BRANCH-1" },
    store: { id: "STORE-1", nama: "Toko Test", kode: "T1", cabangId: "BRANCH-1", aktif: true },
  }
})

vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({ profile: fixture.profile, user: fixture.user }),
}))

vi.mock("@/lib/firestore-data", () => ({
  getFirestoreEmployees: async () => fixture.employees,
  getFirestoreMonthlySchedules: async () => fixture.state.finals,
  getFirestorePreviousMonthLastDay: async () => ({}),
  getFirestoreStores: async () => [fixture.store],
}))

vi.mock("@/components/rekap-jumlah-masuk", () => ({
  RekapJumlahMasukTable: () => null,
}))

vi.mock("@/lib/pdf-shift", () => ({
  generateShiftSchedulePdf: vi.fn(),
  slugifyStoreName: (name: string) => name,
}))

import { BuatJadwalPage } from "./buat-jadwal"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const statusCell = (employeeId: string) => ({
  id: `${employeeId}-${fixture.date}`,
  storeId: "STORE-1",
  cabangId: "BRANCH-1",
  employeeId,
  tanggal: fixture.date,
  status: "status_khusus",
  statusKhusus: "training",
})

let host: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function findButton(prefix: string) {
  const button = [...host.querySelectorAll("button")].find((candidate) =>
    candidate.getAttribute("aria-label")?.startsWith(prefix),
  )
  if (!button) throw new Error(`Button not found: ${prefix}`)
  return button
}

function clickButton(button: HTMLButtonElement | Element) {
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })))
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderPage() {
  await act(async () => {
    root.render(<BuatJadwalPage />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function clickDelete(employeeName: string) {
  clickButton(findButton(`${employeeName}, ${fixture.date}:`))
  await flush()

  const deleteButton = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "HAPUS")
  if (!deleteButton) {
    clickButton(findButton("Status / Keterangan"))
    await flush()
  }
  const visibleDeleteButton = [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === "HAPUS")
  if (!visibleDeleteButton) throw new Error("HAPUS button was not rendered")
  clickButton(visibleDeleteButton)
}

beforeEach(() => {
  fixture.state.drafts = []
  fixture.state.finals = []
  fixture.state.deleteResponse = async () => response({ success: true, deleted: 1 })
  fixture.user.getIdToken.mockClear()
  localStorage.clear()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === "POST") {
      const mode = new URL(url, window.location.origin).searchParams.get("mode") ?? ""
      return fixture.state.deleteResponse(mode)
    }
    if (url.startsWith("/api/store/schedule?")) return response({ drafts: fixture.state.drafts })
    if (url.startsWith("/api/store/activity?")) return response({ drafts: [], finals: [] })
    if (url.startsWith("/api/shift-cabang?")) return response({ success: true, stores: [] })
    throw new Error(`Unexpected fetch: ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe("Buat Jadwal HAPUS UI regression", () => {
  it("does not show a false success when no saved or local cell exists", async () => {
    await renderPage()
    await clickDelete("KARYAWAN A")

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0)
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.textContent).not.toContain("Status sel berhasil dihapus.")
  })

  it("clears a previous success as soon as a new delete starts and leaves no stale success on failure", async () => {
    fixture.state.drafts = [statusCell("EMP-A"), statusCell("EMP-B")]
    let resolveDelete!: (value: Response) => void
    let deleteCount = 0
    fixture.state.deleteResponse = async () => {
      deleteCount += 1
      if (deleteCount === 1) return response({ success: true, deleted: 1 })
      return new Promise((resolve) => { resolveDelete = resolve })
    }
    await renderPage()

    await clickDelete("KARYAWAN A")
    await flush()
    expect(host.textContent).toContain("Draft sel berhasil dihapus.")

    await clickDelete("KARYAWAN B")
    await flush()
    expect(host.textContent).not.toContain("Draft sel berhasil dihapus.")
    resolveDelete(response({ success: false, message: "Delete ditolak." }, 500))
    await flush()

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Delete ditolak.")
    expect(host.textContent).not.toContain("Draft sel berhasil dihapus.")
  })

  it("keeps the saved draft visible and reports an error when final deletion succeeds but draft deletion fails", async () => {
    fixture.state.finals = [statusCell("EMP-A")]
    fixture.state.drafts = [statusCell("EMP-A")]
    fixture.state.deleteResponse = async (mode) => mode === "final-delete"
      ? response({ success: true, deleted: 1 })
      : response({ success: false, message: "Draft gagal dihapus." }, 500)
    await renderPage()

    await clickDelete("KARYAWAN A")
    await flush()

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url]) => String(url))).toEqual([
      "/api/store/schedule?mode=final-delete",
      "/api/store/schedule?mode=draft-delete",
    ])
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Draft gagal dihapus.")
    expect(host.textContent).not.toContain("Jadwal final dan draft sel berhasil dihapus.")
    const employeeRow = [...host.querySelectorAll("tr")].find((row) => row.textContent?.includes("KARYAWAN A"))
    expect(employeeRow?.textContent).toContain("LEARNING")
  })

  it("deletes a draft-only cell and updates the rendered cell", async () => {
    fixture.state.drafts = [statusCell("EMP-A")]
    await renderPage()

    await clickDelete("KARYAWAN A")
    await flush()

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("mode=draft-delete"))).toBe(true)
    expect(host.textContent).toContain("Draft sel berhasil dihapus.")
    expect(findButton(`KARYAWAN A, ${fixture.date}:`).textContent).toBe("-")
  })

  it("deletes a final-only cell and updates the rendered cell", async () => {
    fixture.state.finals = [statusCell("EMP-A")]
    await renderPage()

    await clickDelete("KARYAWAN A")
    await flush()

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("mode=final-delete"))).toBe(true)
    expect(host.textContent).toContain("Jadwal final sel berhasil dihapus.")
    expect(host.querySelector(`button[aria-label^="KARYAWAN A, ${fixture.date}:"]`)).toBeNull()
    const employeeRow = [...host.querySelectorAll("tr")].find((row) => row.textContent?.includes("KARYAWAN A"))
    expect(employeeRow?.textContent).toContain("KARYAWAN A")
  })
})
