// ============================================================
// SHIFT MANAGEMENT HUB — Mock data layer (CENTRAL prototype)
// Frontend-only. No backend / database.
// ============================================================

export type ShiftStatus =
  | "shift_pagi"
  | "shift_siang"
  | "libur"
  | "cuti"
  | "izin"
  | "sakit"

export const STATUS_LABEL: Record<ShiftStatus, string> = {
  shift_pagi: "Shift Pagi",
  shift_siang: "Shift Siang",
  libur: "Libur",
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
}

// Order used across summaries / legends
export const STATUS_ORDER: ShiftStatus[] = [
  "shift_pagi",
  "shift_siang",
  "libur",
  "sakit",
  "izin",
  "cuti",
]

export type Employee = {
  id: string
  name: string
  storeId: string
  posisi: string
  aktif: boolean
}

export type Store = {
  id: string
  name: string
  kode: string
  akunStore: string
  aktif: boolean
}

export const stores: Store[] = [
  { id: "A", name: "Toko A", kode: "TKA", akunStore: "Store A", aktif: true },
  { id: "B", name: "Toko B", kode: "TKB", akunStore: "Store B", aktif: true },
  { id: "C", name: "Toko C", kode: "TKC", akunStore: "Store C", aktif: true },
  { id: "D", name: "Toko D", kode: "TKD", akunStore: "Store D", aktif: true },
]

const POSISI = ["Kepala Toko", "Kasir", "Pramuniaga", "Gudang", "Supervisor"]

// --- Employees per store -----------------------------------
const rawEmployees: Record<string, string[]> = {
  A: ["Anwar", "Saepul", "Edi", "Gunda", "Rudi", "Andi", "Budi", "Citra"],
  B: ["Fajar", "Rizal", "Doni", "Hendra", "Wawan", "Sari", "Lukman"],
  C: [
    "Bagas",
    "Yoga",
    "Tomi",
    "Nanda",
    "Reza",
    "Iwan",
    "Dewi",
    "Putra",
    "Galih",
    "Ade",
  ],
  D: ["Surya", "Bayu", "Eko", "Wahyu", "Dimas", "Rina", "Joko"],
}

export const employees: Employee[] = Object.entries(rawEmployees).flatMap(
  ([storeId, names]) =>
    names.map((name, i) => ({
      id: `${storeId}-${i + 1}`,
      name,
      storeId,
      posisi: POSISI[(i + storeId.charCodeAt(0)) % POSISI.length],
      aktif: !(storeId === "C" && i === 9), // one inactive example
    })),
)

export function employeesByStore(storeId: string): Employee[] {
  return employees.filter((e) => e.storeId === storeId)
}

export function getStore(storeId: string): Store | undefined {
  return stores.find((s) => s.id === storeId)
}

// --- Schedule generation -----------------------------------
// Deterministic per employee-index + day so the prototype is stable
// across renders. Specific example dates are overridden below.

function baseStatus(empIndex: number, day: number): ShiftStatus {
  const seed = (empIndex * 13 + day * 7) % 21
  if (seed === 3) return "cuti"
  if (seed === 8) return "izin"
  if (seed === 15) return "sakit"
  if (seed % 5 === 0) return "libur"
  return (empIndex + day) % 2 === 0 ? "shift_pagi" : "shift_siang"
}

// Overrides keyed as `${storeId}:${dateISO}:${empId}`
const overrides: Record<string, ShiftStatus> = {}

function setOverride(
  storeId: string,
  dateISO: string,
  map: Record<ShiftStatus, string[]>,
) {
  const emps = employeesByStore(storeId)
  ;(Object.keys(map) as ShiftStatus[]).forEach((status) => {
    map[status].forEach((name) => {
      const emp = emps.find((e) => e.name === name)
      if (emp) overrides[`${storeId}:${dateISO}:${emp.id}`] = status
    })
  })
}

// Example: Toko A on 2026-08-20 (from spec)
setOverride("A", "2026-08-20", {
  shift_pagi: ["Anwar", "Saepul"],
  shift_siang: ["Edi", "Gunda"],
  libur: ["Rudi"],
  izin: ["Andi"],
  sakit: ["Budi"],
  cuti: ["Citra"],
})

