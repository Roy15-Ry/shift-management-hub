"use client"

import * as React from "react"
import { Store as StoreIcon } from "lucide-react"
import {
  EmptyState,
  Field,
  SelectField,
  useSimulatedLoading,
  LoadingState,
} from "@/components/controls"
import { Button } from "@/components/ui/button"
import {
  getStore,
  history,
  stores,
  type HistoryJenis,
} from "@/lib/data"
import { cn } from "@/lib/utils"

const jenisStyle: Record<HistoryJenis, string> = {
  Cuti: "bg-status-cuti-bg text-status-cuti",
  Sakit: "bg-status-sakit-bg text-status-sakit",
  Izin: "bg-status-izin-bg text-status-izin",
}

function JenisBadge({ jenis }: { jenis: HistoryJenis }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        jenisStyle[jenis],
      )}
    >
      {jenis}
    </span>
  )
}

export function HistoryPage() {
  const [storeId, setStoreId] = React.useState("")
  const [periode, setPeriode] = React.useState("all")
  const [karyawan, setKaryawan] = React.useState("all")
  const [jenis, setJenis] = React.useState("all")

  const loading = useSimulatedLoading([storeId, periode, karyawan, jenis])

  const storeHistory = history.filter((h) => h.storeId === storeId)
  const karyawanOptions = Array.from(
    new Set(storeHistory.map((h) => h.name)),
  )

  const filtered = storeHistory.filter((h) => {
    if (karyawan !== "all" && h.name !== karyawan) return false
    if (jenis !== "all" && h.jenis !== jenis) return false
    if (periode !== "all" && !h.tanggalISO.startsWith(periode)) return false
    return true
  })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">History</h2>
        <p className="text-sm text-muted-foreground">
          Riwayat cuti, sakit, dan izin per toko. Pilih toko untuk menampilkan
          data.
        </p>
      </div>

      {/* Store selector */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Pilih Toko">
            <SelectField
              value={storeId}
              onChange={(v) => {
                setStoreId(v)
                setKaryawan("all")
              }}
              options={[
                { value: "", label: "— Pilih Toko —" },
                ...stores.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
          <Field label="Periode">
            <SelectField
              value={periode}
              onChange={setPeriode}
              options={[
                { value: "all", label: "Semua Periode" },
                { value: "2026-08", label: "Agustus 2026" },
                { value: "2026-07", label: "Juli 2026" },
              ]}
            />
          </Field>
          <Field label="Karyawan">
            <SelectField
              value={karyawan}
              onChange={setKaryawan}
              options={[
                { value: "all", label: "Semua Karyawan" },
                ...karyawanOptions.map((n) => ({ value: n, label: n })),
              ]}
            />
          </Field>
          <Field label="Jenis">
            <SelectField
              value={jenis}
              onChange={setJenis}
              options={[
                { value: "all", label: "Semua Jenis" },
                { value: "Cuti", label: "Cuti" },
                { value: "Sakit", label: "Sakit" },
                { value: "Izin", label: "Izin" },
              ]}
            />
          </Field>
        </div>
        {storeId && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPeriode("all")
                setKaryawan("all")
                setJenis("all")
              }}
            >
              Reset Filter
            </Button>
          </div>
        )}
      </div>

      {!storeId ? (
        <EmptyState
          icon={StoreIcon}
          title="Belum ada toko dipilih"
          description="Silakan pilih toko terlebih dahulu untuk menampilkan riwayat cuti, sakit, dan izin."
        />
      ) : loading ? (
        <div className="rounded-xl border border-border bg-card">
          <LoadingState />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada riwayat"
          description={`Tidak ada data history untuk ${getStore(storeId)?.name} dengan filter ini.`}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-semibold">
              Riwayat {getStore(storeId)?.name}
            </p>
            <span className="text-xs text-muted-foreground">
              {filtered.length} data
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Toko</th>
                  <th className="px-4 py-3 font-medium">Jenis</th>
                  <th className="px-4 py-3 font-medium">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr
                    key={h.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {h.tanggal}
                    </td>
                    <td className="px-4 py-3">{h.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {getStore(h.storeId)?.name}
                    </td>
                    <td className="px-4 py-3">
                      <JenisBadge jenis={h.jenis} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {h.keterangan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
