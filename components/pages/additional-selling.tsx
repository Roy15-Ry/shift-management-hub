"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  HandCoins,
  PenLine,
  Plus,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import {
  DateField,
  EmptyState,
  Field,
  LoadingState,
  Segmented,
  SelectField,
} from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"
import { getFirestoreEmployees } from "@/lib/firestore-data"
import type { FirestoreEmployee } from "@/lib/firestore-data"

// ============================================================
// ADDITIONAL SELLING
//
// PROGRAM KERJA -> ADDITIONAL SELLING
//   - DASHBOARD PROGRAM  : total pencapaian, total target,
//                          progress keseluruhan, progress per
//                          karyawan (periode -> bulan).
//   - INFORMASI PROGRAM  : konten statis (tujuan, goals, skema,
//                          panduan, rumus, prinsip).
//   - PENCATATAN         : tabel pencatatan + filter + tambah /
//                          edit / hapus (khusus STORE) + total.
//
// SCOPE:
//   STORE          -> hanya tokonya sendiri (form aktif).
//   CENTRAL CABANG -> hanya cabangnya sendiri (read-only).
//   CENTRAL PUSAT  -> wajib memilih SATU cabang (read-only).
//
// Data dimuat melalui server (Admin SDK). Employee data dibaca
// langsung (getFirestoreEmployees) hanya untuk akun STORE.
// ============================================================

// ============================================================
// TYPES
// ============================================================

export type AddSellTransaction = {
  id: string
  storeId: string
  cabangId: string
  storeName: string
  employeeId: string
  employeeName: string
  tanggal: string
  nominal: number
  keterangan: string
  createdAt: string | null
  updatedAt: string | null
}

export type AddSellTarget = {
  id: string
  storeId: string
  cabangId: string
  employeeId: string
  employeeName: string
  periode: string
  targetNominal: number
}

export type AddSellPerEmployee = {
  employeeId: string
  employeeName: string
  targetNominal: number
  nominal: number
  progress: number
}

export type AddSellSummary = {
  totalNominal: number
  totalTarget: number
  progress: number
  perEmployee: AddSellPerEmployee[]
}

type AddSellData = {
  periode: string
  transactions: AddSellTransaction[]
  targets: AddSellTarget[]
  summary: AddSellSummary
}

type AddSellGetResponse = {
  success?: boolean
  periode?: string
  transactions?: AddSellTransaction[]
  targets?: AddSellTarget[]
  summary?: AddSellSummary
}

type TabKey = "dashboard" | "pencatatan"

// ============================================================
// UTILITAS
// ============================================================

