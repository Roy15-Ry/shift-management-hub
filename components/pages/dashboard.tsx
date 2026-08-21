"use client"

import * as React from "react"
import { RotateCcw, Store as StoreIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DateField,
  EmptyState,
  Field,
  LoadingState,
  SelectField,
  useSimulatedLoading,
} from "@/components/controls"
import { StoreDayCard } from "@/components/store-day"
import {
  DEFAULT_DATE,
  STATUS_LABEL,
  STATUS_ORDER,
  formatTanggal,
  getSummary,
  stores,
  type ShiftStatus,
} from "@/lib/data"
import { cn } from "@/lib/utils"

const summaryMeta: {
  key: ShiftStatus
  bg: string
  text: string
  ring: string
}[] = [
    { key: "shift_pagi", bg: "bg-status-pagi-bg", text: "text-status-pagi", ring: "ring-status-pagi/20" },
    { key: "shift_siang", bg: "bg-status-siang-bg", text: "text-status-siang", ring: "ring-status-siang/20" },
    { key: "libur", bg: "bg-status-libur-bg", text: "text-status-libur", ring: "ring-status-libur/20" },
    { key: "sakit", bg: "bg-status-sakit-bg", text: "text-status-sakit", ring: "ring-status-sakit/20" },
    { key: "izin", bg: "bg-status-izin-bg", text: "text-status-izin", ring: "ring-status-izin/20" },
    { key: "cuti", bg: "bg-status-cuti-bg", text: "text-status-cuti", ring: "ring-status-cuti/20" },
  ]

export function DashboardPage() {
  const [date, setDate] = React.useState(DEFAULT_DATE)
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState<ShiftStatus | "all">(
    "all",
  )

  const visibleStores =
    storeFilter === "all" ? stores : stores.filter((s) => s.id === storeFilter)
  const summary = getSummary(
    date,
    visibleStores.map((s) => s.id),
  )
  const loading = useSimulatedLoading([date, storeFilter, statusFilter])
  const isDefault =
    date === DEFAULT_DATE && storeFilter === "all" && statusFilter === "all"

  return (
    <div className="space-y-6">
      {/* Intro + date */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            DASHBOARD CENTRAL
          </h2>
          <p className="text-sm text-muted-foreground">
            Operasional seluruh toko Hari Ini &middot; {formatTanggal(date)}
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Field label="Tanggal Monitoring">
            <DateField value={date} onChange={setDate} />
          </Field>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <div className="flex flex-col justify-between rounded-xl border border-border bg-primary p-4 text-primary-foreground shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-primary-foreground/80">
            <StoreIcon className="size-4" />
            Total Toko
          </div>
          <p className="mt-3 text-3xl font-bold leading-none">
            {summary.totalToko}
            <span className="ml-1 text-sm font-medium text-primary-foreground/70">
              Toko
            </span>
          </p>
        </div>
        {summaryMeta.map((m) => (
          <div
            key={m.key}
            className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                m.bg,
                m.text,
                m.ring,
              )}
            >
              {STATUS_LABEL[m.key]}
            </div>
            <p className="mt-3 text-3xl font-bold leading-none text-foreground">
              {summary[m.key]}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                orang
              </span>
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
          <Field label="Tanggal">
            <DateField value={date} onChange={setDate} />
          </Field>
          <Field label="Toko">
            <SelectField
              value={storeFilter}
              onChange={setStoreFilter}
              options={[
                { value: "all", label: "Semua Toko" },
                ...stores.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
          <Field label="Status">
            <SelectField
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as ShiftStatus | "all")}
              options={[
                { value: "all", label: "Semua Status" },
                ...STATUS_ORDER.map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                })),
              ]}
            />
          </Field>
          <Button
            variant="outline"
            size="lg"
            disabled={isDefault}
            onClick={() => {
              setDate(DEFAULT_DATE)
              setStoreFilter("all")
              setStatusFilter("all")
            }}
          >
            <RotateCcw />
            Reset Filter
          </Button>
        </div>
      </div>

      {/* Store monitoring */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Monitoring Toko
          </h3>
          <span className="text-xs text-muted-foreground">
            {visibleStores.length} toko ditampilkan
          </span>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card">
            <LoadingState />
          </div>
        ) : visibleStores.length === 0 ? (
          <EmptyState
            title="Tidak ada toko"
            description="Sesuaikan filter untuk menampilkan data toko."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {visibleStores.map((s) => (
              <StoreDayCard
                key={s.id}
                storeId={s.id}
                dateISO={date}
                statusFilter={statusFilter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
