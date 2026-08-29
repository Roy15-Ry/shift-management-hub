"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, FileDown } from "lucide-react"
import { Segmented, DateField, Field } from "@/components/controls"
import { StoreDayCard } from "@/components/store-day"
import type { UserOptions as AutoTableUserOptions } from "jspdf-autotable"
import {
  STATUS_LABEL,
  STATUS_ORDER,
  daysInMonth,
  employeesByStore,
  getEmployeeStatus,
  monthName,
  stores,
  type ShiftStatus,
} from "@/lib/data"
import { cn } from "@/lib/utils"

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

// ============================================================
// KODE WARNA & STATUS (dipakai Central maupun Store)
// ============================================================

const cellColor: Record<ShiftStatus, string> = {
  shift_pagi: "bg-status-pagi-bg text-status-pagi",
  shift_siang: "bg-status-siang-bg text-status-siang",
  libur: "bg-status-libur-bg text-status-libur",
  cuti: "bg-status-cuti-bg text-status-cuti",
  izin: "bg-status-izin-bg text-status-izin",
  sakit: "bg-status-sakit-bg text-status-sakit",
}

const cellLetter: Record<ShiftStatus, string> = {
  shift_pagi: "P",
  shift_siang: "S",
  libur: "L",
  cuti: "C",
  izin: "I",
  sakit: "K",
}

const dotColor: Record<ShiftStatus, string> = {
  shift_pagi: "bg-status-pagi",
  shift_siang: "bg-status-siang",
  libur: "bg-status-libur",
  cuti: "bg-status-cuti",
  izin: "bg-status-izin",
  sakit: "bg-status-sakit",
}

// ============================================================
// SHIFT STORE (JADWAL SHIFT) — READ-ONLY
// ============================================================

const STORE_SHIFT_OPTIONS = [
  { code: "P", status: "shift_pagi", label: "SHIFT PAGI", className: "bg-amber-500 text-white ring-amber-500/30" },
  { code: "S", status: "shift_siang", label: "SHIFT SIANG", className: "bg-blue-600 text-white ring-blue-600/30" },
  { code: "OFF", status: "libur", label: "OFF", className: "bg-red-600 text-white ring-red-600/30" },
  { code: "C", status: "cuti", label: "CUTI", className: "bg-emerald-600 text-white ring-emerald-600/30" },
  { code: "I", status: "izin", label: "IZIN", className: "bg-violet-600 text-white ring-violet-600/30" },
  { code: "K", status: "sakit", label: "SAKIT", className: "bg-rose-900 text-white ring-rose-900/30" },
] as const

type StoreScheduleStatus = (typeof STORE_SHIFT_OPTIONS)[number]["status"]

const monthFormatter = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" })
const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short" })

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)
}