const monthFormatter = new Intl.DateTimeFormat(
  "id-ID",
  { month: "long", year: "numeric" },
)

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function getLocalDateISO(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function formatRupiah(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  return `Rp${safe.toLocaleString("id-ID")}`
}

const tanggalFormatter = new Intl.DateTimeFormat(
  "id-ID",
  { day: "2-digit", month: "short", year: "numeric" },
)

function formatTanggal(tanggal: string): string {
  const [year, month, day] = tanggal.split("-").map(Number)
  if (!year || !month || !day) {
    return tanggal
  }
  return tanggalFormatter.format(
    new Date(year, month - 1, day),
  )
}

function toDigitsOnly(value: string, max = 12): string {
  return value.replace(/\D/g, "").slice(0, max)
}

// Format tampilan nominal pada input: titik sebagai pemisah
// ribuan. Nilai yang tersimpan tetap digit murni (tanpa titik).
// keepZero: tampilkan "0" untuk nilai nol (dipakai input TARGET,
// karena target nol tetap sah). Input Nilai Add Selling (default)
// tetap menunjukkan string kosong untuk nol.
function formatNominalInput(digits: string, keepZero = false): string {
  if (!digits) {
    return ""
  }

  const clean = toDigitsOnly(digits, 12).replace(/^0+/, "")

  if (!clean) {
    return keepZero ? "0" : ""
  }

  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

// ============================================================
// HALAMAN UTAMA
// ============================================================

export function AdditionalSellingPage() {
  const { profile, user } = useAuth()
  const { showToast } = useToast()

  const role = (profile?.role ?? "").trim().toLowerCase()
  const isStore = role === "store"
  const isCentralCabang = role === "central_cabang"
  const isCentralPusat = role === "central_pusat"

  // ----------------------------------------------------------
  // PERIODE (tahun + bulan)
  // ----------------------------------------------------------

  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const periode = `${period.year}-${pad2(period.month + 1)}`

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const d = new Date(current.year, current.month + offset, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const monthLabel =
    monthFormatter
      .format(new Date(period.year, period.month, 1))
      .toUpperCase()

  // ----------------------------------------------------------
  // TAB
  // ----------------------------------------------------------

  const [tab, setTab] = React.useState<TabKey>("dashboard")

  const [infoOpen, setInfoOpen] = React.useState(false)

  // ----------------------------------------------------------
  // CENTRAL PUSAT — pilih SATU cabang dahulu
  // ----------------------------------------------------------

  const [cabangFilter, setCabangFilter] = React.useState("")
  const [branchOptions, setBranchOptions] = React.useState<string[]>([])

  React.useEffect(() => {
    if (!isCentralPusat || !user) {
      return
    }

    const authedUser = user
    let cancelled = false

    async function loadBranches() {
      try {
        const idToken = await authedUser.getIdToken()
        const response = await fetch("/api/admin/branches", {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        })

        if (!response.ok) return

        const result = (await response.json()) as {
          success?: boolean
          branches?: { cabangId?: string; nama?: string }[]
        }

        if (cancelled || !result.success) return

        const list = (result.branches ?? [])
          .map((b) => String(b.cabangId ?? "").trim().toUpperCase())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))

        setBranchOptions(list)
      } catch (error) {
        console.error("Gagal memuat daftar cabang:", error)
      }
    }

    loadBranches()

    return () => {
      cancelled = true
    }
  }, [isCentralPusat, user])

  // ----------------------------------------------------------
  // DATA (GET /api/additional-selling)
  // ----------------------------------------------------------

  const [data, setData] = React.useState<AddSellData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)
  const requestSeqRef = React.useRef(0)

  const pusatLocked = isCentralPusat && !cabangFilter

  React.useEffect(() => {
    if (!profile || !user) {
      setLoading(false)
      return
    }

    if (pusatLocked) {
      setLoading(false)
      setData(null)
      return
    }

    const authedUser = user
    let cancelled = false
    setLoading(true)
    setError("")

    async function loadData() {
      const seq = ++requestSeqRef.current

      try {
        const idToken = await authedUser.getIdToken()

        const params = new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
        })

        if (isCentralPusat && cabangFilter) {
          params.set("cabang", cabangFilter)
        }

        const response = await fetch(
          `/api/additional-selling?${params.toString()}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error("Data Additional Selling tidak dapat dimuat.")
        }

        const result = (await response.json()) as AddSellGetResponse

        if (cancelled || seq !== requestSeqRef.current) return

        setData({
          periode: String(result.periode ?? periode),
          transactions: Array.isArray(result.transactions)
            ? result.transactions
            : [],
          targets: Array.isArray(result.targets)
            ? result.targets
            : [],
          summary: result.summary ?? {
            totalNominal: 0,
            totalTarget: 0,
            progress: 0,
            perEmployee: [],
          },
        })
      } catch (loadError) {
        console.error("Gagal memuat Additional Selling:", loadError)
        if (!cancelled) {
          setError("Data Additional Selling belum dapat dimuat. Silakan coba lagi.")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [
    profile,
    user,
    period.year,
    period.month,
    cabangFilter,
    reloadKey,
    isCentralPusat,
    pusatLocked,
    periode,
  ])

  // ----------------------------------------------------------
  // EMPLOYEES (khusus STORE) — untuk form & filter
  // ----------------------------------------------------------

  const [employees, setEmployees] = React.useState<FirestoreEmployee[]>([])

  React.useEffect(() => {
    if (!isStore || !profile?.storeId) {
      setEmployees([])
      return
    }

    let cancelled = false

    getFirestoreEmployees(profile.storeId)
      .then((list) => {
        if (!cancelled) {
          setEmployees(Array.isArray(list) ? list : [])
        }
      })
      .catch((err) => {
        console.error("Gagal memuat employees:", err)
        if (!cancelled) {
          setEmployees([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [isStore, profile?.storeId])

  // ----------------------------------------------------------
  // PENCATATAN — FILTER
  // ----------------------------------------------------------

  const [tanggalFilter, setTanggalFilter] = React.useState("all")
  const [timFilter, setTimFilter] = React.useState("all")

  React.useEffect(() => {
    setTanggalFilter("all")
    setTimFilter("all")
  }, [period.year, period.month, cabangFilter])

  const transactions = data?.transactions ?? []

  const tanggalOptions = React.useMemo(() => {
    const dates = Array.from(
      new Set(transactions.map((t) => t.tanggal).filter(Boolean)),
    ).sort()
    return dates
  }, [transactions])

  const timOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const t of transactions) {
      if (!t.employeeId) continue
      if (!map.has(t.employeeId)) {
        map.set(t.employeeId, t.employeeName || "-")
      }
    }
    return Array.from(map.entries())
      .map(([employeeId, employeeName]) => ({ employeeId, employeeName }))
      .sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName, "id", {
          sensitivity: "base",
        }),
      )
  }, [transactions])

  const filteredTransactions = React.useMemo(
    () =>
      transactions.filter(
        (t) =>
          (tanggalFilter === "all" || t.tanggal === tanggalFilter) &&
          (timFilter === "all" ||
            t.employeeId === timFilter),
      ),
    [transactions, tanggalFilter, timFilter],
  )

  const totalFiltered = React.useMemo(
    () =>
      filteredTransactions.reduce(
        (total, t) => total + (Number(t.nominal) || 0),
        0,
      ),
    [filteredTransactions],
  )

  function resetFilters() {
    setTanggalFilter("all")
    setTimFilter("all")
  }

  // ----------------------------------------------------------
  // PENCATATAN — FORM TAMBAH / EDIT
  // ----------------------------------------------------------

  type FormState = {
    id?: string
    tanggal: string
    employeeId: string
    nominal: string
    keterangan: string
  }

  const emptyForm: FormState = {
    tanggal: getLocalDateISO(),
    employeeId: "",
    nominal: "",
    keterangan: "",
  }

  const [formOpen, setFormOpen] = React.useState(false)
  const [formMode, setFormMode] = React.useState<"add" | "edit">("add")
  const [form, setForm] = React.useState<FormState>(emptyForm)
  const [formError, setFormError] = React.useState("")
  const [formSaving, setFormSaving] = React.useState(false)

  // Employee yang tersedia pada tanggal form: aktif, ATAU
  // nonaktif namun tanggal belum melewati tanggalNonaktif.
  const availableEmployees = React.useMemo(() => {
    const employeesAll = isStore ? employees : []
    return employeesAll.filter(
      (e) =>
        e.aktif !== false ||
        (typeof e.tanggalNonaktif === "string" &&
          e.tanggalNonaktif >= form.tanggal),
    )
  }, [employees, isStore, form.tanggal])

  // Kosongkan pilihan bila employee terpilih tidak lagi tersedia.
  React.useEffect(() => {
    if (
      formOpen &&
      form.employeeId &&
      !availableEmployees.some((e) => e.id === form.employeeId)
    ) {
      setForm((current) => ({ ...current, employeeId: "" }))
    }
  }, [availableEmployees, formOpen, form.employeeId])

  function openAddForm() {
    setFormMode("add")
    setForm({ ...emptyForm, tanggal: getLocalDateISO() })
    setFormError("")
    setFormOpen(true)
  }

  function openEditForm(txn: AddSellTransaction) {
    setFormMode("edit")
    setForm({
      id: txn.id,
      tanggal: txn.tanggal,
      employeeId: txn.employeeId,
      nominal: String(Number(txn.nominal) || 0),
      keterangan: txn.keterangan ?? "",
    })
    setFormError("")
    setFormOpen(true)
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")

    if (!form.tanggal || !form.employeeId) {
      setFormError("Tanggal dan Nama Tim wajib diisi.")
      return
    }

    const nominal = Number(toDigitsOnly(form.nominal, 12))

    if (!Number.isInteger(nominal) || nominal <= 0) {
      setFormError("Nilai Add Selling harus berupa bilangan bulat Rupiah yang valid.")
      return
    }

    if (!user) {
      setFormError("Anda harus login terlebih dahulu.")
      return
    }

    setFormSaving(true)

    try {
      const idToken = await user.getIdToken()

      const isEdit = formMode === "edit"

      const body: Record<string, unknown> = {
        tanggal: form.tanggal,
        employeeId: form.employeeId,
        nominal,
        keterangan: form.keterangan.trim(),
      }

      if (isEdit) {
        body.id = form.id
      }

      const response = await fetch("/api/additional-selling", {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      })

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result?.message ??
            (isEdit
              ? "Pencatatan gagal diperbarui."
              : "Pencatatan gagal disimpan."),
        )
      }

      setFormOpen(false)

      showToast(
        "success",
        isEdit
          ? "Pencatatan diperbarui"
          : "Pencatatan tersimpan",
        result.message,
      )

      setReloadKey((current) => current + 1)
    } catch (submitError) {
      console.error("Gagal menyimpan pencatatan:", submitError)
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Pencatatan gagal disimpan.",
      )
    } finally {
      setFormSaving(false)
    }
  }

  // ----------------------------------------------------------
  // PENCATATAN — HAPUS (konfirmasi)
  // ----------------------------------------------------------

  const [pendingDelete, setPendingDelete] =
    React.useState<AddSellTransaction | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  async function performDelete() {
    if (!pendingDelete || !user) return

    setDeleting(true)

    try {
      const idToken = await user.getIdToken()

      const response = await fetch("/api/additional-selling", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id: pendingDelete.id }),
      })

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(result?.message ?? "Pencatatan gagal dihapus.")
      }

      setPendingDelete(null)

      showToast("success", "Pencatatan dihapus", result.message)

      setReloadKey((current) => current + 1)
    } catch (deleteError) {
      console.error("Gagal menghapus pencatatan:", deleteError)
      showToast(
        "error",
        "Gagal menghapus",
        deleteError instanceof Error
          ? deleteError.message
          : undefined,
      )
    } finally {
      setDeleting(false)
    }
  }

  // ----------------------------------------------------------
  // TARGET — ATUR (khusus STORE, tab DASHBOARD PROGRAM)
  // ----------------------------------------------------------

  const [targetDrafts, setTargetDrafts] = React.useState<Record<string, string>>({})
  const [savingTargets, setSavingTargets] = React.useState(false)

  const targetByEmployeeId = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const t of data?.targets ?? []) {
      if (t.employeeId != null) {
        map.set(t.employeeId, Number(t.targetNominal) || 0)
      }
    }
    return map
  }, [data?.targets])

  // Baris target: employee AKTIF toko + employee yang sudah punya
  // target di periode ini (mis. sudah nonaktif).
  const targetRows = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employees) {
      if (e.aktif === false) continue
      map.set(e.id, e.name)
    }
    for (const t of data?.targets ?? []) {
      if (!map.has(t.employeeId)) {
        map.set(t.employeeId, t.employeeName || "-")
      }
    }
    return Array.from(map.entries())
      .map(([employeeId, employeeName]) => ({ employeeId, employeeName }))
      .sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName, "id", {
          sensitivity: "base",
        }),
      )
  }, [employees, data?.targets])

  // Isi draft dari data server ketika data target / employees berubah.
  React.useEffect(() => {
    if (!isStore) return

    setTargetDrafts((current) => {
      const next = { ...current }

      for (const row of targetRows) {
        const existing = targetByEmployeeId.get(row.employeeId)
        if (existing != null) {
          next[row.employeeId] = String(existing)
        }
      }

      return next
    })
  }, [isStore, targetRows, targetByEmployeeId])

  async function handleSaveTargets() {
    if (!user || !isStore) return

    const items: { employeeId: string; targetNominal: number }[] = []

    for (const row of targetRows) {
      const draft = toDigitsOnly(targetDrafts[row.employeeId] ?? "", 12)
      const existing = targetByEmployeeId.get(row.employeeId)

      if (draft === "" && existing == null) {
        continue
      }

      const value = draft === "" ? 0 : Number(draft)

      if (!Number.isInteger(value) || value < 0) {
        continue
      }

      items.push({
        employeeId: row.employeeId,
        targetNominal: value,
      })
    }

    if (items.length === 0) {
      showToast("info", "Tidak ada target", "Tidak ada target yang perlu disimpan.")
      return
    }

    setSavingTargets(true)

    try {
      const idToken = await user.getIdToken()

      const response = await fetch("/api/additional-selling/target", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          periode,
          targets: items,
        }),
      })

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(result?.message ?? "Target gagal disimpan.")
      }

      showToast("success", "Target tersimpan", result.message)

      setReloadKey((current) => current + 1)
    } catch (saveError) {
      console.error("Gagal menyimpan target:", saveError)
      showToast(
        "error",
        "Gagal menyimpan target",
        saveError instanceof Error ? saveError.message : undefined,
      )
    } finally {
      setSavingTargets(false)
    }
  }

  // ----------------------------------------------------------
  // SCOPE LABEL
  // ----------------------------------------------------------

  const scopeLabel = isCentralPusat
    ? cabangFilter || "CABANG"
    : isCentralCabang
      ? profile?.cabangId || "CABANG"
      : profile?.namaStore || profile?.storeId || "TOKO"

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* HEADER + NAVIGASI BULAN */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
            Additional Selling

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Informasi Program"
              title="Informasi Program"
              onClick={() => setInfoOpen(true)}
              className="font-bold"
            >
              !
            </Button>
          </h2>
          <p className="text-sm text-muted-foreground">
            Program Kerja &middot; Pencatatan penjualan tambahan per tim
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bulan sebelumnya"
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-44 text-center text-sm font-semibold">
            {monthLabel}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bulan berikutnya"
            onClick={() => changeMonth(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* FILTER CABANG — HANYA CENTRAL PUSAT */}
      {isCentralPusat && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Cabang
            </h3>
            <p className="text-xs text-muted-foreground">
              Pilih satu cabang untuk melihat data Additional Selling-nya.
            </p>
          </div>
          <div className="w-full sm:w-60">
            <SelectField
              value={cabangFilter}
              onChange={setCabangFilter}
              options={[
                { value: "", label: "Pilih Cabang" },
                ...branchOptions.map((cabangId) => ({
                  value: cabangId,
                  label: cabangId,
                })),
              ]}
            />
          </div>
        </div>
      )}

      {/* TAB */}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "dashboard", label: "DASHBOARD PROGRAM" },
          { value: "pencatatan", label: "PENCATATAN" },
        ]}
      />

      {pusatLocked ? (
        <EmptyState
          icon={TrendingUp}
          title="Pilih cabang dahulu"
          description="Central Pusat wajib memilih satu cabang untuk melihat data Additional Selling."
        />
      ) : loading ? (
        <LoadingState label="Memuat data Additional Selling..." />
      ) : error ? (
        <EmptyState
          icon={TrendingUp}
          title="Data belum dapat dimuat"
          description={error}
        />
      ) : tab === "pencatatan" ? (
        <PencatatanTab
          isStore={isStore}
          transactions={filteredTransactions}
          tanggalOptions={tanggalOptions}
          tanggalFilter={tanggalFilter}
          setTanggalFilter={setTanggalFilter}
          timOptions={timOptions}
          timFilter={timFilter}
          setTimFilter={setTimFilter}
          onResetFilters={resetFilters}
          totalFiltered={totalFiltered}
          onAdd={openAddForm}
          onEdit={openEditForm}
          onDelete={(txn) => setPendingDelete(txn)}
          hasData={transactions.length > 0}
        />
      ) : (
        <DashboardTab
          scopeLabel={scopeLabel}
          monthLabel={monthLabel}
          summary={data?.summary}
          targets={data?.targets ?? []}
          isStore={isStore}
          targetRows={targetRows}
          targetDrafts={targetDrafts}
          setTargetDraft={(employeeId, value) =>
            setTargetDrafts((current) => ({
              ...current,
              [employeeId]: toDigitsOnly(value, 12),
            }))
          }
          onSaveTargets={handleSaveTargets}
          savingTargets={savingTargets}
        />
      )}

      {/* MODAL TAMBAH / EDIT PENCATATAN */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          formMode === "edit"
            ? "Edit Pencatatan Additional Selling"
            : "Tambah Pencatatan Additional Selling"
        }
        description="Pencatatan nilai tambahan penjualan per anggota tim."
      >
        <form onSubmit={handleSubmitForm} className="flex flex-col gap-4">
          <Field label="Tanggal">
            <DateField
              value={form.tanggal}
              onChange={(v) =>
                setForm((current) => ({ ...current, tanggal: v }))
              }
            />
          </Field>

          <Field label="Nama Tim">
            <SelectField
              value={form.employeeId}
              onChange={(v) =>
                setForm((current) => ({ ...current, employeeId: v }))
              }
              options={[
                { value: "", label: "Pilih Tim" },
                ...availableEmployees.map((e) => ({
                  value: e.id,
                  label: e.name,
                })),
              ]}
            />
          </Field>

          <Field label="Nilai Add Selling">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                Rp
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={formatNominalInput(form.nominal)}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    nominal: toDigitsOnly(e.target.value, 12),
                  }))
                }
                placeholder="0"
                className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              />
            </div>
          </Field>

          <Field label="Keterangan (opsional)">
            <textarea
              value={form.keterangan}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  keterangan: e.target.value.slice(0, 500),
                }))
              }
              rows={3}
              placeholder="Catatan tambahan (opsional)"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
          </Field>

          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFormOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={formSaving}>
              {formSaving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL KONFIRMASI HAPUS */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Hapus Pencatatan?"
        description={
          pendingDelete
            ? `${pendingDelete.employeeName || "-"} — ${formatTanggal(pendingDelete.tanggal)} (${formatRupiah(Number(pendingDelete.nominal) || 0)})`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={performDelete}
              disabled={deleting}
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      />

      {/* MODAL INFORMASI PROGRAM — akses kecil via tombol "!" */}
      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="Informasi Program"
        description="PROGRAM KERJA &middot; ADDITIONAL SELLING"
      >
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <InformasiProgram />
        </div>
      </Modal>
    </div>
  )
}

// ============================================================
// DASHBOARD PROGRAM
// ============================================================

function DashboardTab({
  scopeLabel,
  monthLabel,
  summary,
  targets,
  isStore,
  targetRows,
  targetDrafts,
  setTargetDraft,
  onSaveTargets,
  savingTargets,
}: {
  scopeLabel: string
  monthLabel: string
  summary?: AddSellSummary
  targets: AddSellTarget[]
  isStore: boolean
  targetRows: { employeeId: string; employeeName: string }[]
  targetDrafts: Record<string, string>
  setTargetDraft: (employeeId: string, value: string) => void
  onSaveTargets: () => void
  savingTargets: boolean
}) {
  const totalNominal = summary?.totalNominal ?? 0
  const totalTarget = summary?.totalTarget ?? 0
  const progress = summary?.progress ?? 0

  // Nama Tim WAJIB bersumber dari target: employee yang memiliki
  // target pada periode ini harus tampil dengan namanya walaupun
  // belum ada pencatatan. Nama diambil dari target, bukan dari
  // transaksi.
  const targetNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const target of targets) {
      if (!target.employeeId) continue
      if (!map.has(target.employeeId)) {
        map.set(target.employeeId, target.employeeName || "")
      }
    }
    return map
  }, [targets])

  const perEmployee = (summary?.perEmployee ?? []).map((row) => ({
    ...row,
    employeeName:
      row.employeeName && row.employeeName !== "-"
        ? row.employeeName
        : targetNameById.get(row.employeeId) || row.employeeName,
  }))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold tracking-tight">
              Periode {monthLabel}
            </p>
            <p className="text-xs text-muted-foreground">
              Scope: {scopeLabel}
            </p>
          </div>
          <Badge variant="muted">SYSTEM</Badge>
        </div>
      </div>

      {/* 3 KARTU RINGKASAN */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<TrendingUp className="size-4" />}
          label="TOTAL ADDITIONAL SELLING"
          value={formatRupiah(totalNominal)}
        />
        <SummaryCard
          icon={<Target className="size-4" />}
          label="TOTAL TARGET"
          value={formatRupiah(totalTarget)}
        />
        <SummaryCard
          icon={<HandCoins className="size-4" />}
          label="PROGRESS KESELURUHAN"
          value={`${progress}%`}
        />
      </div>

      {/* PROGRESS PER KARYAWAN */}
      <Card>
        <CardContent className="p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            PROGRESS PER KARYAWAN
          </p>

          {perEmployee.length === 0 ? (
            <EmptyState
              title="Belum ada data"
              description="Belum ada target atau pencatatan pada periode ini."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Nama Tim</th>
                    <th className="px-3 py-2.5 text-right font-medium">Target</th>
                    <th className="px-3 py-2.5 text-right font-medium">Pencapaian</th>
                    <th className="px-3 py-2.5 text-right font-medium">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {perEmployee.map((row) => (
                    <tr
                      key={row.employeeId}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        {row.employeeName}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {formatRupiah(row.targetNominal)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {formatRupiah(row.nominal)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {row.progress}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40">
                    <td className="px-3 py-2.5 font-semibold">TOTAL</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      {formatRupiah(totalTarget)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      {formatRupiah(totalNominal)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      {progress}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ATUR TARGET — KHUSUS STORE */}
      {isStore && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  ATUR TARGET KARYAWAN
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Target per karyawan untuk periode {monthLabel}.
                </p>
              </div>
              <Button
                onClick={onSaveTargets}
                disabled={savingTargets}
              >
                <Target className="mr-2 size-4" />
                {savingTargets ? "Menyimpan..." : "Simpan Target"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {targetRows.map((row) => (
                <div
                  key={row.employeeId}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {row.employeeName}
                  </span>
                  <div className="relative w-36 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      Rp
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatNominalInput(targetDrafts[row.employeeId] ?? "", true)}
                      onChange={(e) =>
                        setTargetDraft(row.employeeId, e.target.value)
                      }
                      placeholder="0"
                      className="h-9 w-full rounded-lg border border-input bg-card pl-8 pr-2.5 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// INFORMASI PROGRAM (statis)
// ============================================================

function InformasiProgram() {
  const steps = [
    "Gali kebutuhan",
    "Pilih produk utama",
    "Berikan rekomendasi tambahan",
    "Teknik menawarkan",
    "Closing",
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <p className="text-sm font-semibold uppercase tracking-wide">
              Tujuan Program
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Meningkatkan nilai transaksi dengan cara menggali kebutuhan
            pelanggan, memberikan rekomendasi produk tambahan yang relevan,
            serta mencatat penjualan tambahan (Additional Selling) per anggota
            tim secara transparan.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-primary" />
            <p className="text-sm font-semibold uppercase tracking-wide">
              Goals
            </p>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Setiap anggota tim memiliki target bulanan yang jelas.</li>
            <li>Pencapaian diukur dari total Additional Selling tercatat.</li>
            <li>Dashboard memberikan transparansi progress keseluruhan.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <HandCoins className="size-4 text-primary" />
            <p className="text-sm font-semibold uppercase tracking-wide">
              Skema Additional Selling
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {[
              "GALI KEBUTUHAN",
              "PRODUK UTAMA",
              "REKOMENDASI",
              "TAMBAHAN",
              "CLOSING",
            ].map((label, index) => (
              <div key={label} className="flex items-center gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <PenLine className="size-4 text-primary" />
            <p className="text-sm font-semibold uppercase tracking-wide">
              Panduan
            </p>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Rumus
            </p>
            <p className="mt-1 text-sm text-foreground">
              KEBUTUHAN &rarr; PRODUK UTAMA &rarr; REKOMENDASI &rarr;
              TAMBAHAN &rarr; CLOSING
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prinsip
            </p>
            <p className="mt-1 text-sm italic text-foreground">
              &ldquo;Gali kebutuhannya, berikan rekomendasinya, lengkapi
              kebutuhannya, dan tingkatkan nilai transaksinya.&rdquo;
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// PENCATATAN — TABEL + FILTER
// ============================================================

function PencatatanTab({
  isStore,
  transactions,
  tanggalOptions,
  tanggalFilter,
  setTanggalFilter,
  timOptions,
  timFilter,
  setTimFilter,
  onResetFilters,
  totalFiltered,
  onAdd,
  onEdit,
  onDelete,
  hasData,
}: {
  isStore: boolean
  transactions: AddSellTransaction[]
  tanggalOptions: string[]
  tanggalFilter: string
  setTanggalFilter: (v: string) => void
  timOptions: { employeeId: string; employeeName: string }[]
  timFilter: string
  setTimFilter: (v: string) => void
  onResetFilters: () => void
  totalFiltered: number
  onAdd: () => void
  onEdit: (txn: AddSellTransaction) => void
  onDelete: (txn: AddSellTransaction) => void
  hasData: boolean
}) {
  return (
    <div className="space-y-4">
      {/* FILTER */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-end">
        <Field label="Tanggal" className="w-full lg:w-52">
          <SelectField
            value={tanggalFilter}
            onChange={setTanggalFilter}
            options={[
              { value: "all", label: "Semua Tanggal" },
              ...tanggalOptions.map((tanggal) => ({
                value: tanggal,
                label: formatTanggal(tanggal),
              })),
            ]}
          />
        </Field>

        <Field label="Nama Tim" className="w-full lg:w-52">
          <SelectField
            value={timFilter}
            onChange={setTimFilter}
            options={[
              { value: "all", label: "Semua Tim" },
              ...timOptions.map((t) => ({
                value: t.employeeId,
                label: t.employeeName,
              })),
            ]}
          />
        </Field>

        <Button
          type="button"
          variant="outline"
          className="lg:ml-auto"
          onClick={onResetFilters}
        >
          Reset Filter
        </Button>

        {isStore && (
          <Button type="button" onClick={onAdd}>
            <Plus className="mr-2 size-4" />
            Tambah Pencatatan
          </Button>
        )}
      </div>

      {!hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="Belum ada pencatatan"
          description="Belum ada pencatatan Additional Selling pada periode ini."
        />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Tidak ada hasil"
          description="Tidak ada pencatatan yang cocok dengan filter saat ini."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">No</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Nama Tim</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Nilai Add Selling
                  </th>
                  <th className="px-4 py-3 font-medium">Keterangan</th>
                  {isStore && <th className="px-4 py-3 text-right font-medium">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn, index) => (
                  <tr
                    key={txn.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      {formatTanggal(txn.tanggal)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {txn.employeeName}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatRupiah(Number(txn.nominal) || 0)}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                      {txn.keterangan || "-"}
                    </td>
                    {isStore && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEdit(txn)}
                            aria-label="Edit pencatatan"
                            title="Edit"
                          >
                            <PenLine className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDelete(txn)}
                            aria-label="Hapus pencatatan"
                            title="Hapus"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-medium text-muted-foreground">
              TOTAL NILAI ADDITIONAL SELLING
            </p>
            <p className="text-sm font-bold">
              {formatRupiah(totalFiltered)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}