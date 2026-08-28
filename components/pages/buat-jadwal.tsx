"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react"

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

const SHIFT_OPTIONS = [
  { code: "P", status: "shift_pagi", label: "Shift Pagi", className: "bg-status-pagi-bg text-status-pagi ring-status-pagi/20" },
  { code: "S", status: "shift_siang", label: "Shift Siang", className: "bg-status-siang-bg text-status-siang ring-status-siang/20" },
  { code: "L", status: "libur", label: "Libur", className: "bg-status-libur-bg text-status-libur ring-status-libur/20" },
  { code: "C", status: "cuti", label: "Cuti", className: "bg-status-cuti-bg text-status-cuti ring-status-cuti/20" },
  { code: "I", status: "izin", label: "Izin", className: "bg-status-izin-bg text-status-izin ring-status-izin/20" },
  { code: "K", status: "sakit", label: "Sakit", className: "bg-status-sakit-bg text-status-sakit ring-status-sakit/20" },
] as const

type ScheduleStatus = (typeof SHIFT_OPTIONS)[number]["status"]
type SchedulePhase = "Belum dibuat" | "Draft" | "Selesai"

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

function getShiftOption(status?: string | null) {
  return SHIFT_OPTIONS.find((option) => option.status === status)
}

export function BuatJadwalPage() {
  const { profile } = useAuth()
  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [store, setStore] = React.useState<FirestoreStore | null>(null)
  const [employees, setEmployees] = React.useState<FirestoreEmployee[]>([])
  const [schedules, setSchedules] = React.useState<FirestoreSchedule[]>([])
  const [draftChanges, setDraftChanges] = React.useState<Record<string, ScheduleStatus>>({})
  const [activeCell, setActiveCell] = React.useState<{ employeeId: string; tanggal: string } | null>(null)
  const [phase, setPhase] = React.useState<SchedulePhase>("Belum dibuat")
  const [message, setMessage] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const isStore = profile?.role?.trim().toLowerCase() === "store"
  const storeId = profile?.storeId
  const cabangId = profile?.cabangId
  const days = React.useMemo(() => getDaysInMonth(period.year, period.month), [period])

  React.useEffect(() => {
    if (!isStore || !storeId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")
    setMessage("")

    Promise.all([
      getFirestoreStores("store", storeId, cabangId),
      getFirestoreEmployees(storeId),
      getFirestoreMonthlySchedules(storeId, period.year, period.month),
    ])
      .then(([stores, storeEmployees, monthlySchedules]) => {
        if (cancelled) return
        setStore(stores[0] ?? null)
        setEmployees(storeEmployees.filter((employee) => employee.aktif !== false))
        setSchedules(monthlySchedules)
        setDraftChanges({})
        setActiveCell(null)
        setPhase(monthlySchedules.length > 0 ? "Draft" : "Belum dibuat")
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
  }, [cabangId, isStore, period.month, period.year, storeId])

  const savedScheduleByCell = React.useMemo(() => {
    return new Map(schedules.map((schedule) => [getCellKey(schedule.employeeId, schedule.tanggal), schedule.status]))
  }, [schedules])

  const getCellStatus = React.useCallback(
    (employeeId: string, tanggal: string) => {
      const key = getCellKey(employeeId, tanggal)
      return draftChanges[key] ?? savedScheduleByCell.get(key)
    },
    [draftChanges, savedScheduleByCell],
  )

  const activeEmployee = activeCell ? employees.find((employee) => employee.id === activeCell.employeeId) : null

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const date = new Date(current.year, current.month + offset, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  function chooseShift(status: ScheduleStatus) {
    if (!activeCell) return
    setDraftChanges((current) => ({ ...current, [getCellKey(activeCell.employeeId, activeCell.tanggal)]: status }))
    setPhase("Draft")
    setMessage("Perubahan jadwal disiapkan sebagai draft pada sesi ini.")
    setActiveCell(null)
  }

  function saveDraft() {
    setPhase("Draft")
    setMessage("Draft disiapkan pada sesi ini. Penyimpanan Firestore akan diaktifkan pada tahap berikutnya.")
  }

  function finishSchedule() {
    const hasEmptyCell = employees.some((employee) =>
      days.some((day) => !getCellStatus(employee.id, getDateKey(period.year, period.month, day))),
    )

    if (hasEmptyCell) {
      setMessage("Jadwal belum lengkap.")
      return
    }

    setPhase("Selesai")
    setMessage("Status selesai disiapkan pada sesi ini. Belum ada data yang ditulis ke Firestore.")
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
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">BUAT JADWAL SHIFT</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>
                Toko: <span className="font-medium text-foreground">{store?.nama ?? "Toko tidak ditemukan"}</span>
              </p>
              <p>
                Periode: <span className="font-medium text-foreground">{monthLabel}</span>
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            Status: <span className="font-semibold text-foreground">{phase}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-1 sm:w-fit">
            <Button variant="ghost" size="icon" aria-label="Bulan sebelumnya" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <p className="min-w-44 text-center text-sm font-semibold">{monthLabel}</p>
            <Button variant="ghost" size="icon" aria-label="Bulan berikutnya" onClick={() => changeMonth(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={saveDraft}>Simpan Draft</Button>
            <Button onClick={finishSchedule}>Selesai</Button>
            <Button variant="outline" disabled title="Ekspor PDF akan tersedia pada tahap berikutnya.">
              <FileDown className="mr-2 size-4" />
              Simpan sebagai PDF
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {SHIFT_OPTIONS.map((option) => (
            <span key={option.status} className={cn("rounded-md px-2 py-1 font-medium ring-1", option.className)}>
              {option.code} = {option.label}
            </span>
          ))}
        </div>

        {message && <p className="mt-4 text-sm text-muted-foreground" role="status">{message}</p>}

        {activeCell && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              Pilih shift untuk {activeEmployee?.name ?? "karyawan"} — {activeCell.tanggal}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SHIFT_OPTIONS.map((option) => (
                <button
                  key={option.status}
                  type="button"
                  onClick={() => chooseShift(option.status)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-semibold ring-1 transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    option.className,
                  )}
                >
                  {option.code} — {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 overflow-x-auto rounded-lg border border-border">
          <table className="min-w-[1220px] border-separate border-spacing-0 text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 min-w-56 border-b border-r border-border bg-muted/60 px-4 py-3 text-left font-semibold">Karyawan</th>
                {days.map((day) => {
                  const date = new Date(period.year, period.month, day)
                  return (
                    <th key={day} className="min-w-16 border-b border-r border-border px-1 py-2 text-center font-semibold last:border-r-0">
                      <span className="block text-sm text-foreground">{day}</span>
                      <span className="block uppercase">{weekdayFormatter.format(date)}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="bg-card">
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-4 py-3 align-top">
                    <p className="font-semibold text-foreground">{employee.name}</p>
                    <p className="mt-1 text-muted-foreground">NIK: {employee.nik ?? "-"}</p>
                    <p className="text-muted-foreground">{employee.posisi ?? "-"}</p>
                  </td>
                  {days.map((day) => {
                    const tanggal = getDateKey(period.year, period.month, day)
                    const status = getCellStatus(employee.id, tanggal)
                    const option = getShiftOption(status)
                    const isActive = activeCell?.employeeId === employee.id && activeCell.tanggal === tanggal
                    return (
                      <td key={tanggal} className="border-b border-r border-border p-1 text-center last:border-r-0">
                        <button
                          type="button"
                          title={option?.label ?? "Belum dijadwalkan"}
                          aria-label={`${employee.name}, ${tanggal}: ${option?.label ?? "Belum dijadwalkan"}`}
                          onClick={() => setActiveCell({ employeeId: employee.id, tanggal })}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-md text-sm font-semibold ring-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            option ? option.className : "bg-background text-muted-foreground ring-border",
                            isActive && "ring-2 ring-ring",
                          )}
                        >
                          {option?.code ?? "-"}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {employees.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
        )}
      </section>
    </div>
  )
}
