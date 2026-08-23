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
import { useToast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

type FirebaseStore = {
    storeId: string
    namaStore: string
    cabangId: string | null
    aktif: boolean
    akunUid?: string | null
    akunNama?: string | null
    akunEmail?: string | null
    akunAktif?: boolean | null
}

type FirebaseEmployee = {
    id: string
    name: string
    nik: string
    posisi: string
    storeId: string
    cabangId: string | null
    aktif: boolean
}

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

export function StoreFirebaseDetail({
    storeId,
    onBack,
}: {
    storeId: string
    onBack: () => void
}) {
    const { showToast } = useToast()

    const [store, setStore] =
        React.useState<FirebaseStore | null>(
            null,
        )

    const [employees, setEmployees] =
        React.useState<FirebaseEmployee[]>(
            [],
        )

    const [loadingStore, setLoadingStore] =
        React.useState(true)

    const [loadingEmployees, setLoadingEmployees] =
        React.useState(true)

    const [storeError, setStoreError] =
        React.useState("")

    const [employeeError, setEmployeeError] =
        React.useState("")

    const [query, setQuery] =
        React.useState("")

    const [showAdd, setShowAdd] =
        React.useState(false)

    const [viewEmployee, setViewEmployee] =
        React.useState<FirebaseEmployee | null>(
            null,
        )

    const [editEmployee, setEditEmployee] =
        React.useState<FirebaseEmployee | null>(
            null,
        )

    const [deleteEmployee, setDeleteEmployee] =
        React.useState<FirebaseEmployee | null>(
            null,
        )

    const [newName, setNewName] =
        React.useState("")

    const [newNik, setNewNik] =
        React.useState("")

    const [newPosisi, setNewPosisi] =
        React.useState("")

    const [saving, setSaving] =
        React.useState(false)

    async function getIdToken() {
        const authModule =
            await import("@/lib/auth")

        const currentUser =
            authModule.auth.currentUser

        if (!currentUser) {
            throw new Error(
                "Anda belum login.",
            )
        }

        return currentUser.getIdToken()
    }

    // =====================================================
    // LOAD STORE + AKUN STORE
    // =====================================================

    async function loadStore() {
        setLoadingStore(true)
        setStoreError("")

        try {
            const idToken =
                await getIdToken()

            const response =
                await fetch(
                    "/api/admin/stores",
                    {
                        method: "GET",
                        headers: {
                            Authorization:
                                `Bearer ${idToken}`,
                        },
                        cache: "no-store",
                    },
                )

            const data =
                await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message ||
                        "Gagal mengambil data Store.",
                )
            }

            const stores:
                FirebaseStore[] =
                Array.isArray(
                    data.stores,
                )
                    ? data.stores
                    : []

            const selectedStore =
                stores.find(
                    (item) =>
                        String(
                            item.storeId,
                        ) ===
                        String(storeId),
                ) || null

            if (!selectedStore) {
                setStore(null)

                setStoreError(
                    `Store "${storeId}" tidak ditemukan pada data Firebase yang dapat Anda akses.`,
                )

                return
            }

            setStore(selectedStore)
        } catch (error) {
            setStore(null)

            setStoreError(
                error instanceof Error
                    ? error.message
                    : "Gagal mengambil data Store.",
            )
        } finally {
            setLoadingStore(false)
        }
    }

    // =====================================================
    // LOAD KARYAWAN
    // =====================================================

    async function loadEmployees() {
        setLoadingEmployees(true)
        setEmployeeError("")

        try {
            const idToken =
                await getIdToken()

            const response =
                await fetch(
                    `/api/admin/employees?storeId=${encodeURIComponent(
                        storeId,
                    )}`,
                    {
                        method: "GET",
                        headers: {
                            Authorization:
                                `Bearer ${idToken}`,
                        },
                        cache: "no-store",
                    },
                )

            const data =
                await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message ||
                        "Gagal mengambil data karyawan.",
                )
            }

            setEmployees(
                Array.isArray(
                    data.employees,
                )
                    ? data.employees
                    : [],
            )
        } catch (error) {
            setEmployees([])

            setEmployeeError(
                error instanceof Error
                    ? error.message
                    : "Gagal mengambil data karyawan.",
            )
        } finally {
            setLoadingEmployees(false)
        }
    }

    // =====================================================
    // LOAD SAAT STORE DIPILIH
    // =====================================================

    React.useEffect(() => {
        loadStore()
        loadEmployees()
    }, [storeId])

    // =====================================================
    // FORM
    // =====================================================

    function resetEmployeeForm() {
        setNewName("")
        setNewNik("")
        setNewPosisi("")
    }

    function openAddEmployee() {
        resetEmployeeForm()
        setShowAdd(true)
    }

    function openEditEmployee(
        employee: FirebaseEmployee,
    ) {
        setEditEmployee(employee)
        setNewName(employee.name)
        setNewNik(employee.nik)
        setNewPosisi(employee.posisi)
    }

    // =====================================================
    // TAMBAH
    // =====================================================

    async function saveNewEmployee() {
        const name =
            newName.trim()

        const nik =
            newNik
                .trim()
                .toUpperCase()
                .replace(/\s/g, "")

        const posisi =
            newPosisi.trim()

        if (!name) {
            showToast(
                "error",
                "Data belum lengkap",
                "Nama karyawan wajib diisi.",
            )
            return
        }

        if (!nik) {
            showToast(
                "error",
                "Data belum lengkap",
                "NIK karyawan wajib diisi.",
            )
            return
        }

        if (!posisi) {
            showToast(
                "error",
                "Data belum lengkap",
                "Posisi karyawan wajib diisi.",
            )
            return
        }

        setSaving(true)

        try {
            const idToken =
                await getIdToken()

            const response =
                await fetch(
                    "/api/admin/employees",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                            Authorization:
                                `Bearer ${idToken}`,
                        },
                        body: JSON.stringify({
                            name,
                            nik,
                            posisi,
                            storeId,
                        }),
                    },
                )

            const data =
                await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message ||
                        "Gagal menambahkan karyawan.",
                )
            }

            setShowAdd(false)
            resetEmployeeForm()

            await loadEmployees()

            showToast(
                "success",
                "Karyawan berhasil ditambahkan",
                `${name} telah ditambahkan ke ${store.namaStore}.`,
            )
        } catch (error) {
            showToast(
                "error",
                "Gagal menambahkan karyawan",
                error instanceof Error
                    ? error.message
                    : "Terjadi kesalahan saat menambahkan karyawan.",
            )
        } finally {
            setSaving(false)
        }
    }

    // =====================================================
    // EDIT
    // =====================================================

    async function saveEditEmployee() {
        if (!editEmployee) {
            return
        }

        const name =
            newName.trim()

        const nik =
            newNik
                .trim()
                .toUpperCase()
                .replace(/\s/g, "")

        const posisi =
            newPosisi.trim()

        if (!name) {
            showToast(
                "error",
                "Data belum lengkap",
                "Nama karyawan wajib diisi.",
            )
            return
        }

        if (!nik) {
            showToast(
                "error",
                "Data belum lengkap",
                "NIK karyawan wajib diisi.",
            )
            return
        }

        if (!posisi) {
            showToast(
                "error",
                "Data belum lengkap",
                "Posisi karyawan wajib diisi.",
            )
            return
        }

        setSaving(true)

        try {
            const idToken =
                await getIdToken()

            const response =
                await fetch(
                    "/api/admin/employees",
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type":
                                "application/json",
                            Authorization:
                                `Bearer ${idToken}`,
                        },
                        body: JSON.stringify({
                            employeeId:
                                editEmployee.id,
                            name,
                            nik,
                            posisi,
                            aktif:
                                editEmployee.aktif,
                        }),
                    },
                )

            const data =
                await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message ||
                        "Gagal memperbarui karyawan.",
                )
            }

            setEditEmployee(null)
            resetEmployeeForm()

            await loadEmployees()

            showToast(
                "success",
                "Data berhasil diperbarui",
                `${name} telah diperbarui.`,
            )
        } catch (error) {
            showToast(
                "error",
                "Gagal memperbarui data",
                error instanceof Error
                    ? error.message
                    : "Terjadi kesalahan saat memperbarui karyawan.",
            )
        } finally {
            setSaving(false)
        }
    }

    // =====================================================
    // HAPUS
    // =====================================================

    async function handleDeleteEmployee() {
        if (!deleteEmployee) {
            return
        }

        const employeeName =
            deleteEmployee.name

        setSaving(true)

        try {
            const idToken =
                await getIdToken()

            const response =
                await fetch(
                    "/api/admin/employees",
                    {
                        method: "DELETE",
                        headers: {
                            "Content-Type":
                                "application/json",
                            Authorization:
                                `Bearer ${idToken}`,
                        },
                        body: JSON.stringify({
                            employeeId:
                                deleteEmployee.id,
                        }),
                    },
                )

            const data =
                await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message ||
                        "Gagal menghapus karyawan.",
                )
            }

            setDeleteEmployee(null)

            await loadEmployees()

            showToast(
                "success",
                "Karyawan berhasil dihapus",
                `${employeeName} telah dihapus dari daftar karyawan.`,
            )
        } catch (error) {
            showToast(
                "error",
                "Gagal menghapus karyawan",
                error instanceof Error
                    ? error.message
                    : "Terjadi kesalahan saat menghapus karyawan.",
            )
        } finally {
            setSaving(false)
        }
    }

    // =====================================================
    // FILTER
    // =====================================================

    const filteredEmployees =
        employees.filter(
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

    // =====================================================
    // LOADING STORE
    // =====================================================

    if (loadingStore) {
        return (
            <div className="space-y-5">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onBack}
                >
                    <ArrowLeft />
                    Kembali ke Data Toko
                </Button>

                <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                    Memuat data Store...
                </div>
            </div>
        )
    }

    // =====================================================
    // STORE TIDAK DITEMUKAN
    // =====================================================

    if (!store) {
        return (
            <div className="space-y-5">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={onBack}
                >
                    <ArrowLeft />
                    Kembali ke Data Toko
                </Button>

                <div className="rounded-xl border border-border bg-card p-8">
                    <EmptyState
                        title="Store tidak ditemukan"
                        description={
                            storeError ||
                            "Data Store tidak tersedia."
                        }
                    />
                </div>
            </div>
        )
    }

    // =====================================================
    // INFO STORE
    // =====================================================

    return (
        <div className="space-y-5">
            {/* KEMBALI */}

            <Button
                type="button"
                variant="ghost"
                onClick={onBack}
            >
                <ArrowLeft />
                Kembali ke Data Toko
            </Button>

            {/* INFO STORE */}

            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
                        {store.storeId?.slice(
                            -1,
                        ) || "S"}
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">
                            {store.namaStore}
                        </h2>

                        <p className="text-sm text-muted-foreground">
                            {loadingEmployees
                                ? "Memuat data karyawan..."
                                : `${employees.length} karyawan terdaftar`}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                        <p className="text-xs text-muted-foreground">
                            Nama Store
                        </p>

                        <p className="mt-0.5 text-sm font-medium">
                            {store.namaStore ||
                                "-"}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            ID Store
                        </p>

                        <p className="mt-0.5 font-mono text-sm font-medium">
                            {store.storeId ||
                                "-"}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            Cabang
                        </p>

                        <p className="mt-0.5 text-sm font-medium">
                            {store.cabangId ||
                                "-"}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            Status Store
                        </p>

                        <p className="mt-1">
                            <StatusPill
                                aktif={store.aktif}
                            />
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            Akun Store
                        </p>

                        <p className="mt-0.5 text-sm font-medium">
                            {store.akunNama ||
                                "Belum terhubung"}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            Email Akun
                        </p>

                        <p className="mt-0.5 break-all text-sm font-medium">
                            {store.akunEmail ||
                                "-"}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            Status Akun
                        </p>

                        <p className="mt-1">
                            {store.akunAktif ===
                                null ||
                            store.akunAktif ===
                                undefined ? (
                                <span className="text-sm text-muted-foreground">
                                    -
                                </span>
                            ) : (
                                <StatusPill
                                    aktif={
                                        store.akunAktif
                                    }
                                />
                            )}
                        </p>
                    </div>

                    <div>
                        <p className="text-xs text-muted-foreground">
                            User ID
                        </p>

                        <p className="mt-0.5 break-all font-mono text-xs font-medium">
                            {store.akunUid ||
                                "-"}
                        </p>
                    </div>
                </div>
            </div>

            {/* ERROR KARYAWAN */}

            {employeeError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    {employeeError}
                </div>
            )}

            {/* DATA KARYAWAN */}

            <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Data Karyawan
                    </h3>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <SearchInput
                            value={query}
                            onChange={
                                setQuery
                            }
                            placeholder="Cari nama / NIK / posisi..."
                            className="w-full sm:w-64"
                        />

                        <Button
                            size="lg"
                            onClick={
                                openAddEmployee
                            }
                            disabled={
                                !store.aktif
                            }
                        >
                            <Plus />

                            <span className="hidden sm:inline">
                                Tambah Karyawan
                            </span>
                        </Button>
                    </div>
                </div>

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

                                    <th className="px-4 py-3 text-right font-medium">
                                        Action
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {filteredEmployees.length ===
                                0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="px-4 py-10"
                                        >
                                            <EmptyState
                                                title={
                                                    loadingEmployees
                                                        ? "Memuat karyawan..."
                                                        : "Belum ada karyawan"
                                                }
                                                description={
                                                    employeeError ||
                                                    "Tambahkan karyawan melalui tombol Tambah Karyawan."
                                                }
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEmployees.map(
                                        (
                                            employee,
                                        ) => (
                                            <tr
                                                key={
                                                    employee.id
                                                }
                                                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                                            >
                                                <td className="px-4 py-3 font-medium">
                                                    {
                                                        employee.name
                                                    }
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-xs font-medium">
                                                        {
                                                            employee.nik
                                                        }
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {
                                                        employee.posisi
                                                    }
                                                </td>

                                                <td className="px-4 py-3">
                                                    <StatusPill
                                                        aktif={
                                                            employee.aktif
                                                        }
                                                    />
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                setViewEmployee(
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
                                                            disabled={
                                                                saving
                                                            }
                                                        >
                                                            <Pencil />
                                                            Edit
                                                        </Button>

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() =>
                                                                setDeleteEmployee(
                                                                    employee,
                                                                )
                                                            }
                                                            disabled={
                                                                saving
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

            {/* LIHAT */}

            <Modal
                open={
                    !!viewEmployee
                }
                onClose={() =>
                    setViewEmployee(null)
                }
                title={
                    viewEmployee?.name ??
                    ""
                }
                description={
                    viewEmployee
                        ? `${store.namaStore} · ${viewEmployee.posisi}`
                        : ""
                }
                footer={
                    <Button
                        variant="outline"
                        onClick={() =>
                            setViewEmployee(
                                null,
                            )
                        }
                    >
                        Tutup
                    </Button>
                }
            >
                {viewEmployee && (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-muted-foreground">
                                Nama
                            </p>

                            <p className="mt-0.5 text-sm font-medium">
                                {
                                    viewEmployee.name
                                }
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground">
                                NIK
                            </p>

                            <p className="mt-0.5 font-mono text-sm font-medium">
                                {
                                    viewEmployee.nik
                                }
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground">
                                Posisi
                            </p>

                            <p className="mt-0.5 text-sm font-medium">
                                {
                                    viewEmployee.posisi
                                }
                            </p>
                        </div>

                        <div>
                            <p className="text-xs text-muted-foreground">
                                Status
                            </p>

                            <p className="mt-1">
                                <StatusPill
                                    aktif={
                                        viewEmployee.aktif
                                    }
                                />
                            </p>
                        </div>
                    </div>
                )}
            </Modal>

            {/* TAMBAH */}

            <Modal
                open={showAdd}
                onClose={() => {
                    if (!saving) {
                        setShowAdd(false)
                        resetEmployeeForm()
                    }
                }}
                title="Tambah Karyawan"
                description="Masukkan data karyawan baru."
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() =>
                                setShowAdd(false)
                            }
                            disabled={saving}
                        >
                            Batal
                        </Button>

                        <Button
                            onClick={
                                saveNewEmployee
                            }
                            disabled={saving}
                        >
                            {saving
                                ? "Menyimpan..."
                                : "Simpan"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Field label="Nama">
                        <input
                            value={newName}
                            onChange={(event) =>
                                setNewName(
                                    event.target
                                        .value,
                                )
                            }
                            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                            placeholder="Nama karyawan"
                            autoComplete="off"
                        />
                    </Field>

                    <Field label="NIK">
                        <input
                            value={newNik}
                            onChange={(event) =>
                                setNewNik(
                                    event.target
                                        .value
                                        .toUpperCase()
                                        .replace(
                                            /\s/g,
                                            "",
                                        ),
                                )
                            }
                            maxLength={20}
                            className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-mono uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                            placeholder="TP9901120226"
                            autoComplete="off"
                        />
                    </Field>

                    <Field label="Posisi">
                        <input
                            value={newPosisi}
                            onChange={(event) =>
                                setNewPosisi(
                                    event.target
                                        .value,
                                )
                            }
                            className="h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                            placeholder="Kasir"
                            autoComplete="off"
                        />
                    </Field>
                </div>
            </Modal>

            {/* EDIT */}

            <Modal
                open={
                    !!editEmployee
                }
                onClose={() => {
                    if (!saving) {
                        setEditEmployee(
                            null,
                        )
                        resetEmployeeForm()
                    }
                }}
                title="Edit Karyawan"
                description="Perbarui informasi karyawan."
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() =>
                                setEditEmployee(
                                    null,
                                )
                            }
                            disabled={saving}
                        >
                            Batal
                        </Button>

                        <Button
                            onClick={
                                saveEditEmployee
                            }
                            disabled={saving}
                        >
                            {saving
                                ? "Menyimpan..."
                                : "Simpan Perubahan"}
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <Field label="Nama">
                        <input
                            value={newName}
                            onChange={(event) =>
                                setNewName(
                                    event.target
                                        .value,
                                )
                            }
                            className="h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                        />
                    </Field>

                    <Field label="NIK">
                        <input
                            value={newNik}
                            onChange={(event) =>
                                setNewNik(
                                    event.target
                                        .value
                                        .toUpperCase()
                                        .replace(
                                            /\s/g,
                                            "",
                                        ),
                                )
                            }
                            maxLength={20}
                            className="h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-mono uppercase outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                        />
                    </Field>

                    <Field label="Posisi">
                        <input
                            value={newPosisi}
                            onChange={(event) =>
                                setNewPosisi(
                                    event.target
                                        .value,
                                )
                            }
                            className="h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                        />
                    </Field>
                </div>
            </Modal>

            {/* HAPUS */}

            <Modal
                open={
                    !!deleteEmployee
                }
                onClose={() => {
                    if (!saving) {
                        setDeleteEmployee(
                            null,
                        )
                    }
                }}
                title="Hapus Karyawan"
                description="Konfirmasi penghapusan karyawan."
                footer={
                    <>
                        <Button
                            variant="outline"
                            onClick={() =>
                                setDeleteEmployee(
                                    null,
                                )
                            }
                            disabled={saving}
                        >
                            Batal
                        </Button>

                        <Button
                            variant="destructive"
                            onClick={
                                handleDeleteEmployee
                            }
                            disabled={saving}
                        >
                            <Trash2 />
                            {saving
                                ? "Menghapus..."
                                : "Hapus"}
                        </Button>
                    </>
                }
            >
                {deleteEmployee && (
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                        <p className="text-sm font-medium">
                            Hapus karyawan ini?
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                            Karyawan{" "}
                            <span className="font-semibold text-foreground">
                                {
                                    deleteEmployee.name
                                }
                            </span>{" "}
                            dengan NIK{" "}
                            <span className="font-mono font-medium text-foreground">
                                {
                                    deleteEmployee.nik
                                }
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