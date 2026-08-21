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
  addEmployee,
  addStore,
  deleteEmployee,
  deleteStore,
  employeesByStore,
  getStore,
  stores,
  updateEmployee,
  updateStore,
  type Employee,
  type Store,
} from "@/lib/data"

import { cn } from "@/lib/utils"

// ============================================================
// STATUS PILL
// ============================================================

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

  const [showEdit, setShowEdit] =
    React.useState(false)

  const [deleteTarget, setDeleteTarget] =
    React.useState<Store | null>(null)

  const [, setRefresh] =
    React.useState(0)

  // ==========================================================
  // FORM TOKO
  // ==========================================================

  const [storeName, setStoreName] =
    React.useState("")

  const [storeKode, setStoreKode] =
    React.useState("")

  const [storeAkun, setStoreAkun] =
    React.useState("")

  const [storeAktif, setStoreAktif] =
    React.useState(true)

  const [editStoreId, setEditStoreId] =
    React.useState<string | null>(null)

  // ==========================================================
  // RESET FORM
  // ==========================================================

  function resetStoreForm() {
    setStoreName("")
    setStoreKode("")
    setStoreAkun("")
    setStoreAktif(true)
    setEditStoreId(null)
  }

  // ==========================================================
  // BUKA TAMBAH TOKO
  // ==========================================================

  function openAddStore() {
    resetStoreForm()
    setShowAdd(true)
  }

  // ==========================================================
  // SIMPAN TOKO BARU
  // ==========================================================

  function saveNewStore() {
    const name =
      storeName.trim()

    const kode =
      storeKode
        .trim()
        .toUpperCase()

    const akunStore =
      storeAkun.trim()

    if (!name) {
      alert("Nama Toko wajib diisi.")
      return
    }

    if (!kode) {
      alert("Kode Toko wajib diisi.")
      return
    }

    if (!akunStore) {
      alert("Akun Store wajib diisi.")
      return
    }

    // Cek kode toko agar tidak duplikat
    const duplicateKode =
      stores.some(
        (store) =>
          store.kode.toUpperCase() ===
          kode,
      )

    if (duplicateKode) {
      alert(
        `Kode Toko "${kode}" sudah digunakan.`,
      )
      return
    }

    addStore(
      name,
      kode,
      akunStore,
      storeAktif,
    )

    setShowAdd(false)

    resetStoreForm()

    // Paksa komponen membaca data terbaru
    setRefresh(
      (value) => value + 1,
    )
  }

  // ==========================================================
  // BUKA EDIT TOKO
  // ==========================================================

  function openEditStore(
    store: Store,
  ) {
    setEditStoreId(store.id)

    setStoreName(store.name)

    setStoreKode(store.kode)

    setStoreAkun(store.akunStore)

    setStoreAktif(store.aktif)

    setShowEdit(true)
  }

  // ==========================================================
  // SIMPAN EDIT TOKO
  // ==========================================================

  function saveEditStore() {
    if (!editStoreId) {
      return
    }

    const name =
      storeName.trim()

    const kode =
      storeKode
        .trim()
        .toUpperCase()

    const akunStore =
      storeAkun.trim()

    if (!name) {
      alert("Nama Toko wajib diisi.")
      return
    }

    if (!kode) {
      alert("Kode Toko wajib diisi.")
      return
    }

    if (!akunStore) {
      alert("Akun Store wajib diisi.")
      return
    }

    // Cek kode toko duplikat
    const duplicateKode =
      stores.some(
        (store) =>
          store.id !==
          editStoreId &&
          store.kode.toUpperCase() ===
          kode,
      )

    if (duplicateKode) {
      alert(
        `Kode Toko "${kode}" sudah digunakan.`,
      )
      return
    }

    updateStore(
      editStoreId,
      {
        name,
        kode,
        akunStore,
        aktif: storeAktif,
      },
    )

    setShowEdit(false)

    resetStoreForm()

    setRefresh(
      (value) => value + 1,
    )
  }

  // ==========================================================
  // HAPUS TOKO
  // ==========================================================

  function handleDeleteStore() {
    if (!deleteTarget) {
      return
    }

    const success =
      deleteStore(
        deleteTarget.id,
      )

    if (!success) {
      alert(
        "Toko gagal dihapus.",
      )
      return
    }

    setDeleteTarget(null)

    setRefresh(
      (value) => value + 1,
    )
  }

  return (
    <div className="space-y-4">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <div className="flex items-center justify-between gap-3">

        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Data Toko
          </h2>

          <p className="text-sm text-muted-foreground">
            Kelola data toko dan karyawan
            di seluruh cabang.
          </p>
        </div>

        <Button
          size="lg"
          onClick={
            openAddStore
          }
        >
          <Plus />

          <span className="hidden sm:inline">
            Tambah Toko
          </span>
        </Button>

      </div>

      {/* ======================================================
          TABLE TOKO
      ====================================================== */}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[760px] text-sm">

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

              {stores.length === 0 ? (

                <tr>

                  <td
                    colSpan={6}
                    className="px-4 py-10"
                  >
                    <EmptyState
                      title="Belum ada toko"
                      description="Silakan tambahkan toko baru."
                    />
                  </td>

                </tr>

              ) : (

                stores.map(
                  (store) => (

                    <tr
                      key={store.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                    >

                      {/* NAMA */}

                      <td className="px-4 py-3 font-medium">
                        {store.name}
                      </td>

                      {/* KODE */}

                      <td className="px-4 py-3">

                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {store.kode}
                        </span>

                      </td>

                      {/* JUMLAH KARYAWAN */}

                      <td className="px-4 py-3 text-muted-foreground">

                        {employeesByStore(
                          store.id,
                        ).length}{" "}
                        karyawan

                      </td>

                      {/* STATUS */}

                      <td className="px-4 py-3">

                        <StatusPill
                          aktif={
                            store.aktif
                          }
                        />

                      </td>

                      {/* AKUN */}

                      <td className="px-4 py-3 text-muted-foreground">
                        {store.akunStore}
                      </td>

                      {/* ACTION */}

                      <td className="px-4 py-3">

                        <div className="flex items-center justify-end gap-1">

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              onSelect(
                                store.id,
                              )
                            }
                          >
                            <Eye />
                            Detail
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              openEditStore(
                                store,
                              )
                            }
                          >
                            <Pencil />
                            Edit
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteTarget(
                                store,
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

      {/* ======================================================
          MODAL TAMBAH TOKO
      ====================================================== */}

      <Modal
        open={showAdd}
        onClose={() => {
          setShowAdd(false)
          resetStoreForm()
        }}
        title="Tambah Toko"
        description="Masukkan informasi toko baru."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowAdd(false)
                resetStoreForm()
              }}
            >
              Batal
            </Button>

            <Button
              onClick={
                saveNewStore
              }
            >
              Simpan Toko
            </Button>
          </>
        }
      >

        <div className="space-y-4">

          {/* NAMA TOKO */}

          <Field label="Nama Toko">

            <input
              value={storeName}
              onChange={(event) =>
                setStoreName(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Contoh: Toko E"
              autoComplete="off"
            />

          </Field>

          {/* KODE TOKO */}

          <Field label="Kode Toko">

            <input
              value={storeKode}
              onChange={(event) =>
                setStoreKode(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /\s/g,
                      "",
                    ),
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Contoh: TKE"
              autoComplete="off"
            />

          </Field>

          {/* AKUN STORE */}

          <Field label="Akun Store">

            <input
              value={storeAkun}
              onChange={(event) =>
                setStoreAkun(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Contoh: Store E"
              autoComplete="off"
            />

          </Field>

          {/* STATUS */}

          <Field label="Status">

            <select
              value={
                storeAktif
                  ? "aktif"
                  : "nonaktif"
              }
              onChange={(event) =>
                setStoreAktif(
                  event.target.value ===
                  "aktif",
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            >
              <option value="aktif">
                Aktif
              </option>

              <option value="nonaktif">
                Nonaktif
              </option>
            </select>

          </Field>

        </div>

      </Modal>

      {/* ======================================================
          MODAL EDIT TOKO
      ====================================================== */}

      <Modal
        open={showEdit}
        onClose={() => {
          setShowEdit(false)
          resetStoreForm()
        }}
        title="Edit Toko"
        description="Perbarui informasi toko."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowEdit(false)
                resetStoreForm()
              }}
            >
              Batal
            </Button>

            <Button
              onClick={
                saveEditStore
              }
            >
              Simpan Perubahan
            </Button>
          </>
        }
      >

        <div className="space-y-4">

          <Field label="Nama Toko">

            <input
              value={storeName}
              onChange={(event) =>
                setStoreName(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />

          </Field>

          <Field label="Kode Toko">

            <input
              value={storeKode}
              onChange={(event) =>
                setStoreKode(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /\s/g,
                      "",
                    ),
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />

          </Field>

          <Field label="Akun Store">

            <input
              value={storeAkun}
              onChange={(event) =>
                setStoreAkun(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />

          </Field>

          <Field label="Status">

            <select
              value={
                storeAktif
                  ? "aktif"
                  : "nonaktif"
              }
              onChange={(event) =>
                setStoreAktif(
                  event.target.value ===
                  "aktif",
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            >

              <option value="aktif">
                Aktif
              </option>

              <option value="nonaktif">
                Nonaktif
              </option>

            </select>

          </Field>

        </div>

      </Modal>

      {/* ======================================================
          MODAL KONFIRMASI HAPUS TOKO
      ====================================================== */}

      <Modal
        open={!!deleteTarget}
        onClose={() =>
          setDeleteTarget(null)
        }
        title="Hapus Toko"
        description="Konfirmasi penghapusan toko."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteTarget(null)
              }
            >
              Batal
            </Button>

            <Button
              variant="destructive"
              onClick={
                handleDeleteStore
              }
            >
              <Trash2 />
              Hapus Toko
            </Button>
          </>
        }
      >

        {deleteTarget && (

          <div className="space-y-3">

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">

              <p className="text-sm font-medium">
                Apakah Anda yakin ingin
                menghapus toko ini?
              </p>

              <p className="mt-2 text-sm text-muted-foreground">

                Toko{" "}

                <span className="font-semibold text-foreground">
                  {deleteTarget.name}
                </span>{" "}

                akan dihapus.

              </p>

              <p className="mt-1 text-xs text-destructive">

                Semua karyawan yang
                terdaftar pada toko ini
                juga akan ikut dihapus.

              </p>

            </div>

          </div>

        )}

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
  const [store, setStore] =
    React.useState<
      Store | undefined
    >(
      () =>
        getStore(storeId),
    )

  const [emps, setEmps] =
    React.useState<Employee[]>(
      () =>
        employeesByStore(
          storeId,
        ),
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

  // ==========================================================
  // REFRESH DATA
  // ==========================================================

  function refreshData() {
    setStore(
      getStore(storeId),
    )

    setEmps(
      employeesByStore(
        storeId,
      ),
    )
  }

  // ==========================================================
  // FILTER
  // ==========================================================

  const filtered =
    emps.filter(
      (employee) => {
        const search =
          query
            .trim()
            .toLowerCase()

        if (!search) {
          return true
        }

        return (
          employee.name
            .toLowerCase()
            .includes(search) ||
          employee.nik
            .toLowerCase()
            .includes(search) ||
          employee.posisi
            .toLowerCase()
            .includes(search)
        )
      },
    )

  // ==========================================================
  // INFORMASI TOKO
  // ==========================================================

  const info = [
    {
      label: "Nama Toko",
      value: store?.name ?? "-",
    },
    {
      label: "Kode Toko",
      value: store?.kode ?? "-",
    },
    {
      label: "Status",
      value:
        store?.aktif
          ? "Aktif"
          : "Nonaktif",
    },
    {
      label: "Akun Store",
      value:
        store?.akunStore ?? "-",
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
    const name =
      newName.trim()

    const nik =
      newNik
        .trim()
        .toUpperCase()
        .replace(
          /\s/g,
          "",
        )

    const posisi =
      newPosisi.trim()

    if (!name) {
      alert(
        "Nama karyawan wajib diisi.",
      )
      return
    }

    if (!nik) {
      alert(
        "NIK karyawan wajib diisi.",
      )
      return
    }

    if (!posisi) {
      alert(
        "Posisi karyawan wajib diisi.",
      )
      return
    }

    // Validasi NIK duplikat
    const duplicateNik =
      emps.some(
        (employee) =>
          employee.nik.toUpperCase() ===
          nik,
      )

    if (duplicateNik) {
      alert(
        `NIK "${nik}" sudah digunakan oleh karyawan lain.`,
      )
      return
    }

    addEmployee({
      name,
      nik,
      storeId,
      posisi,
      aktif: true,
    })

    setShowAdd(false)

    setNewName("")
    setNewNik("")
    setNewPosisi("")

    refreshData()
  }

  // ==========================================================
  // EDIT KARYAWAN
  // ==========================================================

  function openEditEmployee(
    employee: Employee,
  ) {
    setEditEmp(employee)

    setNewName(
      employee.name,
    )

    setNewNik(
      employee.nik,
    )

    setNewPosisi(
      employee.posisi,
    )
  }

  function saveEditEmployee() {
    if (!editEmp) {
      return
    }

    const name =
      newName.trim()

    const nik =
      newNik
        .trim()
        .toUpperCase()
        .replace(
          /\s/g,
          "",
        )

    const posisi =
      newPosisi.trim()

    if (!name) {
      alert(
        "Nama karyawan wajib diisi.",
      )
      return
    }

    if (!nik) {
      alert(
        "NIK karyawan wajib diisi.",
      )
      return
    }

    if (!posisi) {
      alert(
        "Posisi karyawan wajib diisi.",
      )
      return
    }

    // Validasi NIK duplikat
    const duplicateNik =
      emps.some(
        (employee) =>
          employee.id !==
          editEmp.id &&
          employee.nik.toUpperCase() ===
          nik,
      )

    if (duplicateNik) {
      alert(
        `NIK "${nik}" sudah digunakan oleh karyawan lain.`,
      )
      return
    }

    updateEmployee(
      editEmp.id,
      {
        name,
        nik,
        posisi,
      },
    )

    setEditEmp(null)

    setNewName("")
    setNewNik("")
    setNewPosisi("")

    refreshData()
  }

  // ==========================================================
  // HAPUS KARYAWAN
  // ==========================================================

  function handleDeleteEmployee() {
    if (!deleteEmp) {
      return
    }

    const success =
      deleteEmployee(
        deleteEmp.id,
      )

    if (!success) {
      alert(
        "Karyawan gagal dihapus.",
      )
      return
    }

    setDeleteEmp(null)

    refreshData()
  }

  // ==========================================================
  // TOKO TIDAK DITEMUKAN
  // ==========================================================

  if (!store) {
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

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">

          <EmptyState
            title="Toko tidak ditemukan"
            description="Data toko mungkin sudah dihapus."
          />

        </div>

      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ======================================================
          KEMBALI
      ====================================================== */}

      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />

        Kembali ke Data Toko
      </button>

      {/* ======================================================
          INFO TOKO
      ====================================================== */}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">

        <div className="mb-4 flex items-center gap-3">

          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
            {store.kode?.slice(-1) ||
              "T"}
          </div>

          <div>

            <h2 className="text-lg font-semibold tracking-tight">
              {store.name}
            </h2>

            <p className="text-sm text-muted-foreground">
              {emps.length} karyawan
              terdaftar
            </p>

          </div>

        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">

          {info.map(
            (item) => (

              <div
                key={item.label}
              >

                <p className="text-xs text-muted-foreground">
                  {item.label}
                </p>

                <p className="mt-0.5 text-sm font-medium">
                  {item.value}
                </p>

              </div>

            ),
          )}

        </div>

      </div>

      {/* ======================================================
          DATA KARYAWAN
      ====================================================== */}

      <div className="space-y-3">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Data Karyawan
          </h3>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">

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

        {/* ====================================================
            TABLE KARYAWAN
        ==================================================== */}

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">

          <div className="overflow-x-auto">

            <table className="w-full min-w-[760px] text-sm">

              <thead>

                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">

                  <th className="px-4 py-3 font-medium">
                    Nama
                  </th>

                  <th className="px-4 py-3 font-medium">
                    NIK
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

                {filtered.length === 0 ? (

                  <tr>

                    <td
                      colSpan={6}
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
                    (employee) => (

                      <tr
                        key={
                          employee.id
                        }
                        className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                      >

                        {/* NAMA */}

                        <td className="px-4 py-3 font-medium">
                          {employee.name}
                        </td>

                        {/* NIK */}

                        <td className="px-4 py-3">

                          <span className="font-mono text-xs font-medium text-foreground">
                            {
                              employee.nik
                            }
                          </span>

                        </td>

                        {/* POSISI */}

                        <td className="px-4 py-3 text-muted-foreground">
                          {
                            employee.posisi
                          }
                        </td>

                        {/* STATUS */}

                        <td className="px-4 py-3">

                          <StatusPill
                            aktif={
                              employee.aktif
                            }
                          />

                        </td>

                        {/* TOKO */}

                        <td className="px-4 py-3 text-muted-foreground">
                          {store.name}
                        </td>

                        {/* ACTION */}

                        <td className="px-4 py-3">

                          <div className="flex items-center justify-end gap-1">

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setViewEmp(
                                  employee,
                                )
                              }
                            >
                              <Eye />
                              Lihat
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                openEditEmployee(
                                  employee,
                                )
                              }
                            >
                              <Pencil />
                              Edit
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setDeleteEmp(
                                  employee,
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
        description={
          viewEmp
            ? `${store.name} · ${viewEmp.posisi}`
            : ""
        }
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

              <p className="mt-0.5 font-mono text-sm font-medium">
                {viewEmp.nik}
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
                {store.name}
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

          {/* NAMA */}

          <Field label="Nama">

            <input
              value={newName}
              onChange={(event) =>
                setNewName(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Nama karyawan"
              autoComplete="off"
            />

          </Field>

          {/* NIK */}

          <Field label="NIK">

            <input
              value={newNik}
              onChange={(event) =>
                setNewNik(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /\s/g,
                      "",
                    ),
                )
              }
              maxLength={20}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Contoh: TP9901120226"
              autoComplete="off"
            />

            <p className="mt-1 text-xs text-muted-foreground">
              NIK menggunakan kombinasi
              huruf dan angka.
              Contoh: TP9901120226
            </p>

          </Field>

          {/* POSISI */}

          <Field label="Posisi">

            <input
              value={newPosisi}
              onChange={(event) =>
                setNewPosisi(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              placeholder="Kasir"
              autoComplete="off"
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

          {/* NAMA */}

          <Field label="Nama">

            <input
              value={newName}
              onChange={(event) =>
                setNewName(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              autoComplete="off"
            />

          </Field>

          {/* NIK */}

          <Field label="NIK">

            <input
              value={newNik}
              onChange={(event) =>
                setNewNik(
                  event.target.value
                    .toUpperCase()
                    .replace(
                      /\s/g,
                      "",
                    ),
                )
              }
              maxLength={20}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              autoComplete="off"
            />

            <p className="mt-1 text-xs text-muted-foreground">
              Contoh: TP9901120226
            </p>

          </Field>

          {/* POSISI */}

          <Field label="Posisi">

            <input
              value={newPosisi}
              onChange={(event) =>
                setNewPosisi(
                  event.target.value,
                )
              }
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              autoComplete="off"
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

              dengan NIK{" "}

              <span className="font-mono font-medium text-foreground">
                {deleteEmp.nik}
              </span>{" "}

              akan dihapus dari
              daftar.

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
    React.useState<
      string | null
    >(null)

  function handleSelectStore(
    storeId: string,
  ) {
    setSelected(storeId)
  }

  function handleBack() {
    setSelected(null)
  }

  return selected ? (

    <StoreDetail
      storeId={selected}
      onBack={handleBack}
    />

  ) : (

    <StoreList
      onSelect={
        handleSelectStore
      }
    />

  )
}