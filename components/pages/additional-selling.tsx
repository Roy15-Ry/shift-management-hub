"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Package,
  PenLine,
  Plus,
  Sparkles,
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
// TARGET PENJUALAN
//
// PROGRAM KERJA -> TARGET PENJUALAN
//   - DASHBOARD PROGRAM : tiga dashboard terpisah sesuai jenis
//                         target. Setiap dashboard punya total
//                         target, total realisasi, progress, dan
//                         rincian per karyawan.
//   - HISTORY           : riwayat realisasi LOKAL modul ini,
//                         mencakup tiga jenis penjualan.
//
// SCOPE:
//   STORE          -> hanya tokonya sendiri. Dapat membuat /
//                     mengubah TARGET dan mencatat REALISASI.
//   CENTRAL CABANG -> hanya cabangnya sendiri (read-only).
//   CENTRAL PUSAT  -> wajib memilih SATU cabang (read-only).
//
// Data dimuat melalui server (Admin SDK). Employee hanya dibaca
// langsung (getFirestoreEmployees) untuk akun STORE.
// ============================================================

// ============================================================
// KONSTANTA
// ============================================================

const JENIS_LIST = [
  "ADDITIONAL_SELLING",
  "UPSIZE_BOTOL",
  "SELLING_EKSKLUSIF_PERFUME",
] as const

type PenjualanJenis = (typeof JENIS_LIST)[number]

const UKURAN_BOTOL_LIST = ["55 ML", "100 ML"] as const
const PRODUK_LIST = ["PAX", "FEEL BETTER", "LAINNYA"] as const

type UkuranBotol = (typeof UKURAN_BOTOL_LIST)[number]
type Produk = (typeof PRODUK_LIST)[number]

const JENIS_LABEL: Record<PenjualanJenis, string> = {
  ADDITIONAL_SELLING: "Additional Selling",
  UPSIZE_BOTOL: "Upsize Botol",
  SELLING_EKSKLUSIF_PERFUME: "Selling Eksklusif Perfume",
}

const JENIS_PLURAL: Record<PenjualanJenis, string> = {
  ADDITIONAL_SELLING: "Additional Selling",
  UPSIZE_BOTOL: "Upsize Botol",
  SELLING_EKSKLUSIF_PERFUME: "Perfume",
}

// Satuan nilai per jenis. Additional Selling memakai Rupiah,
// dua jenis lainnya memakai PCS.
const JENIS_UNIT: Record<PenjualanJenis, string> = {
  ADDITIONAL_SELLING: "Rupiah",
  UPSIZE_BOTOL: "Botol",
  SELLING_EKSKLUSIF_PERFUME: "Parfum",
}

const JENIS_ICON: Record<
  PenjualanJenis,
  React.ComponentType<{ className?: string }>
> = {
  ADDITIONAL_SELLING: HandCoins,
  UPSIZE_BOTOL: Package,
  SELLING_EKSKLUSIF_PERFUME: Sparkles,
}

// ============================================================
// TEMA WARNA
//
// Hanya memakai token yang sudah ada di aplikasi sehingga tetap
// harmonis dan tidak mengubah tema global. Nuansa "neon" diciptakan
// lewat ring tipis, glow lembut, dan transisi hover.
// ============================================================

type Tone = {
  chip: string
  text: string
  soft: string
  bar: string
  barGlow: string
  card: string
  icon: string
  track: string
  dot: string
}

const TONE: Record<PenjualanJenis, Tone> = {
  ADDITIONAL_SELLING: {
    chip: "bg-status-pagi-bg text-status-pagi ring-1 ring-inset ring-status-pagi/25",
    text: "text-status-pagi",
    soft: "bg-status-pagi-bg",
    bar: "bg-gradient-to-r from-status-pagi via-status-pagi/45 to-transparent",
    barGlow: "shadow-[0_0_16px_-2px] shadow-status-pagi/45",
    card: "ring-1 ring-inset ring-status-pagi/20 transition-all duration-200 hover:ring-status-pagi/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-status-pagi/45",
    icon: "ring-1 ring-inset ring-status-pagi/25 shadow-[0_0_20px_-6px] shadow-status-pagi/50",
    track: "bg-status-pagi",
    dot: "bg-status-pagi",
  },
  UPSIZE_BOTOL: {
    chip: "bg-status-siang-bg text-status-siang ring-1 ring-inset ring-status-siang/25",
    text: "text-status-siang",
    soft: "bg-status-siang-bg",
    bar: "bg-gradient-to-r from-status-siang via-status-siang/45 to-transparent",
    barGlow: "shadow-[0_0_16px_-2px] shadow-status-siang/45",
    card: "ring-1 ring-inset ring-status-siang/20 transition-all duration-200 hover:ring-status-siang/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-status-siang/45",
    icon: "ring-1 ring-inset ring-status-siang/25 shadow-[0_0_20px_-6px] shadow-status-siang/50",
    track: "bg-status-siang",
    dot: "bg-status-siang",
  },
  SELLING_EKSKLUSIF_PERFUME: {
    chip: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/25",
    text: "text-primary",
    soft: "bg-primary/10",
    bar: "bg-gradient-to-r from-primary via-primary/45 to-transparent",
    barGlow: "shadow-[0_0_16px_-2px] shadow-primary/40",
    card: "ring-1 ring-inset ring-primary/20 transition-all duration-200 hover:ring-primary/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-primary/40",
    icon: "ring-1 ring-inset ring-primary/25 shadow-[0_0_20px_-6px] shadow-primary/45",
    track: "bg-primary",
    dot: "bg-primary",
  },
}

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
  jenis: PenjualanJenis
  nominal: number
  pcs: number
  ukuranBotol: string
  produk: string
  namaProdukLain: string
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
  jenis: PenjualanJenis
  targetNominal: number
  targetPcs: number
}