// Example: Harian view 2026-08-12 (from spec)
setOverride("A", "2026-08-12", {
  shift_pagi: ["Anwar", "Saepul"],
  shift_siang: ["Edi", "Gunda"],
  libur: ["Rudi"],
  izin: [],
  sakit: [],
  cuti: [],
})
setOverride("B", "2026-08-12", {
  shift_pagi: ["Fajar", "Rizal", "Doni"],
  shift_siang: ["Andi", "Budi"], // spec names; fall back if missing
  libur: [],
  izin: [],
  sakit: [],
  cuti: [],
})

export function getEmployeeStatus(emp: Employee, dateISO: string): ShiftStatus {
  const ov = overrides[`${emp.storeId}:${dateISO}:${emp.id}`]
  if (ov) return ov
  const empIndex = Number(emp.id.split("-")[1]) - 1
  const day = Number(dateISO.split("-")[2])
  return baseStatus(empIndex, day)
}

export type GroupedDay = Record<ShiftStatus, Employee[]>

export function getStoreDay(storeId: string, dateISO: string): GroupedDay {
  const grouped: GroupedDay = {
    shift_pagi: [],
    shift_siang: [],
    libur: [],
    cuti: [],
    izin: [],
    sakit: [],
  }
  employeesByStore(storeId).forEach((emp) => {
    grouped[getEmployeeStatus(emp, dateISO)].push(emp)
  })
  return grouped
}

export type Summary = Record<ShiftStatus, number> & { totalToko: number }

export function getSummary(dateISO: string, storeIds: string[]): Summary {
  const summary: Summary = {
    totalToko: storeIds.length,
    shift_pagi: 0,
    shift_siang: 0,
    libur: 0,
    cuti: 0,
    izin: 0,
    sakit: 0,
  }
  storeIds.forEach((storeId) => {
    const day = getStoreDay(storeId, dateISO)
    STATUS_ORDER.forEach((s) => {
      summary[s] += day[s].length
    })
  })
  return summary
}

// --- Revisi Absensi ----------------------------------------
export type RevisiStatus = "BARU" | "PROSES" | "SELESAI"

export type Revisi = {
  id: string
  storeId: string
  employeeName: string
  tanggal: string // display date of the shift being revised
  shiftSebelumnya: ShiftStatus
  statusBaru: ShiftStatus
  keterangan: string
  tanggalPengajuan: string
  status: RevisiStatus
}

let revisiSeq = 0
function mkRevisi(
  storeId: string,
  employeeName: string,
  tanggal: string,
  shiftSebelumnya: ShiftStatus,
  statusBaru: ShiftStatus,
  keterangan: string,
  tanggalPengajuan: string,
  status: RevisiStatus,
): Revisi {
  revisiSeq += 1
  return {
    id: `REV-${String(revisiSeq).padStart(4, "0")}`,
    storeId,
    employeeName,
    tanggal,
    shiftSebelumnya,
    statusBaru,
    keterangan,
    tanggalPengajuan,
    status,
  }
}

