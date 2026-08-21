"use client"

import * as React from "react"
import {
  ArrowLeft,
  Eye,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { EmptyState, Field, SearchInput } from "@/components/controls"
import {
  employeesByStore,
  getStore,
  stores,
  type Employee,
} from "@/lib/data"
import { cn } from "@/lib/utils"

function StatusPill({ aktif }: { aktif: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        aktif
          ? "bg-status-cuti-bg text-status-cuti"
          : "bg-muted text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          aktif ? "bg-status-cuti" : "bg-muted-foreground/50",
        )}
      />
      {aktif ? "Aktif" : "Nonaktif"}
    </span>
  )
}

function StoreList({ onSelect }: { onSelect: (id: string) => void }) {
  const [showAdd, setShowAdd] = React.useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Data Toko</h2>
          <p className="text-sm text-muted-foreground">
            Kelola data toko dan karyawan di seluruh cabang.
          </p>
        </div>
        <Button size="lg" onClick={() => setShowAdd(true)}>
          <Plus />
          <span className="hidden sm:inline">Tambah Toko</span>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nama Toko</th>
                <th className="px-4 py-3 font-medium">Kode Toko</th>
                <th className="px-4 py-3 font-medium">Jumlah Karyawan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Akun Store</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {s.kode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {employeesByStore(s.id).length} karyawan
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill aktif={s.aktif} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.akunStore}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelect(s.id)}
                    >
                      <Eye />
                      Detail
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Tambah Toko"
        description="Formulir prototipe — data tidak disimpan."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
            <Button onClick={() => setShowAdd(false)}>Simpan Toko</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nama Toko">
            <input className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25" placeholder="Toko E" />
          </Field>
          <Field label="Kode Toko">
            <input className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25" placeholder="TKE" />
          </Field>
          <Field label="Akun Store">
            <input className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25" placeholder="Store E" />
          </Field>
          <Field label="Status">
            <input className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25" defaultValue="Aktif" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function StoreDetail({
  storeId,
  onBack,
}: {
  storeId: string
  onBack: () => void
}) {
  const store = getStore(storeId)
  const [emps, setEmps] = React.useState<Employee[]>(() =>
    employeesByStore(storeId),
  )
  const [query, setQuery] = React.useState("")
  const [showAdd, setShowAdd] = React.useState(false)
  const [viewEmp, setViewEmp] = React.useState<Employee | null>(null)

  const filtered = emps.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()),
  )

  function toggleAktif(id: string) {
    setEmps((prev) =>
      prev.map((e) => (e.id === id ? { ...e, aktif: !e.aktif } : e)),
    )
  }

  const info = [
    { label: "Nama Toko", value: store?.name },
    { label: "Kode Toko", value: store?.kode },
    { label: "Status", value: store?.aktif ? "Aktif" : "Nonaktif" },
    { label: "Akun Store", value: store?.akunStore },
  ]

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Kembali ke Data Toko
      </button>

      {/* Store info */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
            {store?.kode.slice(-1)}
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {store?.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {emps.length} karyawan terdaftar
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {info.map((i) => (
            <div key={i.label}>
              <p className="text-xs text-muted-foreground">{i.label}</p>
              <p className="mt-0.5 text-sm font-medium">{i.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Employees */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Data Karyawan
          </h3>
          <div className="flex items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Cari karyawan..."
              className="w-full sm:w-56"
            />
            <Button size="lg" onClick={() => setShowAdd(true)}>
              <Plus />
              <span className="hidden sm:inline">Tambah Karyawan</span>
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">ID Karyawan</th>
                  <th className="px-4 py-3 font-medium">Posisi</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Toko</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10">
                      <EmptyState
                        title="Karyawan tidak ditemukan"
                        description="Coba kata kunci lain."
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium">{e.name}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {store?.kode}-{e.id.split("-")[1]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.posisi}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill aktif={e.aktif} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {store?.name}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewEmp(e)}
                          >
                            <Eye />
                            Lihat
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Pencil />
                            Edit
                          </Button>
                          <Button
                            variant={e.aktif ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => toggleAktif(e.id)}
                          >
                            {e.aktif ? <PowerOff /> : <Power />}
                            {e.aktif ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* View employee modal */}
      <Modal
        open={!!viewEmp}
        onClose={() => setViewEmp(null)}
        title={viewEmp?.name ?? ""}
        description={`${store?.name} · ${viewEmp?.posisi ?? ""}`}
        footer={
          <Button variant="outline" onClick={() => setViewEmp(null)}>
            Tutup
          </Button>
        }
      >
        {viewEmp && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">ID Karyawan</p>
              <p className="mt-0.5 font-mono text-sm">
                {store?.kode}-{viewEmp.id.split("-")[1]}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Posisi</p>
              <p className="mt-0.5 text-sm font-medium">{viewEmp.posisi}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="mt-1">
                <StatusPill aktif={viewEmp.aktif} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Toko</p>
              <p className="mt-0.5 text-sm font-medium">{store?.name}</p>
            </div>
          </div>
        )}
      </Modal>

      {/* Add employee modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Tambah Karyawan"
        description="Formulir prototipe — data tidak disimpan."
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Batal
            </Button>
            <Button onClick={() => setShowAdd(false)}>Simpan</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nama">
            <input className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25" placeholder="Nama karyawan" />
          </Field>
          <Field label="Posisi">
            <input className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25" placeholder="Kasir" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

export function PengaturanPage() {
  const [selected, setSelected] = React.useState<string | null>(null)

  return selected ? (
    <StoreDetail storeId={selected} onBack={() => setSelected(null)} />
  ) : (
    <StoreList onSelect={setSelected} />
  )
}
