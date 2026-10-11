// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const fixture = vi.hoisted(() => {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const stores = [
    { id: "STORE-1", nama: "Toko Satu", kode: "S1", cabangId: "BRANCH-1", aktif: true },
    { id: "STORE-2", nama: "Toko Dua Tujuan", kode: "S2", cabangId: "BRANCH-1", aktif: true },
  ]
  const employees = [
    { id: "EMP-TRAINING", name: "KARYAWAN TRAINING", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
    { id: "EMP-EVENT", name: "KARYAWAN EVENT", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
    { id: "EMP-BACKUP", name: "KARYAWAN BACKUP", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
    { id: "EMP-OTHER", name: "KARYAWAN LAINNYA", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
    { id: "EMP-EMPTY", name: "KARYAWAN CATATAN KOSONG", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
    { id: "EMP-REGULAR", name: "KARYAWAN REGULER", storeId: "STORE-1", cabangId: "BRANCH-1", posisi: "Crew", aktif: true },
  ]
  const schedules = [
    { id: "S-1", storeId: "STORE-1", cabangId: "BRANCH-1", employeeId: "EMP-TRAINING", tanggal: date, status: "status_khusus", statusKhusus: "training" },
    { id: "S-2", storeId: "STORE-1", cabangId: "BRANCH-1", employeeId: "EMP-EVENT", tanggal: date, status: "status_khusus", statusKhusus: "event_kegiatan_perusahaan" },
    { id: "S-3", storeId: "STORE-1", cabangId: "BRANCH-1", employeeId: "EMP-BACKUP", tanggal: date, status: "status_khusus", statusKhusus: "backup_toko_lain", tokoTujuan: "STORE-2" },
    { id: "S-4", storeId: "STORE-1", cabangId: "BRANCH-1", employeeId: "EMP-OTHER", tanggal: date, status: "status_khusus", statusKhusus: "lainnya", keterangan: "Perlu pendampingan" },
    { id: "S-5", storeId: "STORE-1", cabangId: "BRANCH-1", employeeId: "EMP-EMPTY", tanggal: date, status: "status_khusus", statusKhusus: "lainnya", keterangan: "   " },
    { id: "S-6", storeId: "STORE-1", cabangId: "BRANCH-1", employeeId: "EMP-REGULAR", tanggal: date, status: "shift_pagi" },
  ]
  const user = { getIdToken: vi.fn(async () => "read-only-test-token") }
  const state: { profile: { role: string; storeId?: string; cabangId?: string } } = {
    profile: { role: "store", storeId: "STORE-1", cabangId: "BRANCH-1" },
  }
  return { date, stores, employees, schedules, user, state }
})

vi.mock("@/components/auth-context", () => ({
  useAuth: () => ({ profile: fixture.state.profile, user: fixture.user }),
}))

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock("@/components/pages/dashboard-jadwal-libur", () => ({
  DashboardJadwalLibur: () => null,
}))

vi.mock("@/lib/firestore-data", () => ({
  getFirestoreStores: async (role: string, storeId?: string) =>
    role === "store"
      ? fixture.stores.filter((store) => store.id === storeId)
      : fixture.stores,
  getFirestoreEmployees: async (storeId: string) =>
    storeId === "STORE-1" ? fixture.employees : [],
  getFirestoreSchedules: async (storeId: string) =>
    storeId === "STORE-1" ? fixture.schedules : [],
}))

import { DashboardPage } from "./dashboard"
import { ShiftCabangPage } from "./shift"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderPage(Component: React.ComponentType) {
  await act(async () => {
    root.render(<Component />)
  })
  await flush()
}

beforeEach(() => {
  fixture.state.profile = { role: "store", storeId: "STORE-1", cabangId: "BRANCH-1" }
  fixture.user.getIdToken.mockClear()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith("/api/shift-cabang?storesOnly=1&storeIds=")) {
      return response({ success: true, storeNames: [{ id: "STORE-2", nama: "Toko Dua Tujuan" }] })
    }
    if (url === "/api/shift-cabang?storesOnly=1") {
      const visibleStores = fixture.state.profile.role === "central_pusat"
        ? fixture.stores
        : fixture.stores.filter((store) => store.cabangId === fixture.state.profile.cabangId)
      return response({ success: true, stores: visibleStores })
    }
    if (url.startsWith("/api/shift-cabang?year=")) {
      return response({
        success: true,
        employeesByStoreId: { "STORE-1": fixture.employees },
        schedulesByStore: { "STORE-1": fixture.schedules },
      })
    }
    return response({ success: true, stores: [] })
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe("rendering keterangan khusus pada jadwal", () => {
  it("Dashboard Store menampilkan status khusus, keterangan LAINNYA, tujuan backup, dan status reguler", async () => {
    await renderPage(DashboardPage)

    expect(host.textContent).toContain("LEARNING")
    expect(host.textContent).toContain("EVENT")
    expect(host.textContent).toContain("Toko Dua Tujuan")
    expect(host.textContent).toContain("Perlu pendampingan")
    expect(host.textContent).toContain("LAINNYA")
    expect(host.textContent).toContain("SHIFT PAGI")
    expect(host.textContent).not.toContain("HAPUS")
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/shift-cabang?storesOnly=1&storeIds="))).toBe(true)
  })

  it.each([
    ["central_cabang", "BRANCH-1"],
    ["central_pusat", undefined],
  ])("Shift Cabang %s hanya membaca data dan merender informasi khusus", async (role, cabangId) => {
    fixture.state.profile = { role, cabangId }
    await renderPage(ShiftCabangPage)

    const openButtons = [...host.querySelectorAll("button")].filter((button) =>
      button.textContent?.includes("KLIK UNTUK MELIHAT JADWAL SHIFT"),
    )
    const openButton = openButtons[1]
    expect(openButton).toBeTruthy()
    await act(async () => openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    await flush()

    expect(host.textContent).toContain("LEARNING")
    expect(host.textContent).toContain("EVENT")
    expect(host.textContent).toContain("Toko Dua Tujuan")
    expect(host.textContent).toContain("Perlu pendampingan")
    expect(host.textContent).toContain("SHIFT PAGI")
    expect(host.textContent).not.toContain("HAPUS")
    expect(fetchMock.mock.calls.every(([, init]) => !init || init.method === undefined || init.method === "GET")).toBe(true)
  })
})
