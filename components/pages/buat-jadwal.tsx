"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, FileDown, LockKeyhole } from "lucide-react"

import { useAuth } from "@/components/auth-context"
import { EmptyState, LoadingState } from "@/components/controls"
import { Button } from "@/components/ui/button"
import {
  getFirestoreEmployees,
  getFirestoreMonthlySchedules,
  getFirestoreStores,
  type FirestoreEmployee,
  type FirestoreSchedule,
  type FirestoreStore,
} from "@/lib/firestore-data"
import { cn } from "@/lib/utils"
import {
  SHIFT_STATUS_ITEMS as SHIFT_OPTIONS,
  type ShiftStatusItem,
} from "@/lib/shift-status"
import type { UserOptions as AutoTableUserOptions } from "jspdf-autotable"
import { computeRekapRows, type RekapRow } from "@/lib/rekap-jumlah-masuk"
import { RekapJumlahMasukTable } from "@/components/rekap-jumlah-masuk"

type ScheduleStatus = (typeof SHIFT_OPTIONS)[number]["status"]
type SchedulePhase = "Belum dibuat" | "Draft" | "Selesai"

type CellValue = {
  status: ScheduleStatus
  cutiJenis?: string
}

const CUTI_TYPES = [
  "Cuti Tahunan",
  "Cuti Menikah",
  "Cuti Melahirkan",
  "Cuti Haid",
  "Cuti Kematian",
  "Cuti Haji / Umrah",
]

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
})

const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short" })

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getCellKey(employeeId: string, tanggal: string) {
  return `${employeeId}:${tanggal}`
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)
}

function getShiftOption(status?: string | null): ShiftStatusItem | undefined {
  return SHIFT_OPTIONS.find((option) => option.status === status)
}

// ============================================================
// PENYIMPANAN DRAFT LOKAL (localStorage)
//
// Perubahan status hanya disimpan di browser. Tidak ada write
// ke Firebase saat pengguna sekadar memilih/mengubah sel.
// ============================================================

function cellDraftKey(storeId: string, year: number, month: number) {
  return `buat-jadwal-draft:${storeId}:${year}-${String(month + 1).padStart(2, "0")}`
}

function loadLocalCells(key: string): Record<string, CellValue> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Record<string, CellValue>) : {}
  } catch {
    return {}
  }
}

function persistLocalCells(key: string, cells: Record<string, CellValue>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(cells))
  } catch {
    // simpanan lokal gagal — abaikan, tidak menghalangi editing.
  }
}

function clearLocalCells(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // abaikan
  }
}

// ============================================================
// POPOVER PILIH STATUS (compact)
// ============================================================

