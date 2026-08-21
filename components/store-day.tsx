"use client"

import { cn } from "@/lib/utils"
import {
  STATUS_LABEL,
  STATUS_ORDER,
  formatTanggal,
  getStore,
  getStoreDay,
  type Employee,
  type ShiftStatus,
} from "@/lib/data"

const groupAccent: Record<ShiftStatus, string> = {
  shift_pagi: "border-l-status-pagi",
  shift_siang: "border-l-status-siang",
  libur: "border-l-status-libur",
  cuti: "border-l-status-cuti",
  izin: "border-l-status-izin",
  sakit: "border-l-status-sakit",
}

const dotColor: Record<ShiftStatus, string> = {
  shift_pagi: "bg-status-pagi",
  shift_siang: "bg-status-siang",
  libur: "bg-status-libur",
  cuti: "bg-status-cuti",
  izin: "bg-status-izin",
  sakit: "bg-status-sakit",
}

function ShiftGroup({
  status,
  people,
}: {
  status: ShiftStatus
  people: Employee[]
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border border-l-[3px] bg-muted/30 p-3",
        groupAccent[status],
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn("size-2 rounded-full", dotColor[status])} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {STATUS_LABEL[status]}
        </span>
        <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground ring-1 ring-inset ring-border">
          {people.length} orang
        </span>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">—</p>
      ) : (
        <ul className="space-y-1">
          {people.map((p) => (
            <li
              key={p.id}
              className="text-[0.95rem] font-medium leading-snug text-foreground"
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function StoreDayCard({
  storeId,
  dateISO,
  statusFilter = "all",
}: {
  storeId: string
  dateISO: string
  statusFilter?: ShiftStatus | "all"
}) {
  const store = getStore(storeId)
  const day = getStoreDay(storeId, dateISO)
  const statuses = STATUS_ORDER.filter((s) =>
    statusFilter === "all" ? day[s].length > 0 : s === statusFilter,
  )
  const total = STATUS_ORDER.reduce((n, s) => n + day[s].length, 0)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
            {store?.kode.slice(-1) ?? "?"}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">
              {store?.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatTanggal(dateISO)}
            </p>
          </div>
        </div>
        <span className="rounded-md bg-card px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">
          {total} karyawan
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 p-4 sm:grid-cols-2">
        {statuses.length === 0 ? (
          <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
            Tidak ada data untuk status ini.
          </p>
        ) : (
          statuses.map((s) => (
            <ShiftGroup key={s} status={s} people={day[s]} />
          ))
        )}
      </div>
    </div>
  )
}
