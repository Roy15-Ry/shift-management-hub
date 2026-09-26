"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  PenLine,
  Plus,
  ShieldAlert,
  Store,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Card } from "@/components/ui/card"
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
import {
  getFirestoreEmployees,
  getFirestoreStores,
} from "@/lib/firestore-data"
import type {
  FirestoreEmployee,
  FirestoreStore,
} from "@/lib/firestore-data"
import {
  MONITORING_ERROR_JENIS_LABEL,
  MONITORING_ERROR_JENIS_LIST,
  emptyRowByJenis,
  getMonitoringErrorKeteranganOptions,
  isMonitoringErrorLainnya,
  type MonitoringErrorEmployeeRow,
  type MonitoringErrorJenis,
  type MonitoringErrorRecord,
} from "@/lib/monitoring-error"

// ============================================================
// MONITORING ERROR
//
// PROGRAM KERJA -> MONITORING ERROR
//   - DASHBOARD : satu bulan penuh, agregasi per karyawan untuk
//                 5 jenis error + total. Angka kategori dapat
//                 diklik untuk membuka detail kejadian.
//   - HISTORY   : riwayat KHUSUS modul ini, dibaca dari
//                 collection monitoring_errors.
//   - INPUT     : MODAL di halaman ini (bukan halaman terpisah
//                 dan bukan PageKey terpisah).
//
// SCOPE:
//   STORE          -> toko sendiri, dapat CREATE / UPDATE /
//                     DELETE.
//   CENTRAL CABANG -> pilih toko pada cabangnya (read-only).
//   CENTRAL PUSAT  -> pilih cabang lalu pilih toko (read-only).
//
// Modul ini TIDAK menyentuh History global dan TIDAK memakai
// collection history.
// ============================================================

type TabKey = "dashboard" | "history"

// ============================================================
// TEMA WARNA
//
// Hanya memakai token yang sudah ada di aplikasi sehingga tetap
// harmonis dan tidak mengubah tema global. Nuansa "vivid"
// diciptakan lewat ring tipis, glow lembut, dan transisi hover.
// ============================================================

type Tone = {
  chip: string
  text: string
  soft: string
  card: string
  number: string
}

const TONE: Record<MonitoringErrorJenis, Tone> = {
  "HAPUS TRANSAKSI": {
    chip: "bg-status-pagi-bg text-status-pagi ring-1 ring-inset ring-status-pagi/25",
    text: "text-status-pagi",
    soft: "bg-status-pagi-bg",
    card: "ring-1 ring-inset ring-status-pagi/20 transition-all duration-200 hover:ring-status-pagi/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-status-pagi/45",
    number:
      "text-status-pagi hover:bg-status-pagi/12 hover:ring-status-pagi/40",
  },
  KOMPLAIN: {
    chip: "bg-status-siang-bg text-status-siang ring-1 ring-inset ring-status-siang/25",
    text: "text-status-siang",
    soft: "bg-status-siang-bg",
    card: "ring-1 ring-inset ring-status-siang/20 transition-all duration-200 hover:ring-status-siang/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-status-siang/45",
    number:
      "text-status-siang hover:bg-status-siang/12 hover:ring-status-siang/40",
  },
  "ERROR PERACIKAN": {
    chip: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/25",
    text: "text-primary",
    soft: "bg-primary/10",
    card: "ring-1 ring-inset ring-primary/20 transition-all duration-200 hover:ring-primary/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-primary/40",
    number:
      "text-primary hover:bg-primary/12 hover:ring-primary/40",
  },
  "ERROR KASIR": {
    chip: "bg-status-izin-bg text-status-izin ring-1 ring-inset ring-status-izin/25",
    text: "text-status-izin",
    soft: "bg-status-izin-bg",
    card: "ring-1 ring-inset ring-status-izin/20 transition-all duration-200 hover:ring-status-izin/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-status-izin/45",
    number:
      "text-status-izin hover:bg-status-izin/12 hover:ring-status-izin/40",
  },
  "ERROR OPERASIONAL": {
    chip: "bg-status-cuti-bg text-status-cuti ring-1 ring-inset ring-status-cuti/25",
    text: "text-status-cuti",
    soft: "bg-status-cuti-bg",
    card: "ring-1 ring-inset ring-status-cuti/20 transition-all duration-200 hover:ring-status-cuti/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-status-cuti/45",
    number:
      "text-status-cuti hover:bg-status-cuti/12 hover:ring-status-cuti/40",
  },
}

// ============================================================
// UTILITAS
// ============================================================

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
})

const tanggalFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function getLocalDateISO(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(
    date.getMonth() + 1,
  )}-${pad2(date.getDate())}`
}

function formatTanggal(tanggal: string): string {
  const [year, month, day] = tanggal.split("-").map(Number)
  if (!year || !month || !day) {
    return tanggal
  }
  return tanggalFormatter.format(new Date(year, month - 1, day))
}

// ============================================================
// PEMILIHAN TOKO (CENTRAL CABANG & CENTRAL PUSAT)
// ============================================================
//
// Pola kartu mengikuti daftar toko pada halaman Revisi Absensi
// (components/pages/revisi.tsx -> CentralStoreList): grid
// kartu yang bisa diklik. Data yang dipakai HANYA daftar toko
// dari collection "stores" — tidak ada data Monitoring Error
// yang diambil sebelum kartu dipilih.

function CentralStorePicker({
  stores,
  onSelect,
}: {
  stores: FirestoreStore[]
  onSelect: (storeId: string) => void
}) {
  if (stores.length === 0) {
    return (
      <EmptyState
        title="Belum ada toko"
        description="Tidak ada toko yang tersedia pada cabang ini."
        icon={Store}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {stores.map((store) => (
        <button
          key={store.id}
          type="button"
          onClick={() => onSelect(store.id)}
          className={cn(
            "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-sm",
            "transition-all duration-300",
            "hover:border-primary/40 hover:shadow-md",
            "hover:shadow-[0_0_28px_-14px] hover:shadow-primary/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-border transition-colors duration-300 group-hover:bg-primary/60"
          />

          <span
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-lg",
              "bg-primary/10 text-primary",
              "ring-1 ring-inset ring-primary/25",
              "shadow-[0_0_18px_-8px] shadow-primary/50",
            )}
          >
            <Store className="size-5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">
              {store.nama}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Monitoring Error
            </span>
          </span>

          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      ))}
    </div>
  )
}

// ============================================================
// FORM
// ============================================================

type FormState = {
  id: string
  tanggal: string
  employeeId: string
  jenisError: MonitoringErrorJenis
  keterangan: string
  keteranganManual: string
}

function emptyFormState(): FormState {
  return {
    id: "",
    tanggal: getLocalDateISO(),
    employeeId: "",
    jenisError: "HAPUS TRANSAKSI",
    keterangan: "",
    keteranganManual: "",
  }
}

// ============================================================
// DETAIL DRILL-DOWN
// ============================================================

type DetailState = {
  employeeId: string
  employeeName: string
  jenis: MonitoringErrorJenis
}

// ============================================================
// HALAMAN UTAMA
// ============================================================

export function MonitoringErrorPage() {
  const { profile, user } = useAuth()
  const { showToast } = useToast()

  const role = (profile?.role ?? "").trim().toLowerCase()
  const isStore = role === "store"
  const isCentralPusat = role === "central_pusat"
  const isCentralCabang = role === "central_cabang"
  const isCentral = isCentralPusat || isCentralCabang

  // ----------------------------------------------------------
  // PERIODE (satu bulan penuh)
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

  const monthLabel = monthFormatter
    .format(new Date(period.year, period.month, 1))
    .toUpperCase()

  // ----------------------------------------------------------
  // TAB (INPUT = MODAL, bukan tab)
  // ----------------------------------------------------------

  const [tab, setTab] = React.useState<TabKey>("dashboard")

  // ----------------------------------------------------------
  // CENTRAL PUSAT — pilih cabang
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
  // PEMILIHAN TOKO
  //   STORE          -> tokonya sendiri (tanpa selector)
  //   CENTRAL CABANG -> pilih toko pada cabang akun
  //   CENTRAL PUSAT  -> pilih toko pada cabang yang dipilih
  // ----------------------------------------------------------

  const [storeOptions, setStoreOptions] = React.useState<FirestoreStore[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")

  const storeScopeCabang = isCentralPusat
    ? cabangFilter
    : isCentralCabang
      ? (profile?.cabangId ?? "")
      : ""

  React.useEffect(() => {
    if (!isCentral || !storeScopeCabang) {
      setStoreOptions([])
      return
    }

    let cancelled = false

    getFirestoreStores(
      isCentralPusat ? "central_pusat" : "central_cabang",
      undefined,
      storeScopeCabang,
    )
      .then((list) => {
        if (cancelled) return

        // Central Pusat memuat seluruh toko, jadi cabang terpilih
        // tetap disaring di sisi klien.
        const scope = storeScopeCabang.toUpperCase()

        const sorted = list
          .filter((store) =>
            isCentralPusat
              ? String(store.cabangId ?? "")
                  .trim()
                  .toUpperCase() === scope
              : true,
          )
          .sort((a, b) =>
            a.nama.localeCompare(b.nama, "id", {
              sensitivity: "base",
            }),
          )
        setStoreOptions(sorted)
      })
      .catch((error) => {
        console.error("Gagal memuat daftar toko:", error)
        if (!cancelled) setStoreOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [isCentral, storeScopeCabang])

  // Toko yang sedang dibaca. Untuk Store selalu tokonya sendiri.
  const activeStoreId = isStore
    ? (profile?.storeId ?? "")
    : storeFilter

  const storeName = isStore
    ? (profile?.namaStore || profile?.storeId || "-")
    : (storeOptions.find((s) => s.id === storeFilter)?.nama ?? "-")

  // Central Pusat belum memilih cabang.
  const pusatLocked = isCentralPusat && !cabangFilter
  // Central belum memilih toko.
  const storeLocked = isCentral && !storeFilter
  const locked = pusatLocked || storeLocked

  // ----------------------------------------------------------
  // DATA (GET /api/monitoring-error)
  // ----------------------------------------------------------

  const [records, setRecords] = React.useState<MonitoringErrorRecord[]>([])
  const [rows, setRows] = React.useState<MonitoringErrorEmployeeRow[]>([])
  const [totals, setTotals] = React.useState(() => ({
    ...emptyRowByJenis(),
    total: 0,
  }))
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)
  const requestSeqRef = React.useRef(0)

  React.useEffect(() => {
    if (!profile || !user) {
      setLoading(false)
      return
    }

    if (locked || !activeStoreId) {
      setLoading(false)
      setRecords([])
      setRows([])
      setTotals({ ...emptyRowByJenis(), total: 0 })
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

        if (isCentral && storeFilter) {
          params.set("store", storeFilter)
        }

        const response = await fetch(
          `/api/monitoring-error?${params.toString()}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          },
        )

        const result = (await response.json()) as {
          success?: boolean
          message?: string
          records?: MonitoringErrorRecord[]
          rows?: MonitoringErrorEmployeeRow[]
          totals?: Record<string, number>
        }

        if (!response.ok || !result.success) {
          throw new Error(
            result?.message ??
              "Data Monitoring Error tidak dapat dimuat.",
          )
        }

        if (cancelled || seq !== requestSeqRef.current) return

        setRecords(
          Array.isArray(result.records) ? result.records : [],
        )
        setRows(Array.isArray(result.rows) ? result.rows : [])

        const nextTotals = emptyRowByJenis()
        let grandTotal = 0

        for (const jenis of MONITORING_ERROR_JENIS_LIST) {
          const value = Number(result.totals?.[jenis] ?? 0)
          nextTotals[jenis] = Number.isFinite(value)
            ? value
            : 0
          grandTotal += nextTotals[jenis]
        }

        const total = Number(result.totals?.total)

        setTotals({
          ...nextTotals,
          total: Number.isFinite(total) ? total : grandTotal,
        })
      } catch (loadError) {
        console.error("Gagal memuat Monitoring Error:", loadError)
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Data Monitoring Error belum dapat dimuat. Silakan coba lagi.",
          )
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
    storeFilter,
    activeStoreId,
    locked,
    isCentralPusat,
    isCentral,
    reloadKey,
  ])

  // ----------------------------------------------------------
  // KARYAWAN (khusus STORE) — untuk form input
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
      .catch((error) => {
        console.error("Gagal memuat employees:", error)
        if (!cancelled) {
          setEmployees([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [isStore, profile?.storeId])

  // ----------------------------------------------------------
  // MODAL INPUT
  //
  // State form dideklarasikan lebih dulu karena daftar
  // karyawan yang tersedia bergantung pada form.tanggal.
  // ----------------------------------------------------------

  const [formOpen, setFormOpen] = React.useState(false)
  const [formMode, setFormMode] = React.useState<"add" | "edit">("add")
  const [form, setForm] = React.useState<FormState>(emptyFormState)
  const [formError, setFormError] = React.useState("")
  const [formSaving, setFormSaving] = React.useState(false)

  // Karyawan tersedia pada tanggal form: aktif, ATAU nonaktif
  // namun tanggal belum melewati tanggalNonaktif. POLA SAMA
  // dengan modul existing.
  const availableEmployees = React.useMemo(() => {
    return employees
      .filter(
        (e) =>
          e.aktif !== false ||
          (typeof e.tanggalNonaktif === "string" &&
            e.tanggalNonaktif >= form.tanggal),
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, "id", {
          sensitivity: "base",
        }),
      )
  }, [employees, form.tanggal])

  const keteranganOptions =
    getMonitoringErrorKeteranganOptions(form.jenisError)
  const isLainnya = isMonitoringErrorLainnya(form.keterangan)
  const todayISO = getLocalDateISO()

  function openAddForm() {
    setFormMode("add")
    setForm(emptyFormState())
    setFormError("")
    setFormOpen(true)
  }

  function openEditForm(record: MonitoringErrorRecord) {
    setFormMode("edit")
    setForm({
      id: record.id,
      tanggal: record.tanggal,
      employeeId: record.employeeId,
      jenisError: record.jenisError,
      keterangan: record.keterangan,
      keteranganManual: record.keteranganManual,
    })
    setFormError("")
    setFormOpen(true)
  }

  // Mengganti jenis error me-reset keterangan karena daftar
  // keterangan berbeda per jenis.
  function changeJenisError(next: MonitoringErrorJenis) {
    setForm((current) => ({
      ...current,
      jenisError: next,
      keterangan: "",
      keteranganManual: "",
    }))
  }

  // Mengganti keterangan ke pilihan STANDAR me-reset Keterangan
  // Manual. Nilai manual tidak boleh "bocor" ke pilihan lain.
  function changeKeterangan(next: string) {
    setForm((current) => ({
      ...current,
      keterangan: next,
      keteranganManual: isMonitoringErrorLainnya(next)
        ? current.keteranganManual
        : "",
    }))
  }

  function changeTanggal(next: string) {
    if (next && next > todayISO) {
      setFormError(
        "Tanggal tidak boleh lebih dari hari ini.",
      )
      return
    }

    setForm((current) => ({ ...current, tanggal: next }))
    setFormError("")
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    setFormError("")

    if (!form.tanggal) {
      setFormError("Tanggal wajib diisi.")
      return
    }

    if (form.tanggal > todayISO) {
      setFormError("Tanggal tidak boleh lebih dari hari ini.")
      return
    }

    if (!form.employeeId) {
      setFormError("Karyawan wajib dipilih.")
      return
    }

    if (!form.keterangan) {
      setFormError("Keterangan wajib dipilih.")
      return
    }

    if (isLainnya && !form.keteranganManual.trim()) {
      setFormError(
        "Keterangan manual wajib diisi ketika memilih LAINNYA.",
      )
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

      // Keterangan Manual HANYA dikirim saat LAINNYA dipilih.
      // Identitas dokumen pada edit diambil dari URL, bukan body.
      const body = {
        tanggal: form.tanggal,
        employeeId: form.employeeId,
        jenisError: form.jenisError,
        keterangan: form.keterangan,
        keteranganManual: isLainnya
          ? form.keteranganManual.trim()
          : "",
      }

      const response = await fetch(
        isEdit
          ? `/api/monitoring-error/${encodeURIComponent(form.id)}`
          : "/api/monitoring-error",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(body),
        },
      )

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result?.message ??
            (isEdit
              ? "Monitoring Error gagal diperbarui."
              : "Monitoring Error gagal disimpan."),
        )
      }

      setFormOpen(false)

      showToast(
        "success",
        isEdit
          ? "Monitoring Error diperbarui"
          : "Monitoring Error tersimpan",
        result.message,
      )

      setReloadKey((current) => current + 1)
    } catch (submitError) {
      console.error(
        "Gagal menyimpan Monitoring Error:",
        submitError,
      )
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Monitoring Error gagal disimpan.",
      )
    } finally {
      setFormSaving(false)
    }
  }

  // ----------------------------------------------------------
  // HAPUS (konfirmasi)
  // ----------------------------------------------------------

  const [pendingDelete, setPendingDelete] =
    React.useState<MonitoringErrorRecord | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  async function performDelete() {
    if (!pendingDelete || !user) return

    setDeleting(true)

    try {
      const idToken = await user.getIdToken()

      const response = await fetch(
        `/api/monitoring-error/${encodeURIComponent(
          pendingDelete.id,
        )}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        },
      )

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result?.message ??
            "Monitoring Error gagal dihapus.",
        )
      }

      setPendingDelete(null)

      showToast(
        "success",
        "Monitoring Error dihapus",
        result.message,
      )

      setReloadKey((current) => current + 1)
    } catch (deleteError) {
      console.error(
        "Gagal menghapus Monitoring Error:",
        deleteError,
      )
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
  // DETAIL DRILL-DOWN DASHBOARD
  // ----------------------------------------------------------

  const [detail, setDetail] = React.useState<DetailState | null>(null)

  const detailRecords = React.useMemo(() => {
    if (!detail) return []

    return records.filter(
      (r) =>
        r.employeeId === detail.employeeId &&
        r.jenisError === detail.jenis,
    )
  }, [detail, records])

  // ----------------------------------------------------------
  // FILTER HISTORY (lokal, hanya untuk tampilan)
  // ----------------------------------------------------------

  const [jenisFilter, setJenisFilter] = React.useState<string>("all")
  const [tanggalFilter, setTanggalFilter] = React.useState("all")
  const [employeeFilter, setEmployeeFilter] = React.useState("all")

  React.useEffect(() => {
    setJenisFilter("all")
    setTanggalFilter("all")
    setEmployeeFilter("all")
  }, [period.year, period.month, activeStoreId])

  const tanggalOptions = React.useMemo(() => {
    return Array.from(
      new Set(records.map((r) => r.tanggal)),
    ).sort((a, b) => b.localeCompare(a))
  }, [records])

  const employeeOptions = React.useMemo(() => {
    const map = new Map<string, string>()

    for (const r of records) {
      map.set(r.employeeId, r.employeeName)
    }

    return Array.from(map.entries())
      .map(([employeeId, employeeName]) => ({
        employeeId,
        employeeName,
      }))
      .sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName, "id", {
          sensitivity: "base",
        }),
      )
  }, [records])

  const hasFilter =
    jenisFilter !== "all" ||
    tanggalFilter !== "all" ||
    employeeFilter !== "all"

  function resetFilters() {
    setJenisFilter("all")
    setTanggalFilter("all")
    setEmployeeFilter("all")
  }

  const filteredRecords = React.useMemo(() => {
    return records.filter(
      (r) =>
        (jenisFilter === "all" || r.jenisError === jenisFilter) &&
        (tanggalFilter === "all" || r.tanggal === tanggalFilter) &&
        (employeeFilter === "all" ||
          r.employeeId === employeeFilter),
    )
  }, [records, jenisFilter, tanggalFilter, employeeFilter])

  const showKeterangan = (r: MonitoringErrorRecord) =>
    isMonitoringErrorLainnya(r.keterangan)
      ? r.keteranganManual
      : r.keterangan

  return (
    <div className="space-y-5">
      {/* ============================================ */}
      {/* HEADER                                     */}
      {/* ============================================ */}

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <span
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-2xl",
                "bg-destructive/10 text-destructive",
                "ring-1 ring-inset ring-destructive/25",
                "shadow-[0_0_28px_-10px] shadow-destructive/55",
              )}
            >
              <ShieldAlert className="size-6" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "h-3.5 w-1 shrink-0 rounded-full",
                    "bg-destructive",
                    "shadow-[0_0_10px_0] shadow-destructive/70",
                  )}
                />
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Program Kerja
                </p>
              </div>

              <h1 className="mt-1 text-2xl font-bold uppercase tracking-tight text-foreground">
                Monitoring Error
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-xs font-medium text-foreground/85 ring-1 ring-inset ring-border">
                  <Store className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="max-w-[220px] truncate">
                    {storeName}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isStore && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={openAddForm}
                  className={cn(
                    "gap-1.5",
                    "ring-1 ring-inset ring-primary/30",
                    "shadow-[0_0_16px_-6px] shadow-primary/50",
                    "transition-all duration-200",
                    "hover:ring-primary/60",
                    "hover:shadow-[0_0_20px_-4px] hover:ring-primary/60",
                  )}
                >
                  <Plus className="size-4" />
                  Input
                </Button>
              </div>
            )}

            {/* NAVIGASI PERIODE — bagian dari header utama */}
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => changeMonth(-1)}
                aria-label="Bulan sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[128px] text-center text-sm font-semibold">
                {monthLabel}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => changeMonth(1)}
                aria-label="Bulan berikutnya"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* FILTER CABANG + TOKO + TAB */}
        <div className="flex flex-wrap items-center gap-3">
          {isCentralPusat && (
            <div className="min-w-[200px]">
              <SelectField
                value={cabangFilter}
                onChange={(v) => {
                  setCabangFilter(v)
                  setStoreFilter("")
                }}
                options={[
                  { value: "", label: "Pilih Cabang" },
                  ...branchOptions.map((cabangId) => ({
                    value: cabangId,
                    label: cabangId,
                  })),
                ]}
              />
            </div>
          )}

          {isCentral && !pusatLocked && storeFilter && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStoreFilter("")}
              className="gap-1.5"
            >
              <ChevronLeft className="size-4" />
              Ganti Toko
            </Button>
          )}

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "dashboard", label: "Dashboard" },
              { value: "history", label: "History" },
            ]}
          />
        </div>
      </div>

      {/* ============================================ */}
      {/* CENTRAL — BELUM MEMILIH TOKO                 */}
      {/* ============================================ */}

      {pusatLocked && (
        <EmptyState
          title="Pilih cabang terlebih dahulu"
          description="Central Pusat wajib memilih satu cabang sebelum melihat data Monitoring Error."
          icon={MapPin}
        />
      )}

      {!pusatLocked && storeLocked && isCentral && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Pilih Toko
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {storeOptions.length} toko
              {storeScopeCabang
                ? ` pada cabang ${storeScopeCabang}`
                : ""}
              . Klik satu toko untuk melihat Monitoring Error
              toko tersebut.
            </p>
          </div>

          <CentralStorePicker
            stores={storeOptions}
            onSelect={setStoreFilter}
          />
        </div>
      )}

      {/* ============================================ */}
      {/* TAB: DASHBOARD                             */}
      {/* ============================================ */}

      {!locked && tab === "dashboard" && (
        <>
          {loading && <LoadingState label="Memuat dashboard..." />}

          {!loading && error && (
            <EmptyState
              title={error}
              description="Silakan muat ulang halaman."
              icon={TriangleAlert}
            />
          )}

          {!loading && !error && (
            <div className="space-y-5">
              {/* RINGKASAN PER JENIS */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {MONITORING_ERROR_JENIS_LIST.map((jenis) => {
                  const tone = TONE[jenis]
                  const value = totals[jenis] ?? 0
                  const hasValue = value > 0

                  return (
                    <Card
                      key={jenis}
                      className={cn(
                        "relative overflow-hidden p-4",
                        "shadow-[0_12px_28px_-20px_rgba(0,0,0,0.45)]",
                        "transition-all duration-300",
                        tone.card,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-x-0 top-0 h-px",
                          hasValue
                            ? tone.soft
                            : "bg-border",
                        )}
                      />

                      <p
                        className={cn(
                          "text-[11px] font-semibold uppercase leading-tight tracking-wider",
                          hasValue
                            ? tone.text
                            : "text-muted-foreground",
                        )}
                      >
                        {MONITORING_ERROR_JENIS_LABEL[jenis]}
                      </p>

                      <p
                        className={cn(
                          "mt-2 text-3xl font-bold leading-none tracking-tight tabular-nums",
                          hasValue
                            ? tone.text
                            : "text-muted-foreground/40",
                        )}
                      >
                        {value}
                      </p>
                    </Card>
                  )
                })}
              </div>

              {/* TABEL PER KARYAWAN */}
              {rows.length === 0 ? (
                <EmptyState
                  title="Belum ada data pada periode ini"
                  description={
                    isStore
                      ? "Catat human error pertama melalui tombol Input."
                      : "Belum ada human error pada periode ini."
                  }
                  icon={ShieldAlert}
                />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_18px_40px_-28px_rgba(0,0,0,0.5)]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="border-b-2 border-border/80 bg-muted/60">
                          <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="size-3.5 shrink-0" />
                              Nama Karyawan
                            </span>
                          </th>
                          {MONITORING_ERROR_JENIS_LIST.map(
                            (jenis) => (
                              <th
                                key={jenis}
                                className="px-4 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                              >
                                {
                                  MONITORING_ERROR_JENIS_LABEL[
                                    jenis
                                  ]
                                }
                              </th>
                            ),
                          )}
                          <th className="border-l border-border/80 bg-muted/40 px-4 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-foreground">
                            Total
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.employeeId}
                            className="border-b border-border/50 transition-colors duration-200 last:border-0 hover:bg-destructive/[0.05]"
                          >
                            <td
                              className="max-w-[240px] px-4 py-3.5"
                              title={row.employeeName || "-"}
                            >
                              <span className="block truncate text-[15px] font-semibold text-foreground">
                                {row.employeeName || "-"}
                              </span>
                            </td>

                            {MONITORING_ERROR_JENIS_LIST.map(
                              (jenis) => {
                                const value =
                                  row.byJenis[jenis] ?? 0

                                return (
                                  <td
                                    key={jenis}
                                    className="px-4 py-3.5 text-center"
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDetail({
                                          employeeId:
                                            row.employeeId,
                                          employeeName:
                                            row.employeeName,
                                          jenis,
                                        })
                                      }
                                      disabled={value === 0}
                                      className={cn(
                                        "inline-grid size-10 place-items-center rounded-xl text-base font-bold tabular-nums transition-all duration-200",
                                        "disabled:cursor-default disabled:opacity-40",
                                        value > 0
                                          ? TONE[
                                              jenis
                                            ].number
                                          : "text-muted-foreground/50",
                                        value > 0
                                          ? "ring-1 ring-inset ring-transparent hover:ring-current/40"
                                          : "",
                                      )}
                                      aria-label={`Detail ${MONITORING_ERROR_JENIS_LABEL[jenis]} ${row.employeeName}`}
                                    >
                                      {value}
                                    </button>
                                  </td>
                                )
                              },
                            )}

                            <td className="whitespace-nowrap border-l border-border/80 bg-muted/30 px-4 py-3.5 text-right text-lg font-bold text-foreground tabular-nums">
                              {row.total}
                            </td>
                          </tr>
                        ))}

                        {/* TOTAL KESELURUHAN */}
                        <tr className="border-t-2 border-border bg-muted/60">
                          <td className="px-4 py-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Total
                          </td>
                          {MONITORING_ERROR_JENIS_LIST.map(
                            (jenis) => {
                              const value =
                                totals[jenis] ?? 0

                              return (
                                <td
                                  key={jenis}
                                  className="px-4 py-4 text-center text-base font-bold tabular-nums"
                                >
                                  <span
                                    className={
                                      value > 0
                                        ? TONE[jenis].text
                                        : "text-muted-foreground/40"
                                    }
                                  >
                                    {value}
                                  </span>
                                </td>
                              )
                            },
                          )}
                          <td className="whitespace-nowrap border-l border-border/80 bg-muted/40 px-4 py-4 text-right text-xl font-bold text-foreground tabular-nums">
                            {totals.total ?? 0}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ============================================ */}
      {/* TAB: HISTORY (KHUSUS MODUL INI)             */}
      {/* ============================================ */}

      {!locked && tab === "history" && (
        <>
          {loading && <LoadingState label="Memuat history..." />}

          {!loading && error && (
            <EmptyState
              title={error}
              description="Silakan muat ulang halaman."
              icon={TriangleAlert}
            />
          )}

          {!loading && !error && (
            <div className="space-y-4">
              {/* FILTER */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  value={jenisFilter}
                  onChange={setJenisFilter}
                  options={[
                    { value: "all", label: "Semua Jenis" },
                    ...MONITORING_ERROR_JENIS_LIST.map((jenis) => ({
                      value: jenis,
                      label: MONITORING_ERROR_JENIS_LABEL[jenis],
                    })),
                  ]}
                />

                <SelectField
                  value={tanggalFilter}
                  onChange={setTanggalFilter}
                  options={[
                    { value: "all", label: "Semua Tanggal" },
                    ...tanggalOptions.map((d) => ({
                      value: d,
                      label: formatTanggal(d),
                    })),
                  ]}
                />

                <SelectField
                  value={employeeFilter}
                  onChange={setEmployeeFilter}
                  options={[
                    { value: "all", label: "Semua Karyawan" },
                    ...employeeOptions.map((o) => ({
                      value: o.employeeId,
                      label: o.employeeName,
                    })),
                  ]}
                />

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFilters}
                    disabled={!hasFilter}
                    className="w-full"
                  >
                    Reset Filter
                  </Button>
                </div>
              </div>

              {/* TABEL */}
              {filteredRecords.length === 0 ? (
                <EmptyState
                  title={
                    hasFilter
                      ? "Tidak ada data sesuai filter"
                      : "Belum ada riwayat"
                  }
                  description={
                    hasFilter
                      ? "Coba ubah atau reset filter yang aktif."
                      : isStore
                        ? "Catat human error pertama melalui tombol Input."
                        : "Belum ada human error pada periode ini."
                  }
                  icon={ShieldAlert}
                />
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_18px_40px_-28px_rgba(0,0,0,0.5)]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b-2 border-border/80 bg-muted/60">
                          <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Tanggal
                          </th>
                          <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Karyawan
                          </th>
                          <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Jenis Error
                          </th>
                          <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Keterangan
                          </th>
                          {isStore && (
                            <th className="px-4 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Aksi
                            </th>
                          )}
                        </tr>
                      </thead>

                      <tbody>
                        {filteredRecords.map((r) => {
                          const tone = TONE[r.jenisError]

                          return (
                            <tr
                              key={r.id}
                              className="border-b border-border/50 transition-colors duration-200 last:border-0 hover:bg-destructive/[0.05]"
                            >
                              <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                                {formatTanggal(r.tanggal)}
                              </td>
                              <td className="px-4 py-3.5">
                                <span className="block text-[15px] font-semibold text-foreground">
                                  {r.employeeName || "-"}
                                </span>
                              </td>
                              <td className="px-4 py-3.5">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold",
                                    tone.chip,
                                  )}
                                >
                                  {MONITORING_ERROR_JENIS_LABEL[
                                    r.jenisError
                                  ]}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-muted-foreground">
                                {showKeterangan(r) || "-"}
                              </td>

                              {isStore && (
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() =>
                                        openEditForm(r)
                                      }
                                      aria-label="Ubah"
                                    >
                                      <PenLine className="size-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() =>
                                        setPendingDelete(r)
                                      }
                                      aria-label="Hapus"
                                    >
                                      <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ============================================ */}
      {/* MODAL: INPUT / UBAH (BUKAN HALAMAN)         */}
      {/* ============================================ */}

      <Modal
        open={formOpen && isStore}
        onClose={() => setFormOpen(false)}
        title={
          formMode === "edit"
            ? "Ubah Human Error"
            : "Input Human Error"
        }
        description="Satu input = satu kejadian human error."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={formSaving}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="monitoring-error-form"
              disabled={formSaving}
            >
              {formSaving
                ? "Menyimpan..."
                : formMode === "edit"
                  ? "Simpan Perubahan"
                  : "Simpan"}
            </Button>
          </>
        }
      >
        <form
          id="monitoring-error-form"
          onSubmit={handleSubmitForm}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal">
              <DateField
                value={form.tanggal}
                onChange={changeTanggal}
              />
            </Field>

            <Field label="Karyawan">
              <SelectField
                value={form.employeeId}
                onChange={(v) =>
                  setForm((current) => ({
                    ...current,
                    employeeId: v,
                  }))
                }
                options={[
                  { value: "", label: "Pilih Karyawan" },
                  ...availableEmployees.map((e) => ({
                    value: e.id,
                    label: e.name,
                  })),
                ]}
              />
            </Field>
          </div>

          <Field label="Jenis Error">
            <SelectField
              value={form.jenisError}
              onChange={(v) =>
                changeJenisError(v as MonitoringErrorJenis)
              }
              options={MONITORING_ERROR_JENIS_LIST.map((jenis) => ({
                value: jenis,
                label: MONITORING_ERROR_JENIS_LABEL[jenis],
              }))}
            />
          </Field>

          <Field label="Keterangan">
            <SelectField
              value={form.keterangan}
              onChange={changeKeterangan}
              options={[
                { value: "", label: "Pilih Keterangan" },
                ...keteranganOptions.map((k) => ({
                  value: k,
                  label: k,
                })),
              ]}
            />
          </Field>

          {isLainnya && (
            <Field label="Keterangan Manual">
              <textarea
                value={form.keteranganManual}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    keteranganManual: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Jelaskan kejadian yang terjadi."
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
              />
            </Field>
          )}

          {formError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      {/* ============================================ */}
      {/* MODAL: DETAIL KEJADIAN (DRILL-DOWN)        */}
      {/* ============================================ */}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={
          detail
            ? `${MONITORING_ERROR_JENIS_LABEL[detail.jenis]} · ${detail.employeeName}`
            : "Detail"
        }
        description={`Periode ${monthLabel}. ${detailRecords.length} kejadian.`}
      >
        {detailRecords.length === 0 ? (
          <EmptyState
            title="Tidak ada kejadian"
            description="Belum ada kejadian pada kategori ini."
          />
        ) : (
          <ul className="space-y-2">
            {detailRecords.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <p className="text-sm font-medium">
                  {formatTanggal(r.tanggal)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {showKeterangan(r) || "-"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* ============================================ */}
      {/* MODAL: KONFIRMASI HAPUS                   */}
      {/* ============================================ */}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Hapus Human Error"
        description="Data yang dihapus tidak dapat dikembalikan."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={performDelete}
              disabled={deleting}
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
                              {
                                MONITORING_ERROR_JENIS_LABEL[
                                  pendingDelete.jenisError
                                ]
                              } ·{" "}
              {formatTanggal(pendingDelete.tanggal)}
            </p>
            <p className="text-muted-foreground">
              {pendingDelete.employeeName} ·{" "}
              {showKeterangan(pendingDelete)}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