function ShiftPopover(props: {
  x: number
  y: number
  currentStatus?: string
  onSelect: (status: ScheduleStatus) => void
  onClose: () => void
}) {
  const { x, y, currentStatus, onSelect, onClose } = props
  const ref = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState({ top: y, left: x })

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const margin = 8
    const rect = node.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - margin
    const maxTop = window.innerHeight - rect.height - margin
    setPos({
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop)),
    })
  }, [x, y])

  React.useEffect(() => {
    function handlePointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("pointerdown", handlePointer)
    return () => document.removeEventListener("pointerdown", handlePointer)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Pilih status shift"
      className="fixed z-50 rounded-lg border border-border bg-card p-1.5 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex gap-1">
        {SHIFT_OPTIONS.map((option) => (
          <button
            key={option.status}
            type="button"
            title={option.label}
            aria-label={option.label}
            onClick={() => onSelect(option.status)}
            className={cn(
              "flex size-9 items-center justify-center rounded-md text-xs font-bold ring-1 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              option.className,
              currentStatus === option.status && "ring-2 ring-ring",
            )}
          >
            {option.code}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// POPOVER PILIH JENIS CUTI (kecil, dekat sel)
// ============================================================

function CutiPopover(props: {
  x: number
  y: number
  onSelect: (cutiJenis: string) => void
  onClose: () => void
}) {
  const { x, y, onSelect, onClose } = props
  const ref = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState({ top: y, left: x })

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const margin = 8
    const rect = node.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - margin
    const maxTop = window.innerHeight - rect.height - margin
    setPos({
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop)),
    })
  }, [x, y])

  React.useEffect(() => {
    function handlePointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("pointerdown", handlePointer)
    return () => document.removeEventListener("pointerdown", handlePointer)
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Pilih jenis cuti"
      className="fixed z-50 rounded-lg border border-border bg-card p-1.5 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Jenis Cuti
      </p>
      <div className="space-y-1">
        {CUTI_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="flex w-44 items-center justify-center rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white ring-1 ring-emerald-600/30 transition-colors hover:brightness-95 focus-visible:outline-none"
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// HALAMAN BUAT JADWAL SHIFT
// ============================================================

export function BuatJadwalPage() {
  const { profile, user } = useAuth()
  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [store, setStore] = React.useState<FirestoreStore | null>(null)
  const [employees, setEmployees] = React.useState<FirestoreEmployee[]>([])
  const [schedules, setSchedules] = React.useState<FirestoreSchedule[]>([])
  const [savedDrafts, setSavedDrafts] = React.useState<FirestoreSchedule[]>([])
  const [draftChanges, setDraftChanges] = React.useState<Record<string, CellValue>>({})
  const [activeCell, setActiveCell] = React.useState<{ employeeId: string; tanggal: string; x: number; y: number } | null>(null)
  const [cutiTarget, setCutiTarget] = React.useState<{ employeeId: string; tanggal: string; x: number; y: number } | null>(null)
  const [phase, setPhase] = React.useState<SchedulePhase>("Belum dibuat")
  const [editing, setEditing] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [actionError, setActionError] = React.useState("")
  const [error, setError] = React.useState("")

  const isStore = profile?.role?.trim().toLowerCase() === "store"
  const storeId = profile?.storeId
  const cabangId = profile?.cabangId
  const days = React.useMemo(() => getDaysInMonth(period.year, period.month), [period])

  React.useEffect(() => {
    if (!isStore || !storeId || !user) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")
    setMessage("")
    setEditing(false)

    const authedUser = user

    async function loadDrafts() {
      const idToken = await authedUser.getIdToken()
      const response = await fetch(
        `/api/store/schedule?year=${period.year}&month=${period.month}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        },
      )
      if (!response.ok) throw new Error("Draft tidak dapat dimuat.")
      const data = await response.json()
      return Array.isArray(data.drafts) ? data.drafts : []
    }

    Promise.all([
      getFirestoreStores("store", storeId, cabangId),
      getFirestoreEmployees(storeId),
      getFirestoreMonthlySchedules(storeId, period.year, period.month),
      loadDrafts(),
    ])
      .then(([stores, storeEmployees, monthlySchedules, drafts]) => {
        if (cancelled) return
        setStore(stores[0] ?? null)
        setEmployees(storeEmployees.filter((employee) => employee.aktif !== false))
        setSchedules(monthlySchedules)
        setSavedDrafts(drafts)
        setActiveCell(null)
        setCutiTarget(null)

        // Pulihkan draft lokal dari browser untuk bulan ini.
        const localCells = loadLocalCells(cellDraftKey(storeId, period.year, period.month))
        setDraftChanges(localCells)

        const hasLocalDraft = Object.keys(localCells).length > 0
        const hasDraft = drafts.length > 0 || hasLocalDraft
        const hasFinal = monthlySchedules.length > 0
        setPhase(hasFinal ? "Selesai" : hasDraft ? "Draft" : "Belum dibuat")
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("Failed to load shift schedule data:", loadError)
        setError("Data jadwal belum dapat dimuat. Silakan coba lagi.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cabangId, isStore, period.month, period.year, storeId, user])

  const savedScheduleByCell = React.useMemo(() => {
    return new Map(
      schedules.map((schedule) => [
        getCellKey(schedule.employeeId, schedule.tanggal),
        { status: schedule.status, cutiJenis: schedule.cutiJenis },
      ]),
    )
  }, [schedules])

  const savedDraftByCell = React.useMemo(() => {
    return new Map(
      savedDrafts.map((draft) => [
        getCellKey(draft.employeeId, draft.tanggal),
        { status: draft.status as ScheduleStatus, cutiJenis: draft.cutiJenis },
      ]),
    )
  }, [savedDrafts])

  const getCellValue = React.useCallback(
    (employeeId: string, tanggal: string): CellValue | undefined => {
      const key = getCellKey(employeeId, tanggal)
      return draftChanges[key] ?? savedDraftByCell.get(key) ?? savedScheduleByCell.get(key)
    },
    [draftChanges, savedDraftByCell, savedScheduleByCell],
  )

  // REKAP JUMLAH MASUK BULANAN — dihitung lokal dari data draft/editor.
  const rekapRows = React.useMemo<RekapRow[]>(() => {
    return computeRekapRows(
      employees,
      period.year,
      period.month,
      (employeeId, tanggal) => getCellValue(employeeId, tanggal)?.status,
      getDateKey,
    )
  }, [employees, getCellValue, period.month, period.year])

  const rekapTitle = `JUMLAH MASUK BULAN ${monthFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()}`

  // Jadwal yang sudah SELESAI terkunci sampai tombol Edit ditekan.
  const isLocked = phase === "Selesai" && !editing
  const canEditCells = !isLocked

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const date = new Date(current.year, current.month + offset, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  function applyCell(key: string, value: CellValue) {
    setDraftChanges((current) => {
      const next = { ...current, [key]: value }
      if (storeId) persistLocalCells(cellDraftKey(storeId, period.year, period.month), next)
      return next
    })
  }

  function startEditing() {
    setEditing(true)
    setMessage("Mode edit aktif. Klik sel untuk mengubah jadwal.")
  }

  function cancelEdit() {
    // Buang semua perubahan sel yang dibuat selama mode edit
    // dan bersihkan draft lokal sementara. Jadwal final (dari
    // Firestore) tidak ikut diubah.
    setDraftChanges({})
    if (storeId) clearLocalCells(cellDraftKey(storeId, period.year, period.month))
    setActiveCell(null)
    setCutiTarget(null)
    setEditing(false)
    setMessage("Perubahan edit dibatalkan. Jadwal final tidak berubah dan tetap terkunci.")
  }

  function chooseShift(status: ScheduleStatus) {
    if (!activeCell || !canEditCells) return
    const key = getCellKey(activeCell.employeeId, activeCell.tanggal)

    if (status === "cuti") {
      setCutiTarget({
        employeeId: activeCell.employeeId,
        tanggal: activeCell.tanggal,
        x: activeCell.x,
        y: activeCell.y,
      })
      setActiveCell(null)
      return
    }

    applyCell(key, { status })
    setPhase((p) => (p === "Selesai" ? p : "Draft"))
    setMessage("Perubahan jadwal disimpan sebagai draft pada browser ini.")
    setActiveCell(null)
  }

  function chooseCuti(cutiJenis: string) {
    if (!cutiTarget || !canEditCells) return
    const key = getCellKey(cutiTarget.employeeId, cutiTarget.tanggal)
    applyCell(key, { status: "cuti", cutiJenis })
    setPhase((p) => (p === "Selesai" ? p : "Draft"))
    setMessage(`Cuti disimpan dengan jenis: ${cutiJenis}.`)
    setCutiTarget(null)
  }

  function buildVisibleCells() {
    const cells: { employeeId: string; tanggal: string; status: ScheduleStatus; cutiJenis?: string }[] = []
    for (const employee of employees) {
      for (const day of days) {
        const value = getCellValue(employee.id, getDateKey(period.year, period.month, day))
        if (!value) continue
        cells.push({
          employeeId: employee.id,
          tanggal: getDateKey(period.year, period.month, day),
          status: value.status,
          cutiJenis: value.cutiJenis,
        })
      }
    }
    return cells
  }

  async function saveDraft() {
    if (!user) return
    setSaving(true)
    setMessage("")
    setActionError("")
    try {
      const idToken = await user.getIdToken()
      const visibleCells = buildVisibleCells()
      const daysPayload: Record<string, unknown>[] = []
      const byTanggal = new Map<string, Record<string, unknown>>()
      for (const cell of visibleCells) {
        if (!byTanggal.has(cell.tanggal)) {
          byTanggal.set(cell.tanggal, { tanggal: cell.tanggal })
        }
        const payload: Record<string, unknown> = { status: cell.status }
        if (cell.status === "cuti" && cell.cutiJenis) payload.cutiJenis = cell.cutiJenis
        byTanggal.get(cell.tanggal)![cell.employeeId] = payload
      }
      byTanggal.forEach((entry) => daysPayload.push(entry))

      const response = await fetch(
        "/api/store/schedule?mode=draft",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ days: daysPayload }),
        },
      )
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.message ?? "Draft gagal disimpan.")
      }
      setSavedDrafts(visibleCells.map((cell) => ({ ...cell } as FirestoreSchedule)))
      setDraftChanges({})
      if (storeId) clearLocalCells(cellDraftKey(storeId, period.year, period.month))
      setPhase("Draft")
      setMessage("Draft berhasil disimpan dan dapat dilanjutkan.")
    } catch (saveError) {
      console.error("Failed to save draft:", saveError)
      setActionError(saveError instanceof Error ? saveError.message : "Draft gagal disimpan.")
      setMessage("")
    } finally {
      setSaving(false)
    }
  }

  async function finishSchedule() {
    if (!user) return
    const hasEmptyCell = employees.some((employee) =>
      days.some((day) => !getCellValue(employee.id, getDateKey(period.year, period.month, day))),
    )
    if (hasEmptyCell) {
      setActionError("")
      setMessage("Jadwal belum lengkap.")
      return
    }

    setSaving(true)
    setMessage("")
    setActionError("")
    try {
      const idToken = await user.getIdToken()
      const cells = buildVisibleCells()
      const response = await fetch(
        "/api/store/schedule?mode=final",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ year: period.year, month: period.month, cells }),
        },
      )
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.message ?? "Jadwal gagal difinalkan.")
      }
      setSchedules(cells.map((cell) => ({ ...cell } as FirestoreSchedule)))
      setSavedDrafts([])
      setDraftChanges({})
      if (storeId) clearLocalCells(cellDraftKey(storeId, period.year, period.month))
      setPhase("Selesai")
      setEditing(false)
      setMessage("Jadwal berhasil disimpan sebagai jadwal final dan terkunci.")
    } catch (finalizeError) {
      console.error("Failed to finalize schedule:", finalizeError)
      setActionError(finalizeError instanceof Error ? finalizeError.message : "Jadwal gagal difinalkan.")
      setMessage("")
    } finally {
      setSaving(false)
    }
  }

  function slugifyStoreName(name: string) {
    const normalized = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
    return normalized || "toko"
  }

  function hexToRgb(hex: string): [number, number, number] {
    const value = hex.replace("#", "")
    const int = parseInt(value, 16)
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
  }

  async function handleDownloadPdf() {
    if (!store) return
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])

    const filename = `JADWAL_SHIFT_${slugifyStoreName(store.nama ?? "toko")}_${monthFormatter
      .format(new Date(period.year, period.month, 1))
      .toUpperCase()}.pdf`

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    })

    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("JADWAL SHIFT", 8, 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(`Toko: ${store.nama ?? "-"}`, 8, 21)
    doc.text(`Periode: ${monthLabel}`, 8, 26)
    doc.text(`Jumlah Karyawan: ${employees.length}`, 8, 31)

    const DAY_ABBR = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"]
    const dayAbbr = (day: number) => DAY_ABBR[new Date(period.year, period.month, day).getDay()] ?? ""

    function drawShiftBlock(startY: number, blockDays: number[]): number {
      const head = [
        ["Karyawan", ...blockDays.map(String)],
        ["", ...blockDays.map(dayAbbr)],
      ]
      const body: string[][] = employees.map((employee) => {
        const row: string[] = [employee.name]
        blockDays.forEach((day) => {
          const tanggal = getDateKey(period.year, period.month, day)
          const value = getCellValue(employee.id, tanggal)
          const option = getShiftOption(value?.status)
          row.push(option?.label ?? "-")
        })
        return row
      })
      const statusesByCell: (string | undefined)[][] = employees.map((employee) => {
        const cells: (string | undefined)[] = [undefined]
        blockDays.forEach((day) => {
          const tanggal = getDateKey(period.year, period.month, day)
          const value = getCellValue(employee.id, tanggal)
          cells.push(value?.status)
        })
        return cells
      })

      autoTable(doc, {
        startY,
        head,
        body,
        theme: "grid",
        margin: { left: 6, right: 6, top: 30, bottom: 6 },
        styles: {
          fontSize: 7,
          cellPadding: { left: 1.4, right: 1.4, top: 1.1, bottom: 1.1 },
          valign: "middle",
          lineColor: [150, 150, 150],
          lineWidth: 0.25,
        },
        tableLineColor: [110, 110, 110],
        tableLineWidth: 0.5,
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
          valign: "middle",
          lineColor: [37, 99, 235],
          lineWidth: 0.3,
        },
        bodyStyles: { textColor: [30, 30, 30], halign: "center", valign: "middle" },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: "bold", halign: "left" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index >= 1) {
            const shiftStatus = statusesByCell[data.row.index]?.[data.column.index]
            const item = shiftStatus ? getShiftOption(shiftStatus) : undefined
            if (item) {
              data.cell.styles.fillColor = hexToRgb(item.hex)
              data.cell.styles.textColor = 255
              data.cell.styles.halign = "center"
              data.cell.styles.lineColor = [255, 255, 255]
              data.cell.styles.lineWidth = 0.4
            } else {
              data.cell.styles.fillColor = [245, 247, 250]
              data.cell.styles.textColor = [30, 30, 30]
              data.cell.styles.halign = "center"
              data.cell.styles.lineColor = [150, 150, 150]
              data.cell.styles.lineWidth = 0.25
            }
          } else if (data.section === "body" && data.column.index === 0) {
            data.cell.styles.fillColor = [245, 247, 250]
            data.cell.styles.lineWidth = 0.25
          }
        },
      } as AutoTableUserOptions)
      return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    }

    const block1EndY = drawShiftBlock(34, days.slice(0, 15))
    const block2EndY = drawShiftBlock(block1EndY + 8, days.slice(15))

    // BAGIAN BAWAH PDF — REKAP JUMLAH MASUK BULANAN
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text(rekapTitle, 8, block2EndY + 13)

    const heads = ["NAMA", "PAGI", "SIANG", "LIBUR", "CUTI", "SAKIT / IZIN", "TOTAL"]
    const body = rekapRows.map((row) => [
      row.name,
      String(row.pagi),
      String(row.siang),
      String(row.libur),
      String(row.cuti),
      String(row.sakitIzin),
      String(row.total),
    ])

    autoTable(doc, {
      startY: block2EndY + 16,
      head: [heads],
      body,
      theme: "grid",
      margin: { left: 6, right: 6, top: 30, bottom: 6 },
      styles: {
        fontSize: 8,
        cellPadding: { left: 1.6, right: 1.6, top: 1.4, bottom: 1.4 },
        valign: "middle",
        lineColor: [150, 150, 150],
        lineWidth: 0.25,
      },
      tableLineColor: [110, 110, 110],
      tableLineWidth: 0.4,
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        valign: "middle",
        lineColor: [37, 99, 235],
        lineWidth: 0.3,
      },
      bodyStyles: { textColor: [30, 30, 30], halign: "center", valign: "middle" },
      columnStyles: {
        0: { cellWidth: 50, fontStyle: "bold", halign: "left" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index >= 1) {
          data.cell.styles.fillColor = [247, 248, 250]
        } else if (data.section === "body" && data.column.index === 0) {
          data.cell.styles.fillColor = [245, 247, 250]
        }
      },
    } as AutoTableUserOptions)

    doc.save(filename)
  }

  if (!isStore) {
    return <EmptyState title="Halaman khusus Store" description="Buat Jadwal Shift pada tahap ini hanya tersedia untuk akun Store." />
  }

  if (loading) {
    return <LoadingState label="Memuat jadwal shift..." />
  }

  if (error) {
    return <EmptyState title="Jadwal belum dapat dimuat" description={error} />
  }

  const monthLabel = monthFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">BUAT JADWAL SHIFT</h1>
            <div className="mt-1.5 space-y-0.5 text-sm text-muted-foreground">
              <p>
                Toko: <span className="font-medium text-foreground">{store?.nama ?? "Toko tidak ditemukan"}</span>
              </p>
              <p>
                Periode: <span className="font-medium text-foreground">{monthLabel}</span>
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-muted px-3 py-1.5 text-sm">
            Status: <span className="font-semibold text-foreground">{phase}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-1 sm:w-fit">
            <Button variant="ghost" size="icon" aria-label="Bulan sebelumnya" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <p className="min-w-44 text-center text-sm font-semibold">{monthLabel}</p>
            <Button variant="ghost" size="icon" aria-label="Bulan berikutnya" onClick={() => changeMonth(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLocked ? (
              <Button onClick={startEditing}>
                Edit
              </Button>
            ) : (
              <>
                {editing && (
                  <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                    Batal
                  </Button>
                )}
                <Button variant="outline" onClick={saveDraft} disabled={saving}>
                  {saving ? "Menyimpan..." : "Simpan Draft"}
                </Button>
                <Button onClick={finishSchedule} disabled={saving}>
                  {saving ? "Memproses..." : "Selesai"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={handleDownloadPdf} disabled={!store}>
              <FileDown className="mr-2 size-4" />
              Simpan sebagai PDF
            </Button>
          </div>
        </div>

        {isLocked && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground">
            <LockKeyhole className="size-4" />
            Jadwal telah selesai dan terkunci. Klik <span className="font-semibold text-foreground">Edit</span> untuk mengubahnya.
          </p>
        )}

        {editing && (
          <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-300">
            Mode edit aktif — status jadwal yang selesai sedang dapat diubah. Simpan Draft, Selesai, atau Batal.
          </p>
        )}

        {actionError && (
          <p className="mt-3 rounded-lg border border-status-sakit/30 bg-status-sakit-bg px-3 py-1.5 text-sm text-status-sakit" role="alert">
            {actionError}
          </p>
        )}

        {message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}

        <div className="mt-5 rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 min-w-[9rem] border-b border-r border-border bg-muted/60 px-1.5 py-2 text-left align-middle font-semibold sm:px-2 md:min-w-[12rem] md:py-2.5">Karyawan</th>
                {days.map((day) => {
                  const date = new Date(period.year, period.month, day)
                  return (
                    <th key={day} className="min-w-9 overflow-hidden border-b border-r border-border px-0.5 py-1 text-center align-middle font-semibold last:border-r-0 md:min-w-12">
                      <span className="block truncate text-[0.7rem] leading-tight text-foreground md:text-sm">{day}</span>
                      <span className="block truncate text-[0.5rem] uppercase leading-tight md:text-[0.65rem]">{weekdayFormatter.format(date)}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="bg-card">
                  <td className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-border bg-card px-1.5 py-1.5 align-middle sm:px-2 md:min-w-[12rem]">
                    <p className="truncate text-[0.7rem] font-semibold text-foreground md:text-xs md:font-semibold">{employee.name}</p>
                  </td>
                  {days.map((day) => {
                    const tanggal = getDateKey(period.year, period.month, day)
                    const value = getCellValue(employee.id, tanggal)
                    const status = value?.status
                    const option = getShiftOption(status)
                    const isActive = activeCell?.employeeId === employee.id && activeCell.tanggal === tanggal
                    const title = option
                      ? option.status === "cuti" && value?.cutiJenis
                        ? `${option.title} — ${value.cutiJenis}`
                        : option.title
                      : "Belum dijadwalkan"

                    if (isLocked) {
                      return (
                        <td key={tanggal} className="border-b border-r border-border p-0.5 text-center last:border-r-0">
                          <span
                            title={title}
                            className={cn(
                              "flex h-6 items-center justify-center truncate rounded px-1 text-[0.6rem] font-bold ring-1 md:mx-auto md:h-7 md:min-w-12 md:px-1.5 md:text-[0.68rem] md:whitespace-nowrap",
                              option ? option.className : "bg-background text-muted-foreground ring-border",
                            )}
                          >
                            {option?.label ?? "-"}
                          </span>
                        </td>
                      )
                    }

                    return (
                      <td key={tanggal} className="border-b border-r border-border p-0.5 text-center last:border-r-0">
                        <button
                          type="button"
                          title={title}
                          aria-label={`${employee.name}, ${tanggal}: ${title}`}
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect()
                            setActiveCell({ employeeId: employee.id, tanggal, x: rect.left, y: rect.bottom })
                          }}
                          className={cn(
                            "flex h-6 items-center justify-center truncate rounded px-1 text-[0.6rem] font-bold ring-1 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:mx-auto md:h-7 md:min-w-12 md:px-1.5 md:text-[0.68rem] md:whitespace-nowrap",
                            option ? option.className : "bg-background text-muted-foreground ring-border",
                            isActive && "ring-2 ring-ring",
                          )}
                        >
                          {option?.label ?? "-"}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {employees.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
        )}

        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            KETERANGAN STATUS
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {SHIFT_OPTIONS.map((option) => (
              <span key={option.status} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex h-7 min-w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-1.5 text-[0.68rem] font-bold ring-1",
                    option.className,
                  )}
                >
                  {option.label}
                </span>
                <span className="text-muted-foreground">{option.title}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <RekapJumlahMasukTable title={rekapTitle} rows={rekapRows} />

      {activeCell && canEditCells && (
        <ShiftPopover
          x={activeCell.x}
          y={activeCell.y}
          currentStatus={getCellValue(activeCell.employeeId, activeCell.tanggal)?.status}
          onSelect={chooseShift}
          onClose={() => setActiveCell(null)}
        />
      )}

      {cutiTarget && canEditCells && (
        <CutiPopover
          x={cutiTarget.x}
          y={cutiTarget.y}
          onSelect={chooseCuti}
          onClose={() => setCutiTarget(null)}
        />
      )}
    </div>
  )
}