export const initialRevisi: Revisi[] = [
  // Toko A — 10 pengajuan
  mkRevisi("A", "Anwar", "10 Agustus 2026", "shift_pagi", "sakit", "Demam", "11 Agustus 2026", "BARU"),
  mkRevisi("A", "Saepul", "9 Agustus 2026", "shift_siang", "izin", "Keperluan keluarga", "10 Agustus 2026", "BARU"),
  mkRevisi("A", "Edi", "8 Agustus 2026", "shift_pagi", "cuti", "Cuti tahunan", "9 Agustus 2026", "PROSES"),
  mkRevisi("A", "Gunda", "12 Agustus 2026", "libur", "shift_pagi", "Menggantikan rekan", "12 Agustus 2026", "BARU"),
  mkRevisi("A", "Rudi", "13 Agustus 2026", "shift_siang", "sakit", "Sakit maag", "13 Agustus 2026", "BARU"),
  mkRevisi("A", "Andi", "14 Agustus 2026", "shift_pagi", "izin", "Urusan pribadi", "14 Agustus 2026", "PROSES"),
  mkRevisi("A", "Budi", "15 Agustus 2026", "shift_siang", "libur", "Tukar jadwal", "15 Agustus 2026", "BARU"),
  mkRevisi("A", "Citra", "16 Agustus 2026", "libur", "shift_siang", "Menggantikan rekan", "16 Agustus 2026", "BARU"),
  mkRevisi("A", "Anwar", "17 Agustus 2026", "shift_pagi", "izin", "Acara keluarga", "17 Agustus 2026", "BARU"),
  mkRevisi("A", "Edi", "18 Agustus 2026", "shift_siang", "sakit", "Flu", "18 Agustus 2026", "BARU"),
  // Toko B — 3 pengajuan
  mkRevisi("B", "Fajar", "10 Agustus 2026", "shift_pagi", "izin", "Keperluan keluarga", "10 Agustus 2026", "BARU"),
  mkRevisi("B", "Rizal", "11 Agustus 2026", "shift_siang", "sakit", "Demam tinggi", "11 Agustus 2026", "PROSES"),
  mkRevisi("B", "Doni", "12 Agustus 2026", "libur", "shift_pagi", "Tukar jadwal", "12 Agustus 2026", "BARU"),
  // Toko C — 0 pengajuan (none)
  // Toko D — 7 pengajuan
  mkRevisi("D", "Surya", "9 Agustus 2026", "shift_pagi", "cuti", "Cuti tahunan", "9 Agustus 2026", "BARU"),
  mkRevisi("D", "Bayu", "10 Agustus 2026", "shift_siang", "sakit", "Sakit gigi", "10 Agustus 2026", "BARU"),
  mkRevisi("D", "Eko", "11 Agustus 2026", "shift_pagi", "izin", "Urusan bank", "11 Agustus 2026", "PROSES"),
  mkRevisi("D", "Wahyu", "12 Agustus 2026", "libur", "shift_siang", "Menggantikan rekan", "12 Agustus 2026", "BARU"),
  mkRevisi("D", "Dimas", "13 Agustus 2026", "shift_siang", "izin", "Keperluan keluarga", "13 Agustus 2026", "BARU"),
  mkRevisi("D", "Rina", "14 Agustus 2026", "shift_pagi", "sakit", "Demam", "14 Agustus 2026", "BARU"),
  mkRevisi("D", "Joko", "15 Agustus 2026", "shift_pagi", "libur", "Tukar jadwal", "15 Agustus 2026", "BARU"),
]

// --- History (Cuti / Sakit / Izin) -------------------------
export type HistoryJenis = "Cuti" | "Sakit" | "Izin"

export type HistoryEntry = {
  id: string
  tanggal: string
  tanggalISO: string
  name: string
  storeId: string
  jenis: HistoryJenis
  keterangan: string
}

let histSeq = 0
function mkHist(
  tanggal: string,
  tanggalISO: string,
  name: string,
  storeId: string,
  jenis: HistoryJenis,
  keterangan: string,
): HistoryEntry {
  histSeq += 1
  return { id: `H-${histSeq}`, tanggal, tanggalISO, name, storeId, jenis, keterangan }
}

export const history: HistoryEntry[] = [
  mkHist("10 Agustus 2026", "2026-08-10", "Anwar", "A", "Sakit", "Demam"),
  mkHist("15 Agustus 2026", "2026-08-15", "Saepul", "A", "Izin", "Keperluan keluarga"),
  mkHist("20 Agustus 2026", "2026-08-20", "Citra", "A", "Cuti", "Cuti tahunan"),
  mkHist("3 Agustus 2026", "2026-08-03", "Budi", "A", "Sakit", "Flu"),
  mkHist("8 Agustus 2026", "2026-08-08", "Andi", "A", "Izin", "Urusan pribadi"),
  mkHist("5 Agustus 2026", "2026-08-05", "Fajar", "B", "Izin", "Keperluan keluarga"),
  mkHist("12 Agustus 2026", "2026-08-12", "Rizal", "B", "Sakit", "Demam tinggi"),
  mkHist("18 Agustus 2026", "2026-08-18", "Sari", "B", "Cuti", "Cuti tahunan"),
  mkHist("6 Agustus 2026", "2026-08-06", "Yoga", "C", "Sakit", "Sakit kepala"),
  mkHist("14 Agustus 2026", "2026-08-14", "Dewi", "C", "Cuti", "Cuti melahirkan"),
  mkHist("19 Agustus 2026", "2026-08-19", "Reza", "C", "Izin", "Wisuda keluarga"),
  mkHist("7 Agustus 2026", "2026-08-07", "Surya", "D", "Cuti", "Cuti tahunan"),
  mkHist("11 Agustus 2026", "2026-08-11", "Bayu", "D", "Sakit", "Sakit gigi"),
  mkHist("16 Agustus 2026", "2026-08-16", "Rina", "D", "Izin", "Urusan bank"),
]

// --- Date helpers ------------------------------------------
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

export const DEFAULT_DATE = "2026-08-20"

export function formatTanggal(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

export function monthName(month1: number): string {
  return MONTHS[month1 - 1]
}
