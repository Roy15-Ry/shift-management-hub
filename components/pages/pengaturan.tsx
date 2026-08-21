"use client"

import * as React from "react"
import {
  ArrowLeft,
  Eye,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import {
  EmptyState,
  Field,
  SearchInput,
} from "@/components/controls"

import {
  employeesByStore,
  getStore,
  stores,
  type Employee,
} from "@/lib/data"

import { cn } from "@/lib/utils"

function StatusPill({
  aktif,
}: {
  aktif: boolean
}) {
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
          aktif
            ? "bg-status-cuti"
            : "bg-muted-foreground/50",
        )}
      />

      {aktif ? "Aktif" : "Nonaktif"}
    </span>
  )
}

// ============================================================
// STORE LIST
// ============================================================

function StoreList({
  onSelect,
}: {
  onSelect: (id: string) => void
}) {
  const [showAdd, setShowAdd] =
    React.useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Data Toko
          </h2>

          <p className="text-sm text-muted-foreground">
            Kelola data toko dan karyawan di seluruh cabang.
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => setShowAdd(true)}
        >
          <Plus />

          <span className="hidden sm:inline">
            Tambah Toko
          </span>
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">
                  Nama Toko
                </th>

                <th className="px-4 py-3 font-medium">
                  Kode Toko
                </th>

                <th className="px-4 py-3 font-medium">
                  Jumlah Karyawan
                </th>

                <th className="px-4 py-3 font-medium">
                  Status
                </th>

                <th className="px-4 py-3 font-medium">
                  Akun Store
                </th>

                <th className="px-4 py-3 text-right font-medium">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {stores.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">
                    {s.name}
                  </td>

                  <td className="px-4 py-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {s.kode}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {employeesByStore(
                      s.id,
                    ).length}{" "}
                    karyawan
                  </td>

                  <td className="px-4 py-3">
                    <StatusPill
                      aktif={s.aktif}
                    />
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">
                    {s.akunStore}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onSelect(s.id)
                      }
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

      {/* TAMBAH TOKO */}

      <Modal
        open={showAdd}
        onClose={() =>
          setShowAdd(false)
        }
        title="Tambah Toko"
        description="Formulir prototipe — data tidak disimpan."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setShowAdd(false)
              }
            >
              Batal
            </Button>

            <Button
              onClick={() =>
                setShowAdd(false)
              }
            >
              Simpan Toko
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nama Toko">
            <input
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Toko E"
            />
          </Field>

          <Field label="Kode Toko">
            <input
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="TKE"
            />
          </Field>

          <Field label="Akun Store">
            <input
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Store E"
            />
          </Field>

          <Field label="Status">
            <input
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              defaultValue="Aktif"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================
// STORE DETAIL
// ============================================================