function getStoreShiftOption(status?: string | null) {
  return STORE_SHIFT_OPTIONS.find((option) => option.status === status)
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

const monthNameFormatter = new Intl.DateTimeFormat("id-ID", { month: "long" })

function StoreJadwalShift() {
  const { profile } = useAuth()
  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [store, setStore] = React.useState<FirestoreStore | null>(null)
  const [employees, setEmployees] = React.useState<FirestoreEmployee[]>([])
  const [schedules, setSchedules] = React.useState<FirestoreSchedule[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const storeId = profile?.storeId
  const cabangId = profile?.cabangId
  const days = React.useMemo(() => getDaysInMonth(period.year, period.month), [period])

  React.useEffect(() => {
    if (!storeId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")

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
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("Failed to load jadwal shift data:", loadError)
        setError("Data jadwal belum dapat dimuat. Silakan coba lagi.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cabangId, period.month, period.year, storeId])

  const scheduleByCell = React.useMemo(() => {
    return new Map(schedules.map((schedule) => [`${schedule.employeeId}:${schedule.tanggal}`, schedule.status]))
  }, [schedules])

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const date = new Date(current.year, current.month + offset, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  if (loading) {
    return <LoadingState label="Memuat jadwal shift..." />
  }

  if (error) {
    return <EmptyState title="Jadwal belum dapat dimuat" description={error} />
  }

  const monthLabel = monthFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()
  const monthNameIndo = monthNameFormatter.format(new Date(period.year, period.month, 1))
  const storeDisplayName = store?.nama ?? "-"

  async function handleDownloadPdf() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])

    const filename = `JADWAL_SHIFT_${slugifyStoreName(storeDisplayName)}_${monthNameIndo.toUpperCase()}_${period.year}.pdf`

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    })

    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("SHIFT MANAGEMENT HUB", 14, 18)
    doc.setFontSize(13)
    doc.text("JADWAL SHIFT", 14, 25)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(`Toko: ${storeDisplayName}`, 14, 32)
    doc.text(`Periode: ${monthLabel}`, 14, 37)
    doc.text(`Jumlah Karyawan: ${employees.length}`, 14, 42)

    const head = ["Karyawan", "NIK", "Jabatan", ...days.map(String)]

    const body = employees.map((employee) => {
      const row: string[] = [employee.name, employee.nik ?? "-", employee.posisi ?? "-"]
      days.forEach((day) => {
        const tanggal = getDateKey(period.year, period.month, day)
        const status = scheduleByCell.get(`${employee.id}:${tanggal}`)
        const option = getStoreShiftOption(status)
        row.push(option?.code ?? "-")
      })
      return row
    })

    const options: AutoTableUserOptions = {
      startY: 47,
      head: [head],
      body,
      margin: { left: 14, right: 14, top: 47, bottom: 14 },
      styles: { fontSize: 7, cellPadding: 1.2, valign: "middle" },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 6.5, valign: "middle" },
      bodyStyles: { textColor: [30, 30, 30] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: "bold" },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
      },
    }

    autoTable(doc, options)

    doc.save(filename)
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">JADWAL SHIFT</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>
                Toko: <span className="font-medium text-foreground">{storeDisplayName}</span>
              </p>
              <p>
                Periode: <span className="font-medium text-foreground">{monthLabel}</span>
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            Karyawan: <span className="font-semibold text-foreground">{employees.length}</span>
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
          <Button variant="outline" onClick={handleDownloadPdf}>
            <FileDown className="mr-2 size-4" />
            Simpan sebagai PDF
          </Button>
        </div>

        <div className="mt-5 rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-20 min-w-[9rem] border-b border-r border-border bg-muted/60 px-1.5 py-2 text-left align-middle font-semibold sm:px-2 md:min-w-[12rem] md:py-2.5">
                    Karyawan
                  </th>
                  {days.map((day) => {
                    const date = new Date(period.year, period.month, day)
                    return (
                      <th
                        key={day}
                        className="min-w-8 overflow-hidden border-b border-r border-border px-0.5 py-1 text-center align-middle font-semibold last:border-r-0"
                      >
                        <span className="block truncate text-[0.7rem] leading-tight text-foreground md:text-sm">{day}</span>
                        <span className="block truncate text-[0.5rem] uppercase leading-tight md:text-[0.65rem]">
                          {weekdayFormatter.format(date)}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-border bg-card px-1.5 py-1.5 align-middle sm:px-2 md:min-w-[12rem]">
                      <p className="truncate text-[0.7rem] font-semibold text-foreground md:text-xs md:font-semibold">
                        {employee.name}
                      </p>
                      <p className="truncate text-[0.55rem] text-muted-foreground md:text-[0.7rem]">
                        NIK: {employee.nik ?? "-"}
                      </p>
                      <p className="truncate text-[0.55rem] text-muted-foreground md:text-[0.7rem]">
                        {employee.posisi ?? "-"}
                      </p>
                    </td>
                    {days.map((day) => {
                      const tanggal = getDateKey(period.year, period.month, day)
                      const status = scheduleByCell.get(`${employee.id}:${tanggal}`)
                      const option = getStoreShiftOption(status)
                      return (
                        <td key={tanggal} className="border-b border-r border-border p-0.5 text-center last:border-r-0">
                          <span
                            title={option?.label ?? "Belum dijadwalkan"}
                            className={cn(
                              "flex h-5 w-full items-center justify-center overflow-hidden rounded text-[0.55rem] font-bold ring-1 md:mx-auto md:h-7 md:w-7 md:rounded-md md:text-[0.7rem]",
                              option ? option.className : "bg-background text-muted-foreground ring-border",
                            )}
                          >
                            {option?.code ?? "-"}
                          </span>
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
          <p className="mt-4 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            KETERANGAN STATUS
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {STORE_SHIFT_OPTIONS.map((option) => (
              <span key={option.status} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ring-1",
                    option.className,
                  )}
                >
                  {option.code}
                </span>
                <span className="text-muted-foreground">
                  {option.status === "libur" ? "LIBUR" : option.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

// ============================================================
// TAMPILAN CENTRAL (SHIFT CABANG)
// ============================================================

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {STATUS_ORDER.map((s) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded text-[0.65rem] font-bold",
              cellColor[s],
            )}
          >
            {cellLetter[s]}
          </span>
          <span className="text-xs text-muted-foreground">
            {STATUS_LABEL[s]}
          </span>
        </div>
      ))}
    </div>
  )
}

function MonthlyView() {
  const [year] = React.useState(2026)
  const [month, setMonth] = React.useState(8) // Agustus
  const days = daysInMonth(year, month)
  const dayList = Array.from({ length: days }, (_, i) => i + 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Bulan sebelumnya"
            onClick={() => setMonth((m) => (m > 1 ? m - 1 : 12))}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="min-w-40 text-center text-base font-semibold">
            {monthName(month)} {year}
          </div>
          <button
            type="button"
            aria-label="Bulan berikutnya"
            onClick={() => setMonth((m) => (m < 12 ? m + 1 : 1))}
            className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <Legend />
      </div>

      <div className="space-y-4">
        {stores.map((s) => {
          const emps = employeesByStore(s.id)
          return (
            <div
              key={s.id}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
              <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {s.kode.slice(-1)}
                </div>
                <p className="text-sm font-semibold">{s.name}</p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {emps.length} karyawan
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Karyawan
                      </th>
                      {dayList.map((d) => (
                        <th
                          key={d}
                          className="border-b border-border px-0 py-2 text-center text-[0.7rem] font-medium text-muted-foreground"
                          style={{ minWidth: 30 }}
                        >
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {emps.map((e) => (
                      <tr key={e.id}>
                        <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5 text-xs font-medium whitespace-nowrap">
                          {e.name}
                        </td>
                        {dayList.map((d) => {
                          const iso = `${year}-08-${String(d).padStart(2, "0")}`
                          const status = getEmployeeStatus(e, iso)
                          return (
                            <td
                              key={d}
                              className="border-b border-border/50 p-0.5 text-center"
                            >
                              <span
                                title={STATUS_LABEL[status]}
                                className={cn(
                                  "mx-auto flex size-6 items-center justify-center rounded text-[0.65rem] font-bold",
                                  cellColor[status],
                                )}
                              >
                                {cellLetter[status]}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DailyView() {
  const [date, setDate] = React.useState("2026-08-12")

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:w-56">
          <Field label="Pilih Tanggal">
            <DateField value={date} onChange={setDate} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {STATUS_ORDER.map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", dotColor[s])} />
              <span className="text-xs text-muted-foreground">
                {STATUS_LABEL[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {stores.map((s) => (
          <StoreDayCard key={s.id} storeId={s.id} dateISO={date} />
        ))}
      </div>
    </div>
  )
}

export function ShiftCabangPage() {
  const [mode, setMode] = React.useState<"bulanan" | "harian">("bulanan")

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Shift Cabang</h2>
          <p className="text-sm text-muted-foreground">
            Lihat jadwal seluruh toko secara bulanan atau berdasarkan tanggal.
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "bulanan", label: "Bulanan" },
            { value: "harian", label: "Harian" },
          ]}
        />
      </div>

      {mode === "bulanan" ? <MonthlyView /> : <DailyView />}
    </div>
  )
}

export function ShiftPage() {
  const { profile } = useAuth()
  const role = profile?.role?.trim().toLowerCase()
  const isStore = role === "store"

  if (isStore) {
    return <StoreJadwalShift />
  }

  return <ShiftCabangPage />
}