export type AddSellPerEmployee = {
  employeeId: string
  employeeName: string
  hasTarget: boolean
  target: number
  achievement: number
  progress: number
}

export type AddSellJenisSummary = {
  totalTarget: number
  totalAchievement: number
  progress: number
  totalEmployees: number
  employeesWithoutTarget: number
  perEmployee: AddSellPerEmployee[]
}

export type AddSellSummary = {
  byJenis: Partial<Record<PenjualanJenis, AddSellJenisSummary>>
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

type TabKey = "dashboard" | "history"

const EMPTY_JENIS_SUMMARY: AddSellJenisSummary = {
  totalTarget: 0,
  totalAchievement: 0,
  progress: 0,
  totalEmployees: 0,
  employeesWithoutTarget: 0,
  perEmployee: [],
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

function formatRupiah(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  return `Rp${safe.toLocaleString("id-ID")}`
}

function formatTanggal(tanggal: string): string {
  const [year, month, day] = tanggal.split("-").map(Number)
  if (!year || !month || !day) {
    return tanggal
  }
  return tanggalFormatter.format(new Date(year, month - 1, day))
}

function toDigitsOnly(value: string, max = 12): string {
  return value.replace(/\D/g, "").slice(0, max)
}

// Nilai penjualan ditampilkan sesuai satuan jenisnya.
function formatNilai(
  jenis: PenjualanJenis,
  value: number,
): string {
  const safe = Number.isFinite(value) ? value : 0
  return jenis === "ADDITIONAL_SELLING"
    ? formatRupiah(safe)
    : `${safe.toLocaleString("id-ID")} PCS`
}

function nilaiFromRow(
  txn: Pick<AddSellTransaction, "jenis" | "nominal" | "pcs">,
): number {
  return txn.jenis === "ADDITIONAL_SELLING"
    ? Number(txn.nominal) || 0
    : Number(txn.pcs) || 0
}

function targetFromRow(
  row: Pick<AddSellTarget, "jenis" | "targetNominal" | "targetPcs">,
): number {
  return row.jenis === "ADDITIONAL_SELLING"
    ? Number(row.targetNominal) || 0
    : Number(row.targetPcs) || 0
}

// Detail realise per jenis untuk tabel History.
function detailRealisasi(
  txn: AddSellTransaction,
): string {
  if (txn.jenis === "UPSIZE_BOTOL") {
    return txn.ukuranBotol || "-"
  }

  if (txn.jenis === "SELLING_EKSKLUSIF_PERFUME") {
    return txn.produk === "LAINNYA"
      ? txn.namaProdukLain || "-"
      : txn.produk || "-"
  }

  return "-"
}

// Format input nominal dengan titik ribuan. Target nol tetap
// ditampilkan sebagai "0" karena target nol tetap sah.
function formatNominalInput(
  digits: string,
  keepZero = false,
): string {
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

  const monthLabel = monthFormatter
    .format(new Date(period.year, period.month, 1))
    .toUpperCase()

  // ----------------------------------------------------------
  // TAB
  // ----------------------------------------------------------

  const [tab, setTab] = React.useState<TabKey>("dashboard")

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
          throw new Error("Data penjualan tidak dapat dimuat.")
        }

        const result = (await response.json()) as AddSellGetResponse

        if (cancelled || seq !== requestSeqRef.current) return

        setData({
          periode: String(result.periode ?? periode),
          transactions: Array.isArray(result.transactions)
            ? result.transactions
            : [],
          targets: Array.isArray(result.targets) ? result.targets : [],
          summary: result.summary ?? { byJenis: {} },
        })
      } catch (loadError) {
        console.error("Gagal memuat penjualan:", loadError)
        if (!cancelled) {
          setError(
            "Data penjualan belum dapat dimuat. Silakan coba lagi.",
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
    reloadKey,
    isCentralPusat,
    pusatLocked,
    periode,
  ])

  // ----------------------------------------------------------
  // EMPLOYEES (khusus STORE) — untuk form & target
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

  const summaryByJenis = data?.summary?.byJenis ?? {}

  function summaryOf(jenis: PenjualanJenis): AddSellJenisSummary {
    return summaryByJenis[jenis] ?? EMPTY_JENIS_SUMMARY
  }

  // ----------------------------------------------------------
  // HISTORY — FILTER LOKAL
  // ----------------------------------------------------------

  const [jenisFilter, setJenisFilter] = React.useState<string>("all")
  const [tanggalFilter, setTanggalFilter] = React.useState("all")
  const [timFilter, setTimFilter] = React.useState("all")

  React.useEffect(() => {
    setJenisFilter("all")
    setTanggalFilter("all")
    setTimFilter("all")
  }, [period.year, period.month, cabangFilter])

  const transactions = data?.transactions ?? []

  const tanggalOptions = React.useMemo(
    () =>
      Array.from(
        new Set(transactions.map((t) => t.tanggal).filter(Boolean)),
      ).sort(),
    [transactions],
  )

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
      transactions
        .filter(
          (t) =>
            (jenisFilter === "all" || t.jenis === jenisFilter) &&
            (tanggalFilter === "all" || t.tanggal === tanggalFilter) &&
            (timFilter === "all" || t.employeeId === timFilter),
        )
        // History lokal: terbaru di atas.
        .sort((a, b) => {
          if (a.tanggal !== b.tanggal) {
            return a.tanggal < b.tanggal ? 1 : -1
          }
          const ca = a.createdAt ?? ""
          const cb = b.createdAt ?? ""
          return ca < cb ? 1 : ca > cb ? -1 : 0
        }),
    [transactions, jenisFilter, tanggalFilter, timFilter],
  )

  // Total per jenis dari baris yang sedang difilter.
  const filteredTotals = React.useMemo(() => {
    const totals: Record<string, number> = {}

    for (const txn of filteredTransactions) {
      totals[txn.jenis] = (totals[txn.jenis] ?? 0) + nilaiFromRow(txn)
    }

    return totals
  }, [filteredTransactions])

  function resetFilters() {
    setJenisFilter("all")
    setTanggalFilter("all")
    setTimFilter("all")
  }

  const hasFilter =
    jenisFilter !== "all" ||
    tanggalFilter !== "all" ||
    timFilter !== "all"

  // ----------------------------------------------------------
  // REALISASI — FORM TAMBAH / EDIT
  // ----------------------------------------------------------

  type FormState = {
    id?: string
    tanggal: string
    employeeId: string
    jenis: PenjualanJenis
    nominal: string
    pcs: string
    ukuranBotol: UkuranBotol
    produk: Produk
    namaProdukLain: string
    keterangan: string
  }

  function emptyFormState(): FormState {
    return {
      tanggal: getLocalDateISO(),
      employeeId: "",
      jenis: "ADDITIONAL_SELLING",
      nominal: "",
      pcs: "",
      ukuranBotol: "55 ML",
      produk: "PAX",
      namaProdukLain: "",
      keterangan: "",
    }
  }

  const [formOpen, setFormOpen] = React.useState(false)
  const [formMode, setFormMode] = React.useState<"add" | "edit">("add")
  const [form, setForm] = React.useState<FormState>(emptyFormState)
  const [formError, setFormError] = React.useState("")
  const [formSaving, setFormSaving] = React.useState(false)

  // Employee tersedia pada tanggal form: aktif, ATAU nonaktif namun
  // tanggal belum melewati tanggalNonaktif.
  const availableEmployees = React.useMemo(() => {
    const employeesAll = isStore ? employees : []
    return employeesAll
      .filter(
        (e) =>
          e.aktif !== false ||
          (typeof e.tanggalNonaktif === "string" &&
            e.tanggalNonaktif >= form.tanggal),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }))
  }, [employees, isStore, form.tanggal])

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
    setForm(emptyFormState())
    setFormError("")
    setFormOpen(true)
  }

  function openEditForm(txn: AddSellTransaction) {
    setFormMode("edit")
    setForm({
      id: txn.id,
      tanggal: txn.tanggal,
      employeeId: txn.employeeId,
      jenis: txn.jenis,
      nominal:
        txn.jenis === "ADDITIONAL_SELLING" && Number(txn.nominal) > 0
          ? String(Number(txn.nominal))
          : "",
      pcs:
        txn.jenis !== "ADDITIONAL_SELLING" && Number(txn.pcs) > 0
          ? String(Number(txn.pcs))
          : "",
      ukuranBotol: (txn.ukuranBotol || "55 ML") as UkuranBotol,
      produk: (txn.produk || "PAX") as Produk,
      namaProdukLain: txn.namaProdukLain ?? "",
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

    const body: Record<string, unknown> = {
      tanggal: form.tanggal,
      employeeId: form.employeeId,
      jenis: form.jenis,
      keterangan: form.keterangan.trim(),
    }

    if (form.jenis === "ADDITIONAL_SELLING") {
      const nominal = Number(toDigitsOnly(form.nominal, 12))

      if (!Number.isInteger(nominal) || nominal <= 0) {
        setFormError(
          "Nilai Additional Selling harus berupa bilangan bulat Rupiah yang valid.",
        )
        return
      }

      body.nominal = nominal
    } else {
      const pcs = Number(toDigitsOnly(form.pcs, 7))

      if (!Number.isInteger(pcs) || pcs <= 0) {
        setFormError(
          "Jumlah PCS harus berupa bilangan bulat positif yang valid.",
        )
        return
      }

      body.pcs = pcs

      if (form.jenis === "UPSIZE_BOTOL") {
        body.ukuranBotol = form.ukuranBotol
      } else {
        if (form.produk === "LAINNYA" && !form.namaProdukLain.trim()) {
          setFormError(
            "Nama produk wajib diisi ketika produk LAINNYA dipilih.",
          )
          return
        }

        body.produk = form.produk
        body.namaProdukLain =
          form.produk === "LAINNYA" ? form.namaProdukLain.trim() : ""
      }
    }

    if (!user) {
      setFormError("Anda harus login terlebih dahulu.")
      return
    }

    setFormSaving(true)

    try {
      const idToken = await user.getIdToken()
      const isEdit = formMode === "edit"

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
              ? "Realisasi gagal diperbarui."
              : "Realisasi gagal disimpan."),
        )
      }

      setFormOpen(false)

      showToast(
        "success",
        isEdit ? "Realisasi diperbarui" : "Realisasi tersimpan",
        result.message,
      )

      setReloadKey((current) => current + 1)
    } catch (submitError) {
      console.error("Gagal menyimpan realisasi:", submitError)
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Realisasi gagal disimpan.",
      )
    } finally {
      setFormSaving(false)
    }
  }

  // ----------------------------------------------------------
  // REALISASI — HAPUS (konfirmasi)
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
        throw new Error(result?.message ?? "Realisasi gagal dihapus.")
      }

      setPendingDelete(null)

      showToast("success", "Realisasi dihapus", result.message)

      setReloadKey((current) => current + 1)
    } catch (deleteError) {
      console.error("Gagal menghapus realisasi:", deleteError)
      showToast(
        "error",
        "Gagal menghapus",
        deleteError instanceof Error ? deleteError.message : undefined,
      )
    } finally {
      setDeleting(false)
    }
  }

  // ----------------------------------------------------------
  // TARGET — ATUR PAKET 3 JENIS (khusus STORE)
  //
  // Tiga jenis target dianggap SATU PAKET per employee + periode.
  // Ketiganya wajib diisi sebelum dapat disimpan, sehingga tidak
  // pernah ada target parsial.
  //
  // Draft disimpan per JENIS (bukan per employee+jenis gabung)
  // dan SELALU diturunkan ulang dari data server setiap kali
  // employee berganti. Ini mencegah nilai jenis lama "bocor" ke
  // jenis berikutnya.
  // ----------------------------------------------------------

  const EMPTY_TARGET_DRAFTS: Record<PenjualanJenis, string> = {
    ADDITIONAL_SELLING: "",
    UPSIZE_BOTOL: "",
    SELLING_EKSKLUSIF_PERFUME: "",
  }

  const [targetOpen, setTargetOpen] = React.useState(false)
  const [targetEmployeeId, setTargetEmployeeId] = React.useState("")
  const [targetMode, setTargetMode] = React.useState<"edit" | "view">(
    "edit",
  )
  const [targetDrafts, setTargetDrafts] = React.useState<
    Record<PenjualanJenis, string>
  >(EMPTY_TARGET_DRAFTS)
  const [targetInvalid, setTargetInvalid] =
    React.useState<PenjualanJenis | null>(null)
  const [targetError, setTargetError] = React.useState("")
  const [savingTargets, setSavingTargets] = React.useState(false)
  const [deletingTargets, setDeletingTargets] = React.useState(false)

  // Target employee terpilih pada periode aktif, semua jenis.
  const targetPackage = React.useMemo(() => {
    const map: Partial<Record<PenjualanJenis, number>> = {}

    for (const t of data?.targets ?? []) {
      if (!t.employeeId) continue
      if (t.employeeId !== targetEmployeeId) continue
      map[t.jenis] = targetFromRow(t)
    }

    return map
  }, [data?.targets, targetEmployeeId])

  // Paket dianggap lengkap hanya bila KETIGA jenis punya target.
  const targetComplete = React.useMemo(
    () => JENIS_LIST.every((j) => targetPackage[j] != null),
    [targetPackage],
  )

  // Baris employee: employee AKTIF toko + employee yang sudah
  // punya target di periode ini (mis. sudah nonaktif).
  const targetRows = React.useMemo(() => {
    const map = new Map<string, string>()

    for (const e of employees) {
      if (e.aktif === false) continue
      map.set(e.id, e.name)
    }

    for (const t of data?.targets ?? []) {
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
  }, [employees, data?.targets])

  // Muat ulang draft dari server setiap employee berganti. Draft
  // lama DIBUANGtotal (bukan digabung), sehingga tidak mungkin
  // ada nilai jenis sebelumnya yang ikut tersimpan.
  React.useEffect(() => {
    if (!targetOpen) return

    const next: Record<PenjualanJenis, string> = {
      ...EMPTY_TARGET_DRAFTS,
    }

    for (const jenis of JENIS_LIST) {
      const value = targetPackage[jenis]
      next[jenis] = value != null ? String(value) : ""
    }

    setTargetDrafts(next)
    setTargetInvalid(null)
    setTargetError("")
    setTargetMode(
      JENIS_LIST.every((j) => targetPackage[j] != null)
        ? "view"
        : "edit",
    )
  }, [targetOpen, targetEmployeeId, targetPackage])

  // Satu-satunya pintu masuk modal target: satu tombol "Buat
  // Target" di header. Employee selalu dipilih dari "Nama Tim"
  // di dalam modal.
  function openTargetForm() {
    setTargetEmployeeId("")
    setTargetError("")
    setTargetInvalid(null)
    setTargetOpen(true)
  }

  function changeTargetEmployee(next: string) {
    setTargetEmployeeId(next)
    setTargetInvalid(null)
    setTargetError("")
  }

  function setTargetDraft(
    jenis: PenjualanJenis,
    value: string,
  ) {
    setTargetDrafts((current) => ({
      ...current,
      [jenis]: toDigitsOnly(value, 12),
    }))
  }

  async function handleSaveTargets() {
    if (!user || !isStore) return

    if (!targetEmployeeId) {
      setTargetError("Pilih Tim terlebih dahulu.")
      return
    }

    // Ketiga jenis WAJIB terisi. Tidak ada target parsial.
    const targets: {
      employeeId: string
      jenis: PenjualanJenis
      nilaiTarget: number
    }[] = []

    for (const jenis of JENIS_LIST) {
      const draft = toDigitsOnly(
        targetDrafts[jenis] ?? "",
        12,
      )

      if (draft === "") {
        setTargetInvalid(jenis)
        setTargetError(
          `Target ${JENIS_LABEL[jenis]} wajib diisi. Ketiga jenis target harus lengkap.`,
        )
        return
      }

      const value = Number(draft)

      if (
        !Number.isInteger(value) ||
        value < 0 ||
        value >= 1_000_000_000_000
      ) {
        setTargetInvalid(jenis)
        setTargetError(
          jenis === "ADDITIONAL_SELLING"
            ? "Nilai target Additional Selling harus berupa bilangan bulat Rupiah yang valid."
            : `Nilai target ${JENIS_LABEL[jenis]} harus berupa bilangan bulat PCS yang valid.`,
        )
        return
      }

      targets.push({
        employeeId: targetEmployeeId,
        jenis,
        nilaiTarget: value,
      })
    }

    setTargetInvalid(null)
    setTargetError("")
    setSavingTargets(true)

    try {
      const idToken = await user.getIdToken()

      const response = await fetch("/api/additional-selling/target", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ periode, targets }),
      })

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(result?.message ?? "Target gagal disimpan.")
      }

      // Modal SENGAJA TIDAK ditutup setelah save berhasil.
      // Employee terpilih tetap sama, data di-refresh lewat
      // reloadKey, dan effect akan memuat nilai tersimpan +
      // mode "view" (tombol Hapus/Edit). Store bisa langsung
      // memilih employee berikutnya tanpa menutup modal.
      setTargetInvalid(null)
      setTargetError("")

      showToast(
        "success",
        "Target tersimpan",
        result.message,
      )

      setReloadKey((current) => current + 1)
    } catch (saveError) {
      console.error("Gagal menyimpan target:", saveError)
      setTargetError(
        saveError instanceof Error
          ? saveError.message
          : "Target gagal disimpan.",
      )
    } finally {
      setSavingTargets(false)
    }
  }

  // Hapus paket target employee + periode (3 jenis). Transaksi
  // realisasi pada "additional_selling" TIDAK tersentuh.
  async function handleDeleteTargets() {
    if (!user || !isStore || !targetEmployeeId) return

    setTargetError("")
    setDeletingTargets(true)

    try {
      const idToken = await user.getIdToken()

      const response = await fetch(
        "/api/additional-selling/target",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            periode,
            employeeId: targetEmployeeId,
          }),
        },
      )

      const result = (await response.json()) as {
        success?: boolean
        message?: string
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result?.message ?? "Target gagal dihapus.",
        )
      }

      setTargetMode("edit")
      setTargetInvalid(null)

      showToast(
        "success",
        "Target dihapus",
        result.message,
      )

      setReloadKey((current) => current + 1)
    } catch (deleteError) {
      console.error(
        "Gagal menghapus target:",
        deleteError,
      )
      setTargetError(
        deleteError instanceof Error
          ? deleteError.message
          : "Target gagal dihapus.",
      )
    } finally {
      setDeletingTargets(false)
    }
  }

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  const storeName = profile?.namaStore || profile?.storeId || "CABANG"

  return (
    <div className="space-y-5">
      {/* ============================================ */}
      {/* HEADER                                       */}
      {/* ============================================ */}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-xl",
                  TONE.ADDITIONAL_SELLING.soft,
                  TONE.ADDITIONAL_SELLING.text,
                  "ring-1 ring-inset ring-status-pagi/30",
                  "shadow-[0_0_18px_-4px] shadow-status-pagi/45",
                )}
              >
                <Target className="size-5" />
              </span>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">
                  Target Penjualan
                </h1>
                <p className="text-xs text-muted-foreground">
                  Program Kerja · {storeName}
                </p>
              </div>
            </div>
          </div>

          {isStore && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => openTargetForm()}
                className={cn(
                  "gap-1.5",
                  "ring-1 ring-inset ring-status-pagi/30",
                  "shadow-[0_0_16px_-6px] shadow-status-pagi/50",
                  "transition-all duration-200",
                  "hover:ring-status-pagi/60",
                  "hover:shadow-[0_0_20px_-4px] hover:shadow-status-pagi/60",
                )}
              >
                <Target className="size-4" />
                Buat Target
              </Button>

              <Button
                type="button"
                onClick={openAddForm}
                className={cn(
                  "gap-1.5",
                  "ring-1 ring-inset ring-primary/30",
                  "shadow-[0_0_16px_-6px] shadow-primary/50",
                  "transition-all duration-200",
                  "hover:ring-primary/60",
                  "hover:shadow-[0_0_20px_-4px] hover:shadow-primary/60",
                )}
              >
                <Plus className="size-4" />
                Catat Penjualan
              </Button>
            </div>
          )}
        </div>

        {/* FILTER PERIODE + CABANG */}
        <div className="flex flex-wrap items-center gap-3">
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

          {isCentralPusat && (
            <div className="min-w-[200px]">
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
          )}

          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "dashboard", label: "Dashboard Program" },
              { value: "history", label: "History" },
            ]}
          />
        </div>
      </div>

      {/* ============================================ */}
      {/* CENTRAL PUSAT — CABANG BELUM DIPILIH        */}
      {/* ============================================ */}

      {pusatLocked && (
        <EmptyState
          title="Pilih cabang terlebih dahulu"
          description="Central Pusat wajib memilih satu cabang sebelum melihat data target penjualan."
        />
      )}

      {/* ============================================ */}
      {/* TAB: DASHBOARD PROGRAM                       */}
      {/* ============================================ */}

      {!pusatLocked && tab === "dashboard" && (
        <>
          {loading && <LoadingState label="Memuat dashboard..." />}

          {!loading && error && (
            <EmptyState title={error} description="Silakan muat ulang halaman." />
          )}

          {!loading && !error && (
            <div className="space-y-5">
              {JENIS_LIST.map((jenis) => (
                <JenisSection
                  key={jenis}
                  jenis={jenis}
                  summary={summaryOf(jenis)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================================ */}
      {/* TAB: HISTORY (LOKAL MODUL INI)               */}
      {/* ============================================ */}

      {!pusatLocked && tab === "history" && (
        <>
          {loading && <LoadingState label="Memuat history..." />}

          {!loading && error && (
            <EmptyState title={error} description="Silakan muat ulang halaman." />
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
                    ...JENIS_LIST.map((j) => ({
                      value: j,
                      label: JENIS_LABEL[j],
                    })),
                  ]}
                />

                <SelectField
                  value={tanggalFilter}
                  onChange={setTanggalFilter}
                  options={[
                    { value: "all", label: "Semua Tanggal" },
                    ...[...tanggalOptions].reverse().map((d) => ({
                      value: d,
                      label: formatTanggal(d),
                    })),
                  ]}
                />

                <SelectField
                  value={timFilter}
                  onChange={setTimFilter}
                  options={[
                    { value: "all", label: "Semua Tim" },
                    ...timOptions.map((o) => ({
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

              {/* TOTAL PER JENIS */}
              {hasFilter && (
                <div className="grid gap-3 sm:grid-cols-3">
                  {JENIS_LIST.map((jenis) => {
                    const tone = TONE[jenis]
                    const Icon = JENIS_ICON[jenis]
                    const value = filteredTotals[jenis] ?? 0

                    return (
                      <div
                        key={jenis}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border border-border bg-card p-3",
                          tone.card,
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-lg",
                            tone.soft,
                            tone.text,
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs text-muted-foreground">
                            {JENIS_PLURAL[jenis]}
                          </p>
                          <p className="truncate text-sm font-semibold tabular-nums">
                            {formatNilai(jenis, value)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* TABEL */}
              {filteredTransactions.length === 0 ? (
                <EmptyState
                  title={
                    hasFilter
                      ? "Tidak ada data sesuai filter"
                      : "Belum ada realisasi"
                  }
                  description={
                    hasFilter
                      ? "Coba ubah atau reset filter yang aktif."
                      : isStore
                        ? "Catat penjualan pertama melalui tombol Catat Penjualan."
                        : "Belum ada realisasi penjualan pada periode ini."
                  }
                  icon={HandCoins}
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-3 font-medium">Tanggal</th>
                          <th className="px-3 py-3 font-medium">Toko</th>
                          <th className="px-3 py-3 font-medium">Tim</th>
                          <th className="px-3 py-3 font-medium">Jenis</th>
                          <th className="px-3 py-3 font-medium">Detail</th>
                          <th className="px-3 py-3 text-right font-medium">
                            Nilai
                          </th>
                          <th className="px-3 py-3 text-right font-medium">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((txn) => {
                          const tone = TONE[txn.jenis]
                          const Icon = JENIS_ICON[txn.jenis]
                          const canAct =
                            isStore &&
                            txn.storeId === profile?.storeId

                          return (
                            <tr
                              key={txn.id}
                              className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                            >
                              <td className="whitespace-nowrap px-3 py-3">
                                {formatTanggal(txn.tanggal)}
                              </td>
                              <td className="px-3 py-3">
                                {txn.storeName || "-"}
                              </td>
                              <td className="px-3 py-3">
                                {txn.employeeName || "-"}
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                                    tone.chip,
                                  )}
                                >
                                  <Icon className="size-3.5" />
                                  {JENIS_LABEL[txn.jenis]}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-muted-foreground">
                                {detailRealisasi(txn)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums">
                                {formatNilai(
                                  txn.jenis,
                                  nilaiFromRow(txn),
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  {canAct && (
                                    <>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() =>
                                          openEditForm(txn)
                                        }
                                        aria-label="Ubah realisasi"
                                      >
                                        <PenLine className="size-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() =>
                                          setPendingDelete(txn)
                                        }
                                        className="text-destructive hover:bg-destructive/10"
                                        aria-label="Hapus realisasi"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
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
      {/* MODAL: ATUR TARGET (PAKET 3 JENIS)           */}
      {/* ============================================ */}

      <Modal
        open={targetOpen && isStore}
        onClose={() => setTargetOpen(false)}
        title="Atur Target Penjualan"
        description={`Periode ${monthLabel}. Ketiga jenis target wajib diisi sebagai satu paket.`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTargetOpen(false)}
              disabled={savingTargets || deletingTargets}
            >
              Tutup
            </Button>

            {targetComplete ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteTargets}
                  disabled={deletingTargets || savingTargets}
                >
                  {deletingTargets
                    ? "Menghapus..."
                    : "Hapus Target"}
                </Button>

                {/* Mode edit menampilkan SIMPAN, bukan Edit
                    Target, agar hasil edit bisa disimpan tanpa
                    harus menutup modal. */}
                {targetMode === "edit" ? (
                  <Button
                    type="button"
                    onClick={handleSaveTargets}
                    disabled={
                      savingTargets || deletingTargets
                    }
                    className={cn(
                      TONE.ADDITIONAL_SELLING.card,
                      "ring-1 ring-inset",
                    )}
                  >
                    {savingTargets
                      ? "Menyimpan..."
                      : "Simpan Target"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => {
                      setTargetMode("edit")
                      setTargetError("")
                      setTargetInvalid(null)
                    }}
                    disabled={deletingTargets || savingTargets}
                  >
                    Edit Target
                  </Button>
                )}
              </>
            ) : (
              <Button
                type="button"
                onClick={handleSaveTargets}
                disabled={
                  savingTargets ||
                  deletingTargets ||
                  !targetEmployeeId
                }
                className={cn(
                  TONE.ADDITIONAL_SELLING.card,
                  "ring-1 ring-inset",
                )}
              >
                {savingTargets
                  ? "Menyimpan..."
                  : "Simpan Target"}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {/* PILIH TIM */}
          <Field label="Nama Tim">
            <SelectField
              value={targetEmployeeId}
              onChange={changeTargetEmployee}
              options={[
                { value: "", label: "Pilih Tim" },
                ...targetRows.map((row) => ({
                  value: row.employeeId,
                  label: row.employeeName,
                })),
              ]}
            />
          </Field>

          {/* STATUS PAKET */}
          {targetEmployeeId && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium",
                targetComplete
                  ? "border-status-pagi/30 bg-status-pagi-bg text-status-pagi"
                  : "border-border bg-muted/50 text-muted-foreground",
              )}
            >
              {targetComplete
                ? "Paket target 3 jenis tersimpan. Realisasi tidak terpengaruh bila target dihapus."
                : "Paket target belum lengkap. Isi ketiga jenis agar dapat disimpan."}
            </div>
          )}

          {/* TIGA JENIS TARGET */}
          {targetRows.length === 0 ? (
            <EmptyState
              title="Belum ada karyawan"
              description="Tidak ada karyawan aktif pada toko ini."
            />
          ) : (
            <div className="space-y-2">
              {JENIS_LIST.map((jenis) => {
                const tone = TONE[jenis]
                const Icon = JENIS_ICON[jenis]
                const draft = targetDrafts[jenis] ?? ""
                const invalid = targetInvalid === jenis
                const readOnly = targetMode === "view"
                const isRupiah =
                  jenis === "ADDITIONAL_SELLING"

                return (
                  <div key={jenis}>
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2",
                        invalid
                          ? "border-destructive/60"
                          : "border-border",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-md",
                          tone.soft,
                          tone.text,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {JENIS_LABEL[jenis]}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {draft === ""
                            ? "Belum ada target"
                            : formatNilai(jenis, Number(draft))}
                        </p>
                      </div>

                      {/* Input + satuan.
                          "Rp" (Additional Selling) dan "PCS" (dua
                          jenis lain) adalah adornment visual di luar
                          <input>, jadi TIDAK PERNAH ikut masuk ke
                          state draft maupun payload API. Nilai yang
                          dikirim tetap NUMBER murni.

                          Additional Selling memakai formatNominalInput
                          untuk HANYA tampilan: state tetap digit
                          murni karena setTargetDraft selalu
                          toDigitsOnly() (titik dibuang). Jadi
                          tampil "1.000.000" -> state "1000000"
                          -> payload 1000000. keepZero=true supaya
                          target 0 tetap tampil "0" dan tetap
                          berbeda dari "belum ada target". */}
                      <div className="flex shrink-0 items-center gap-1">
                        {isRupiah && (
                          <span
                            className={cn(
                              "select-none text-xs font-semibold",
                              readOnly
                                ? "text-muted-foreground/70"
                                : "text-muted-foreground",
                            )}
                          >
                            Rp
                          </span>
                        )}

                        <input
                          type="text"
                          inputMode="numeric"
                          readOnly={readOnly}
                          value={
                            isRupiah
                              ? formatNominalInput(
                                  draft,
                                  true,
                                )
                              : draft
                          }
                          onChange={(e) =>
                            setTargetDraft(
                              jenis,
                              e.target.value,
                            )
                          }
                          placeholder="0"
                          aria-label={`Target ${JENIS_LABEL[jenis]}`}
                          className={cn(
                            "h-8 w-28 rounded-md border bg-background px-2.5 text-right text-sm tabular-nums outline-none transition-all",
                            "focus:border-primary focus:ring-2 focus:ring-primary/25",
                            readOnly
                              ? "border-border opacity-70"
                              : invalid
                                ? "border-destructive/60"
                                : "border-border",
                          )}
                        />

                        {!isRupiah && (
                          <span
                            className={cn(
                              "select-none text-xs font-semibold",
                              readOnly
                                ? "text-muted-foreground/70"
                                : "text-muted-foreground",
                            )}
                          >
                            PCS
                          </span>
                        )}
                      </div>
                    </div>

                    {invalid && (
                      <p className="mt-1 pl-1 text-[11px] font-medium text-destructive">
                        Wajib diisi.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {targetError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {targetError}
            </p>
          )}
        </div>
      </Modal>

      {/* ============================================ */}
      {/* MODAL: CATAT / UBAH REALISASI                */}
      {/* ============================================ */}

      <Modal
        open={formOpen && isStore}
        onClose={() => setFormOpen(false)}
        title={
          formMode === "edit" ? "Ubah Realisasi" : "Catat Penjualan"
        }
        description={`Periode ${monthLabel}. Realisasi dapat dicatat tanpa target.`}
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
              form="realisasi-form"
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
          id="realisasi-form"
          onSubmit={handleSubmitForm}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
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
                  setForm((current) => ({
                    ...current,
                    employeeId: v,
                  }))
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
          </div>

          <Field label="Jenis Penjualan">
            <SelectField
              value={form.jenis}
              onChange={(v) =>
                setForm((current) => ({
                  ...current,
                  jenis: v as PenjualanJenis,
                }))
              }
              options={JENIS_LIST.map((j) => ({
                value: j,
                label: JENIS_LABEL[j],
              }))}
            />
          </Field>

          {form.jenis === "ADDITIONAL_SELLING" ? (
            <Field label="Nilai Additional Selling (Rp)">
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
                placeholder="Contoh: 150000"
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </Field>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Jumlah PCS">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.pcs}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        pcs: toDigitsOnly(e.target.value, 7),
                      }))
                    }
                    placeholder="Contoh: 12"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm tabular-nums outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                </Field>

                {form.jenis === "UPSIZE_BOTOL" && (
                  <Field label="Ukuran Botol">
                    <SelectField
                      value={form.ukuranBotol}
                      onChange={(v) =>
                        setForm((current) => ({
                          ...current,
                          ukuranBotol: v as UkuranBotol,
                        }))
                      }
                      options={UKURAN_BOTOL_LIST.map((u) => ({
                        value: u,
                        label: u,
                      }))}
                    />
                  </Field>
                )}

                {form.jenis === "SELLING_EKSKLUSIF_PERFUME" && (
                  <Field label="Produk">
                    <SelectField
                      value={form.produk}
                      onChange={(v) =>
                        setForm((current) => ({
                          ...current,
                          produk: v as Produk,
                        }))
                      }
                      options={PRODUK_LIST.map((p) => ({
                        value: p,
                        label: p,
                      }))}
                    />
                  </Field>
                )}
              </div>

              {form.jenis === "SELLING_EKSKLUSIF_PERFUME" &&
                form.produk === "LAINNYA" && (
                  <Field label="Nama Produk Lainnya">
                    <input
                      type="text"
                      value={form.namaProdukLain}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          namaProdukLain: e.target.value,
                        }))
                      }
                      placeholder="Tuliskan nama produk"
                      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/25"
                    />
                  </Field>
                )}
            </>
          )}

          <Field label="Keterangan (opsional)">
            <textarea
              value={form.keterangan}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  keterangan: e.target.value,
                }))
              }
              rows={3}
              maxLength={500}
              placeholder="Catatan tambahan"
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </Field>

          {formError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {formError}
            </p>
          )}
        </form>
      </Modal>

      {/* ============================================ */}
      {/* MODAL: KONFIRMASI HAPUS                     */}
      {/* ============================================ */}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Hapus realisasi?"
        description="Data realisasi yang dihapus tidak dapat dikembalikan."
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
              {JENIS_LABEL[pendingDelete.jenis]} ·{" "}
              {formatNilai(pendingDelete.jenis, nilaiFromRow(pendingDelete))}
            </p>
            <p className="text-muted-foreground">
              {formatTanggal(pendingDelete.tanggal)} ·{" "}
              {pendingDelete.employeeName} ·{" "}
              {pendingDelete.storeName}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ============================================================
// DASHBOARD PER JENIS
// ============================================================

function JenisSection({
  jenis,
  summary,
}: {
  jenis: PenjualanJenis
  summary: AddSellJenisSummary
}) {
  const tone = TONE[jenis]
  const Icon = JENIS_ICON[jenis]

  return (
    <Card
      className={cn(
        "overflow-hidden",
        tone.card,
        "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
      )}
    >
      {/* HEADER + NEON BAR */}
      <div className="relative">
        <div
          className={cn(
            "h-1 w-full",
            tone.bar,
            tone.barGlow,
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-xl",
                tone.soft,
                tone.text,
                tone.icon,
              )}
            >
              <Icon className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                {JENIS_LABEL[jenis]}
              </h2>
              <p className="text-xs text-muted-foreground">
                Satuan: {JENIS_UNIT[jenis]}
              </p>
            </div>
          </div>
        </div>
      </div>

      <CardContent className="space-y-4 pt-0">
        {/* STAT CARDS */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Target"
            value={formatNilai(jenis, summary.totalTarget)}
            tone={tone}
            icon={Target}
          />
          <StatCard
            label="Total Realisasi"
            value={formatNilai(jenis, summary.totalAchievement)}
            tone={tone}
            icon={TrendingUp}
          />

          <div
            className={cn(
              "rounded-xl border border-border bg-background p-3",
              tone.card,
            )}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className={cn("size-3.5", tone.text)} />
              Progress Keseluruhan
            </div>
            <p
              className={cn(
                "mt-1.5 text-xl font-semibold tabular-nums",
                summary.progress > 0 ? tone.text : "text-muted-foreground",
              )}
            >
              {summary.totalTarget > 0 ? `${summary.progress}%` : "-"}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  tone.track,
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, summary.progress))}%`,
                }}
              />
            </div>
          </div>

          <div
            className={cn(
              "rounded-xl border border-border bg-background p-3",
              tone.card,
            )}
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", tone.dot)} />
              Karyawan
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums">
              {summary.totalEmployees}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {summary.employeesWithoutTarget > 0
                ? `${summary.employeesWithoutTarget} belum ada target`
                : "Semua sudah ada target"}
            </p>
          </div>
        </div>

        {/* RINCIAN PER KARYAWAN */}
        {summary.perEmployee.length === 0 ? (
          <EmptyState
            title="Belum ada data"
            description="Belum ada target maupun realisasi pada periode ini."
            icon={Icon}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Nama Tim</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Target
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Realisasi
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Progress
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.perEmployee.map((row) => (
                    <tr
                      key={`${jenis}-${row.employeeId}`}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        {row.employeeName}
                      </td>

                      {!row.hasTarget ? (
                        // Target belum dibuat. Capaian dan progress
                        // sengaja disembunyikan agar tidak disalahartikan
                        // sebagai pencapaian nol.
                        <td colSpan={3} className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className="border-dashed text-muted-foreground"
                          >
                            Target belum dibuat
                          </Badge>
                        </td>
                      ) : (
                        <>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            {formatNilai(jenis, row.target)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                            {formatNilai(jenis, row.achievement)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width] duration-500",
                                    tone.track,
                                  )}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(0, row.progress),
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={cn(
                                  "w-14 text-right text-xs font-semibold tabular-nums",
                                  row.progress > 0
                                    ? tone.text
                                    : "text-muted-foreground",
                                )}
                              >
                                {row.progress}%
                              </span>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: Tone
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background p-3",
        tone.card,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={cn("size-3.5", tone.text)} />
        {label}
      </div>
      <p className="mt-1.5 truncate text-xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  )
}