function StoreDetail({
  storeId,
  onBack,
}: {
  storeId: string
  onBack: () => void
}) {
  const store = getStore(storeId)

  const [emps, setEmps] =
    React.useState<Employee[]>(
      () => employeesByStore(storeId),
    )

  const [query, setQuery] =
    React.useState("")

  const [showAdd, setShowAdd] =
    React.useState(false)

  const [viewEmp, setViewEmp] =
    React.useState<Employee | null>(
      null,
    )

  const [editEmp, setEditEmp] =
    React.useState<Employee | null>(
      null,
    )

  const [deleteEmp, setDeleteEmp] =
    React.useState<Employee | null>(
      null,
    )

  const [newName, setNewName] =
    React.useState("")

  const [newNik, setNewNik] =
    React.useState("")

  const [newPosisi, setNewPosisi] =
    React.useState("")

  const filtered = emps.filter(
    (e) => {
      const search =
        query.toLowerCase()

      return (
        e.name
          .toLowerCase()
          .includes(search) ||
        e.nik
          .toLowerCase()
          .includes(search) ||
        e.posisi
          .toLowerCase()
          .includes(search)
      )
    },
  )

  const info = [
    {
      label: "Nama Toko",
      value: store?.name,
    },
    {
      label: "Kode Toko",
      value: store?.kode,
    },
    {
      label: "Status",
      value: store?.aktif
        ? "Aktif"
        : "Nonaktif",
    },
    {
      label: "Akun Store",
      value: store?.akunStore,
    },
  ]

  // ==========================================================
  // TAMBAH KARYAWAN
  // ==========================================================

  function openAddEmployee() {
    setNewName("")
    setNewNik("")
    setNewPosisi("")
    setShowAdd(true)
  }

  function saveNewEmployee() {
    if (
      !newName.trim() ||
      !newNik.trim() ||
      !newPosisi.trim()
    ) {
      alert(
        "Nama, NIK, dan Posisi wajib diisi.",
      )
      return
    }

    const nextNumber =
      emps.length + 1

    const newEmployee: Employee = {
      id: `${storeId}-NEW-${Date.now()}`,
      name: newName.trim(),
      nik: newNik.trim(),
      storeId,
      posisi: newPosisi.trim(),
      aktif: true,
    }

    setEmps((prev) => [
      ...prev,
      newEmployee,
    ])

    setShowAdd(false)
  }

  // ==========================================================
  // EDIT KARYAWAN
  // ==========================================================

  function openEditEmployee(
    employee: Employee,
  ) {
    setEditEmp(employee)
    setNewName(employee.name)
    setNewNik(employee.nik)
    setNewPosisi(employee.posisi)
  }

  function saveEditEmployee() {
    if (!editEmp) return

    if (
      !newName.trim() ||
      !newNik.trim() ||
      !newPosisi.trim()
    ) {
      alert(
        "Nama, NIK, dan Posisi wajib diisi.",
      )
      return
    }

    setEmps((prev) =>
      prev.map((employee) =>
        employee.id === editEmp.id
          ? {
            ...employee,
            name: newName.trim(),
            nik: newNik.trim(),
            posisi:
              newPosisi.trim(),
          }
          : employee,
      ),
    )

    setEditEmp(null)
  }

  // ==========================================================
  // HAPUS KARYAWAN
  // ==========================================================

  function handleDeleteEmployee() {
    if (!deleteEmp) return

    setEmps((prev) =>
      prev.filter(
        (e) =>
          e.id !== deleteEmp.id,
      ),
    )

    setDeleteEmp(null)
  }

  return (
    <div className="space-y-5">

      {/* Kembali */}

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />

        Kembali ke Data Toko
      </button>

      {/* INFO TOKO */}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">

          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
            {store?.kode?.slice(-1)}
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {store?.name}
            </h2>

            <p className="text-sm text-muted-foreground">
              {emps.length} karyawan
              terdaftar
            </p>
          </div>

        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {info.map((i) => (
            <div key={i.label}>
              <p className="text-xs text-muted-foreground">
                {i.label}
              </p>

              <p className="mt-0.5 text-sm font-medium">
                {i.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* DATA KARYAWAN */}

      <div className="space-y-3">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Data Karyawan
          </h3>

          <div className="flex items-center gap-2">

            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Cari nama / NIK / posisi..."
              className="w-full sm:w-64"
            />

            <Button
              size="lg"
              onClick={
                openAddEmployee
              }
            >
              <Plus />

              <span className="hidden sm:inline">
                Tambah Karyawan
              </span>
            </Button>

          </div>
        </div>

        {/* TABLE */}

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">

          <div className="overflow-x-auto">

            <table className="w-full min-w-[850px] text-sm">

              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">

                  <th className="px-4 py-3 font-medium">
                    Nama
                  </th>

                  <th className="px-4 py-3 font-medium">
                    NIK
                  </th>

                  <th className="px-4 py-3 font-medium">
                    ID Karyawan
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Posisi
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Status
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Toko
                  </th>

                  <th className="px-4 py-3 text-right font-medium">
                    Action
                  </th>

                </tr>
              </thead>

              <tbody>

                {filtered.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10"
                    >
                      <EmptyState
                        title="Karyawan tidak ditemukan"
                        description="Coba kata kunci lain."
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map(
                    (e) => (
                      <tr
                        key={e.id}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                      >

                        <td className="px-4 py-3 font-medium">
                          {e.name}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {e.nik}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-muted-foreground">
                            {store?.kode}-
                            {e.id
                              .split(
                                "-",
                              )
                              .slice(
                                -1,
                              )[0]}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-muted-foreground">
                          {e.posisi}
                        </td>

                        <td className="px-4 py-3">
                          <StatusPill
                            aktif={
                              e.aktif
                            }
                          />
                        </td>

                        <td className="px-4 py-3 text-muted-foreground">
                          {store?.name}
                        </td>

                        <td className="px-4 py-3">

                          <div className="flex items-center justify-end gap-1">

                            {/* LIHAT */}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setViewEmp(
                                  e,
                                )
                              }
                            >
                              <Eye />
                              Lihat
                            </Button>

                            {/* EDIT */}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openEditEmployee(
                                  e,
                                )
                              }
                            >
                              <Pencil />
                              Edit
                            </Button>

                            {/* HAPUS */}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteEmp(
                                  e,
                                )
                              }
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 />
                              Hapus
                            </Button>

                          </div>

                        </td>

                      </tr>
                    ),
                  )
                )}

              </tbody>
            </table>

          </div>
        </div>
      </div>

      {/* ======================================================
          MODAL LIHAT KARYAWAN
      ====================================================== */}

      <Modal
        open={!!viewEmp}
        onClose={() =>
          setViewEmp(null)
        }
        title={
          viewEmp?.name ?? ""
        }
        description={`${store?.name} · ${viewEmp?.posisi ?? ""
          }`}
        footer={
          <Button
            variant="outline"
            onClick={() =>
              setViewEmp(null)
            }
          >
            Tutup
          </Button>
        }
      >
        {viewEmp && (
          <div className="grid grid-cols-2 gap-4">

            <div>
              <p className="text-xs text-muted-foreground">
                Nama
              </p>

              <p className="mt-0.5 text-sm font-medium">
                {viewEmp.name}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                NIK
              </p>

              <p className="mt-0.5 font-mono text-sm">
                {viewEmp.nik}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                ID Karyawan
              </p>

              <p className="mt-0.5 font-mono text-sm">
                {store?.kode}-
                {viewEmp.id
                  .split("-")
                  .slice(-1)[0]}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Posisi
              </p>

              <p className="mt-0.5 text-sm font-medium">
                {viewEmp.posisi}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Status
              </p>

              <p className="mt-1">
                <StatusPill
                  aktif={
                    viewEmp.aktif
                  }
                />
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Toko
              </p>

              <p className="mt-0.5 text-sm font-medium">
                {store?.name}
              </p>
            </div>

          </div>
        )}
      </Modal>

      {/* ======================================================
          MODAL TAMBAH KARYAWAN
      ====================================================== */}

      <Modal
        open={showAdd}
        onClose={() =>
          setShowAdd(false)
        }
        title="Tambah Karyawan"
        description="Masukkan data karyawan baru."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setShowAdd(false)
              }
            >
              Batal
            </Button>

            <Button
              onClick={
                saveNewEmployee
              }
            >
              Simpan
            </Button>
          </>
        }
      >

        <div className="space-y-4">

          <Field label="Nama">
            <input
              value={newName}
              onChange={(e) =>
                setNewName(
                  e.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Nama karyawan"
            />
          </Field>

          <Field label="NIK">
            <input
              value={newNik}
              onChange={(e) =>
                setNewNik(
                  e.target.value.replace(
                    /\D/g,
                    "",
                  ),
                )
              }
              inputMode="numeric"
              maxLength={16}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Nomor Induk Karyawan"
            />

            <p className="mt-1 text-xs text-muted-foreground">
              Maksimal 16 digit.
            </p>
          </Field>

          <Field label="Posisi">
            <input
              value={newPosisi}
              onChange={(e) =>
                setNewPosisi(
                  e.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Kasir"
            />
          </Field>

        </div>

      </Modal>

      {/* ======================================================
          MODAL EDIT KARYAWAN
      ====================================================== */}

      <Modal
        open={!!editEmp}
        onClose={() =>
          setEditEmp(null)
        }
        title="Edit Karyawan"
        description="Perbarui informasi karyawan."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setEditEmp(null)
              }
            >
              Batal
            </Button>

            <Button
              onClick={
                saveEditEmployee
              }
            >
              Simpan Perubahan
            </Button>
          </>
        }
      >

        <div className="space-y-4">

          <Field label="Nama">
            <input
              value={newName}
              onChange={(e) =>
                setNewName(
                  e.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
          </Field>

          <Field label="NIK">
            <input
              value={newNik}
              onChange={(e) =>
                setNewNik(
                  e.target.value.replace(
                    /\D/g,
                    "",
                  ),
                )
              }
              inputMode="numeric"
              maxLength={16}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
          </Field>

          <Field label="Posisi">
            <input
              value={newPosisi}
              onChange={(e) =>
                setNewPosisi(
                  e.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
          </Field>

        </div>

      </Modal>

      {/* ======================================================
          MODAL HAPUS KARYAWAN
      ====================================================== */}

      <Modal
        open={!!deleteEmp}
        onClose={() =>
          setDeleteEmp(null)
        }
        title="Hapus Karyawan"
        description="Konfirmasi penghapusan karyawan."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteEmp(null)
              }
            >
              Batal
            </Button>

            <Button
              variant="destructive"
              onClick={
                handleDeleteEmployee
              }
            >
              <Trash2 />
              Hapus
            </Button>
          </>
        }
      >

        {deleteEmp && (
          <div className="rounded-lg border border-border bg-muted/40 p-4">

            <p className="text-sm font-medium">
              Hapus karyawan ini?
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Karyawan{" "}
              <span className="font-semibold text-foreground">
                {deleteEmp.name}
              </span>{" "}
              akan dihapus dari daftar prototype.
            </p>

          </div>
        )}

      </Modal>

    </div>
  )
}

// ============================================================
// PAGE
// ============================================================

export function PengaturanPage() {
  const [selected, setSelected] =
    React.useState<string | null>(
      null,
    )

  return selected ? (
    <StoreDetail
      storeId={selected}
      onBack={() =>
        setSelected(null)
      }
    />
  ) : (
    <StoreList
      onSelect={setSelected}
    />
  )
}