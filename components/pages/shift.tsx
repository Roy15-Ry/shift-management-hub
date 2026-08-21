"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Segmented, DateField, Field } from "@/components/controls"
import { StoreDayCard } from "@/components/store-day"
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

export function ShiftPage() {
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
