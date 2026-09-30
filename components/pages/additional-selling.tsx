"use client"

import * as React from "react"
import {
  ArrowLeft,
  BarChart3,
  ChartPie,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Layers,
  Package,
  PenLine,
  Plus,
  Sparkles,
  Store,
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
import { AdditionalSellingNotes } from "@/components/additional-selling-notes"
import { getFirestoreEmployees } from "@/lib/firestore-data"
import type {
  FirestoreEmployee,
} from "@/lib/firestore-data"

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

// "fill" dipakai untuk bar DATA (nilai target/realisasi/progress)
// sehingga isinya memakai gradient, sementara "track" dipakai untuk
// bar kecil yang lebih baik tetap solid supaya tidak ramai.
// Dua slot dipisahkan supaya setiap jenis tidak memakai warna yang
// sama untuk dua dimensi yang berbeda.
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
  fill: string
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
    fill: "bg-gradient-to-r from-status-pagi to-green-400",
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
    fill: "bg-gradient-to-r from-status-siang to-blue-400",
  },

  // ------------------------------------------------------------
  // TONE KHUSUS SELLING EKSKLUSIF PERFUME
  //
  // Audit Phase 3 menemukan tone jenis ini memakai token
  // "primary". Pada dark mode token primary berubah menjadi
  // putih, sehingga identitas warna jenis ketiga ikut hilang
  // menjadi putih.
  //
  // Perbaikan dilakukan SECARA LOKAL di file ini saja:
  //   - globals.css TIDAK disentuh
  //   - token global TIDAK ditambah / diubah
  //   - tidak memakai varian "dark:" karena aplikasi bisa juga
  //     gelap lewat prefers-color-scheme tanpa kelas .dark
  //
  // Warna memakai palette bawaan Tailwind (fuchsia) yang nilainya
  // sama pada light dan dark, sehingga tone ini tetap hidup di
  // kedua tema. Magenta dipilih karena jaraknya jauh dari hijau
  // (ADDITIONAL SELLING) dan biru (UPSIZE BOTOL).
  // ------------------------------------------------------------
  SELLING_EKSKLUSIF_PERFUME: {
    chip: "bg-fuchsia-500/10 text-fuchsia-600 ring-1 ring-inset ring-fuchsia-500/25",
    text: "text-fuchsia-600",
    soft: "bg-fuchsia-500/10",
    bar: "bg-gradient-to-r from-fuchsia-500 via-fuchsia-500/45 to-transparent",
    barGlow: "shadow-[0_0_16px_-2px] shadow-fuchsia-500/45",
    card: "ring-1 ring-inset ring-fuchsia-500/20 transition-all duration-200 hover:ring-fuchsia-500/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-fuchsia-500/45",
    icon: "ring-1 ring-inset ring-fuchsia-500/25 shadow-[0_0_20px_-6px] shadow-fuchsia-500/50",
    track: "bg-fuchsia-500",
    dot: "bg-fuchsia-500",
    fill: "bg-gradient-to-r from-fuchsia-600 to-fuchsia-400",
  },
}

// ============================================================
// ACCENT UTAMA DASHBOARD (merah cabai)
//
// Aksen generik blok Rekap (bukan identitas program): header,
// KPI, dan card toko memakai satu aksen seragam. Sebelumnya
// meminjam TONE.SELLING_EKSKLUSIF_PERFUME sehingga ruas fuchsia
// muncul sebagai aksen dashboard umum. Aksen ini dilokalkan di
// sini (hex merah cabai #EF3340, neon #FF3B4D) supaya globals.css
// TIDAK disentuh. Identitas ketiga program tetap di TONE.
// ============================================================
const ACCENT_UTAMA: Tone = {
  chip: "bg-[#EF3340]/10 text-[#EF3340] ring-1 ring-inset ring-[#EF3340]/25",
  text: "text-[#EF3340]",
  soft: "bg-[#EF3340]/10",
  bar: "bg-gradient-to-r from-[#EF3340] via-[#EF3340]/45 to-transparent",
  barGlow: "shadow-[0_0_16px_-2px] shadow-[#FF3B4D]/45",
  card: "ring-1 ring-inset ring-[#EF3340]/20 transition-all duration-200 hover:ring-[#EF3340]/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-[#FF3B4D]/45",
  icon: "ring-1 ring-inset ring-[#EF3340]/25 shadow-[0_0_20px_-6px] shadow-[#FF3B4D]/50",
  track: "bg-[#EF3340]",
  dot: "bg-[#EF3340]",
  fill: "bg-gradient-to-r from-[#EF3340] to-[#FF3B4D]",
}

// ============================================================
// RESOLVER NAMA CABANG - DISPLAY SAJA
// ============================================================
//
// PENTING: fungsi ini HANYA menghasilkan string untuk teks yang
// dirender ke user (judul "Rekap Seluruh Toko" dan "Rekap per
// Toko" pada Aggregate Dashboard, serta label kartu pada Picker
// cabang).
//
// Fungsi ini TIDAK BOLEH dipakai untuk:
// - filter, state, cache key, comparison logic
// - parameter API, query, atau request body
// - authorization / akses
// - operasi tulis ke Firestore
//
// Data Firestore (collection "branches") hanya menyimpan
// nama tanpa wilayah, yaitu "CABANG BOGOR" dan "CABANG
// CIANJUR". Nama lengkap yang dikehendaki untuk display hanya
// ada di mapping lokal di bawah ini.
//
// cabangFilter, dropdown value, cache, dan parameter API
// TIDAK PERNAH memakai fungsi ini - semuanya tetap memakai
// cabangId ("BGR-1" / "CJR-01") apa adanya.
//
// ============================================================

const CABANG_DISPLAY_NAME: Record<string, string> = {
  "BGR-1": "CABANG BOGOR - BANTEN",
  "CJR-01": "CABANG CIANJUR - CIPANAS",
}

function getCabangDisplayName(
  cabangId: string | null | undefined,
  namaFallback?: string | null,
): string {
  const normalized = String(cabangId ?? "")
    .trim()
    .toUpperCase()

  if (!normalized) return ""

  return (
    CABANG_DISPLAY_NAME[normalized] ||
    String(namaFallback ?? "").trim() ||
    normalized
  )
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
  mode?: string
  scope?: AddSellAggregateScope
  stores?: AddSellAggregateStore[]
  transactions?: AddSellTransaction[]
  targets?: AddSellTarget[]
  summary?: AddSellSummary
}

// ============================================================
// MODE REKAP CENTRAL (shape dari server, read-only)
//
// Seluruh angka di bawah ini SUDAH dihitung di server. Frontend
// TIDAK menghitung ulang dari transaksi mentah, dan TIDAK
// melakukan query Firestore untuk daftar toko.
//
// hasTarget adalah pembeda antara "TARGET BELUM DIBUAT" dan
// "TARGET ADA DENGAN NILAI 0". Ketika hasTarget = false,
// angka target/achievement TIDAK BOLEH ditampilkan seolah-olah
// bernilai 0.
// ============================================================

type AddSellAggregateScope = {
  role: string
  level: string
  cabangId: string
  totalStores: number
}

type AddSellAggregateJenis = {
  hasTarget: boolean
  totalTarget: number
  totalAchievement: number
  progress: number
}

type AddSellAggregateJenisSummary =
  AddSellAggregateJenis & {
    totalStores: number
    storesWithTarget: number
    storesWithoutTarget: number
  }

type AddSellAggregateStore = {
  storeId: string
  storeName: string
  hasTarget: boolean
  totalEmployees: number
  employeesWithoutTarget: number
  byJenis: Partial<
    Record<PenjualanJenis, AddSellAggregateJenis>
  >
}

type AddSellAggregateData = {
  periode: string
  scope: AddSellAggregateScope
  stores: AddSellAggregateStore[]
  summary: {
    byJenis: Partial<
      Record<PenjualanJenis, AddSellAggregateJenisSummary>
    >
  }
}

// Bentuk aggregate dibaca berdampingan dengan bentuk detail pada
// satu response, lalu dipisahkan oleh result.mode. Tipe
// per-jenis digabung agar kedua bentuk bisa dibaca tanpa cast
// yang bisa salah.
type AddSellAggregateRead = {
  summary?: {
    byJenis: Partial<
      Record<
        PenjualanJenis,
        AddSellJenisSummary & AddSellAggregateJenisSummary
      >
    >
  }
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

// "2026-01" -> "Januari 2026". Memakai formatter yang sama dengan
// navigator periode sehingga label selalu konsisten.
function formatPeriodeLabel(periode: string): string {
  const [year, month] = periode.split("-").map(Number)
  if (!year || !month) {
    return periode
  }
  return monthFormatter.format(new Date(year, month - 1, 1))
}

// Lebar bar dibatasi 100% untuk tampilan, sedangkan ANGKA progress
// yang ditampilkan tetap nilai apa adanya dari server (tidak
// dicap), sama seperti dashboard detail toko.
function barWidth(progress: number): string {
  return `${Math.min(100, Math.max(0, progress))}%`
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
// CENTRAL PUSAT — PEMILIHAN CABANG
//
// Sumber data tetap response /api/admin/branches yang sudah dipakai
// flow Central Pusat sebelumnya, sehingga server tetap yang menentukan
// cabang mana yang boleh diakses. Tidak ada query Firestore dari
// browser, tidak ada API baru, dan tidak ada mapping kode ke nama
// (kode yang tampil apa adanya seperti BGR-1 / CJR-1). Nama cabang
// hanya ditampilkan bila sudah ikut dikirim response tersebut.
// ============================================================

function BranchPicker({
  branches,
  loading,
  onSelect,
}: {
  branches: { cabangId: string; nama: string }[]
  loading: boolean
  onSelect: (cabangId: string) => void
}) {
  if (loading) {
    return <LoadingState label="Memuat daftar cabang..." />
  }

  if (branches.length === 0) {
    return (
      <EmptyState
        title="Belum ada cabang"
        description="Belum ada cabang yang dapat dipilih. Hubungi admin."
        icon={Store}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight">
          Pilih Cabang
        </h2>
        <p className="text-sm text-muted-foreground">
          Pilih satu cabang untuk melihat rekap target penjualan
          seluruh toko pada cabang tersebut.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <button
            key={branch.cabangId}
            type="button"
            onClick={() => onSelect(branch.cabangId)}
            className={cn(
              "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-border bg-card p-4 text-left shadow-sm",
              "transition-all duration-300",
              "hover:border-primary/50 hover:bg-primary/5 hover:shadow-md",
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
                "transition-transform duration-300 group-hover:scale-105",
              )}
            >
              <Store className="size-5" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {getCabangDisplayName(
                  branch.cabangId,
                  branch.nama,
                )}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {branch.nama
                  ? branch.cabangId
                  : "Klik untuk melihat rekap"}
              </span>
            </span>

            <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  )
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
  const isCentralCabang = role === "central_cabang"
  const isCentral = isCentralPusat || isCentralCabang

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
  const [branchOptions, setBranchOptions] = React.useState<
    { cabangId: string; nama: string }[]
  >([])
  const [branchesLoading, setBranchesLoading] = React.useState(false)

  React.useEffect(() => {
    if (!isCentralPusat || !user) {
      return
    }

    const authedUser = user
    let cancelled = false

    setBranchesLoading(true)

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

        // Sumber data tetap response /api/admin/branches milik flow
        // Central Pusat yang sudah ada. Tidak ada query Firestore dari
        // browser dan tidak ada API baru. Nama ditampilkan apa adanya
        // dari response tersebut; bila kosong, yang dipakai cabangId.
        const list = (result.branches ?? [])
          .map((b) => ({
            cabangId: String(b.cabangId ?? "").trim().toUpperCase(),
            nama: String(b.nama ?? "").trim(),
          }))
          .filter((b) => b.cabangId)
          .sort((a, b) => a.cabangId.localeCompare(b.cabangId))

        setBranchOptions(list)
      } catch (error) {
        console.error("Gagal memuat daftar cabang:", error)
      } finally {
        if (!cancelled) {
          setBranchesLoading(false)
        }
      }
    }

    loadBranches()

    return () => {
      cancelled = true
    }
  }, [isCentralPusat, user])

  // ----------------------------------------------------------
  // CENTRAL — pilih SATU toko
  // ----------------------------------------------------------

  const [storeFilter, setStoreFilter] = React.useState("")

  // ----------------------------------------------------------
  // CENTRAL — NAMA TOKO UNTUK JUDUL DASHBOARD DETAIL
  //
  // Response mode detail hanya berisi transaksi, target, dan
  // summary: tidak ada nama toko. Nama diambil dari daftar toko
  // pada response aggregate (data yang sudah ada di halaman ini)
  // tepat saat toko dipilih lewat "Lihat Dashboard Toko", lalu
  // disimpan agar tetap tampil selama mode detail.
  // ----------------------------------------------------------

  const [detailStoreName, setDetailStoreName] = React.useState("")

  // ----------------------------------------------------------
  // CENTRAL — DAFTAR TOKO DARI RESPONSE API
  //
  // Toko untuk Central TIDAK lagi diambil lewat query browser.
  // Daftar toko pada mode rekap berasal dari response aggregate
  // API, sehingga scope cabang ditentukan server dan tidak ada
  // toko luar scope yang pernah muncul di pilihan.
  // ----------------------------------------------------------

  const [aggregate, setAggregate] =
    React.useState<AddSellAggregateData | null>(null)

  // ----------------------------------------------------------
  // CENTRAL — REKAP YANG SUDAH DIMUAT
  //
  // Saat detail toko dibuka, state "aggregate" sengaja dikosongkan
  // supaya halaman detail tidak ikut menampilkan rekap. Data rekap
  // yang sama tetap disimpan di ref ini, sehingga saat user menekan
  // "Kembali ke Semua Toko" rekap langsung dipakai lagi tanpa
  // memanggil API/Firestore aggregate untuk kedua kalinya.
  //
  // Ref (bukan state) dipilih karena penyimpanannya tidak boleh
  // memicu render ulang dan tidak boleh mengubah apa pun yang
  // tampil di layar. Kunci cache mencakup periode dan cabang,
  // sehingga ganti periode atau ganti cabang tetap memuat ulang
  // dari server.
  // ----------------------------------------------------------

  const aggregateCacheKey = isCentral
    ? `${periode}|${isCentralPusat ? "pusat" : "cabang"}|${cabangFilter}`
    : ""

  const aggregateCacheRef = React.useRef<{
    key: string
    data: AddSellAggregateData
  } | null>(null)

  const storeOptions = React.useMemo(
    () =>
      [...(aggregate?.stores ?? [])].sort((a, b) =>
        (a.storeName || a.storeId).localeCompare(
          b.storeName || b.storeId,
          "id",
          { sensitivity: "base" },
        ),
      ),
    [aggregate],
  )

  // ----------------------------------------------------------
  // DATA (GET /api/additional-selling)
  // ----------------------------------------------------------

  const [data, setData] = React.useState<AddSellData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [reloadKey, setReloadKey] = React.useState(0)
  const requestSeqRef = React.useRef(0)
  // Muat ulang manual (setReloadKey) harus selalu benar-benar
  // meminta data terbaru, sehingga cache rekap dilewati begitu
  // nilainya berubah.
  const handledReloadKeyRef = React.useRef(reloadKey)

  const pusatLocked = isCentralPusat && !cabangFilter
  // Central belum memilih toko -> sedang menampilkan dashboard
  // rekap seluruh toko dalam scope (mode aggregate).
  const storeLocked = isCentral && !storeFilter
  const locked = pusatLocked || storeLocked

  React.useEffect(() => {
    if (!profile || !user) {
      setLoading(false)
      return
    }

    // Central Pusat belum memilih cabang: tidak ada request sama
    // sekali, sehingga tidak pernah membaca seluruh cabang.
    if (pusatLocked) {
      setLoading(false)
      setData(null)
      setAggregate(null)
      return
    }

    // Kembali dari detail toko ke rekap: rekap sebelumnya masih
    // tersimpan di halaman ini dan masih berlaku untuk periode +
    // cabang yang sama, sehingga dipakai langsung tanpa fetch lagi.
    const forceReload =
      reloadKey !== handledReloadKeyRef.current
    handledReloadKeyRef.current = reloadKey

    if (isCentral && !storeFilter) {
      const cached = aggregateCacheRef.current

      if (
        !forceReload &&
        cached &&
        cached.key === aggregateCacheKey
      ) {
        setError("")
        setData(null)
        setAggregate(cached.data)
        setLoading(false)
        return
      }
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

        // Central yang sudah memilih toko -> mode DETAIL toko.
        // Central yang belum memilih toko -> param "store" TIDAK
        // dikirim, sehingga server memakai mode REKAP untuk seluruh
        // toko dalam scope cabangnya.
        // Untuk role Store parameter store TIDAK dikirim: server
        // selalu memakai user.storeId.
        if (isCentral && storeFilter) {
          params.set("store", storeFilter)
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

        const result = (await response.json()) as
          AddSellGetResponse & AddSellAggregateRead

        if (cancelled || seq !== requestSeqRef.current) return

        // Bentuk aggregate dan bentuk detail TIDAK pernah dipakai
        // bergantian: mode dari server yang menentukan.
        if (result.mode === "aggregate") {
          const nextAggregate: AddSellAggregateData = {
            periode: String(result.periode ?? periode),
            scope: result.scope ?? {
              role,
              level: "",
              cabangId: "",
              totalStores: 0,
            },
            stores: Array.isArray(result.stores)
              ? result.stores
              : [],
            summary: result.summary ?? { byJenis: {} },
          }

          aggregateCacheRef.current = {
            key: aggregateCacheKey,
            data: nextAggregate,
          }

          setAggregate(nextAggregate)
          setData(null)
          return
        }

        setAggregate(null)
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
    storeLocked,
    storeFilter,
    isCentral,
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

  // Untuk Store tetap nama tokonya sendiri. Untuk Central memakai
  // nama toko dari response API; saat masih di mode rekap, label
  // menampilkan cabang scope-nya.
  const selectedStoreName = isCentral
    ? (storeOptions.find((s) => s.storeId === storeFilter)
        ?.storeName ?? "")
    : ""

  // Hanya teks tampilan. scope.cabangId (ID) tetap dipakai untuk
  // seluruh logic, cache, filter, dan parameter API. branchOptions
  // hanya berisi nama dari data existing, jadi dipakai sebagai
  // fallback tampilan saja.
  const scopeCabangNama = getCabangDisplayName(
    aggregate?.scope.cabangId,
    branchOptions.find(
      (branch) =>
        branch.cabangId === aggregate?.scope.cabangId,
    )?.nama,
  )

  const storeName =
    profile?.namaStore ||
    profile?.storeId ||
    selectedStoreName ||
    (isCentral
      ? scopeCabangNama || "Semua Toko"
      : "CABANG")

  // Judul dashboard detail untuk Central (cabang & pusat): "Target
  // Penjualan Toko {NAMA TOKO}". Nama diambil apa adanya dari data
  // existing; storeId SENGAJA tidak pernah dipakai, dan bila nama
  // tidak tersedia judul tetap "Target Penjualan" tanpa storeId.
  // Role Store tidak terpengaruh sama sekali.
  const detailTitleSuffix =
    isCentral && storeFilter ? detailStoreName.trim() : ""

  // CATATAN TARGET PENJUALAN
  // ----------------------------------------------------------
  //
  // Catatan adalah modal, bukan halaman, sehingga seluruh
  // state (toko, periode, daftar) hidup di dalam
  // components/additional-selling-notes.tsx. Yang diteruskan ke
  // sana HANYA scope yang sudah ada di halaman ini:
  //
  //   - Toko  : Store memakai profile.storeId. Central memakai
  //             storeFilter, sehingga string KOSONG saat masih di
  //             rekap / belum memilih cabang. Tombol Catatan
  //             otomatis hilang dan TIDAK ada request apa pun
  //             (component-nya yang memutuskan, bukan halaman).
  //   - Periode: periode dashboard yang sedang aktif. Tidak ada
  //             selector periode terpisah untuk Catatan.
  //
  // Role Store tetap read-only lewat "canWrite" dan ditolak lagi
  // di server.
  const notesStoreId = isStore ? (profile?.storeId ?? "") : storeFilter

  const notesStoreLabel = isStore
    ? profile?.namaStore || profile?.storeId || "Toko"
    : detailStoreName.trim() || "Toko"

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
                  {detailTitleSuffix
                    ? ` Toko ${detailTitleSuffix}`
                    : ""}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Program Kerja · {storeName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
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
                    "hover:shadow-[0_0_20px_-4px] hover:ring-primary/60",
                  )}
                >
                  <Plus className="size-4" />
                  Catat Penjualan
                </Button>
              </div>
            )}

            {/* NAVIGASI PERIODE - bagian dari header utama */}
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

        {/* TOMBOL KEMBALI PILIH CABANG + TOKO + TAB */}
        <div className="flex flex-wrap items-center gap-3">
          {isCentralPusat && cabangFilter && !storeFilter && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                // Kembali ke daftar cabang: reset cabang DAN toko, serta
                // buang data aggregate cabang sebelumnya supaya tidak
                // ada data cabang lama yang masih tampil.
                setCabangFilter("")
                setStoreFilter("")
                setDetailStoreName("")
                setAggregate(null)
              }}
              className={cn(
                "gap-1.5",
                "ring-1 ring-inset ring-primary/30",
                "shadow-[0_0_16px_-8px] shadow-primary/45",
                "transition-all duration-200",
                "hover:ring-primary/60",
              )}
            >
              <ArrowLeft className="size-4" />
              Kembali Pilih Cabang
            </Button>
          )}

          {isCentral && storeFilter && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setStoreFilter("")
                // Nama toko hanya relevan di mode detail.
                setDetailStoreName("")
              }}
              className={cn(
                "gap-1.5",
                "ring-1 ring-inset ring-primary/30",
                "shadow-[0_0_16px_-8px] shadow-primary/45",
                "transition-all duration-200",
                "hover:ring-primary/60",
              )}
            >
              <ArrowLeft className="size-4" />
              Kembali ke Semua Toko
            </Button>
          )}

          {/* Tab Dashboard Program / History hanya bermakna pada
              mode detail toko. Mode rekap Central memakai seluruh
              halaman untuk dashboard rekap, dan History memang
              tidak tersedia karena response rekap tidak mengirim
              daftar transaksi. */}
          {!storeLocked && (
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "dashboard", label: "Dashboard Program" },
                { value: "history", label: "History" },
              ]}
            />
          )}

          {/* CATATAN — tombol yang membuka modal Catatan. Muncul
              hanya pada mode detail toko (dan untuk Store), lewat
              guard "notesStoreId" di dalam component. Central yang
              masih di rekap / belum memilih cabang tidak melihat
              tombol ini sama sekali. */}
          {!storeLocked && (
            <AdditionalSellingNotes
              storeId={notesStoreId}
              periode={periode}
              periodeLabel={formatPeriodeLabel(periode)}
              storeLabel={notesStoreLabel}
              isStore={isStore}
              canWrite={isCentral}
              getIdToken={async () => {
                if (!user) {
                  throw new Error(
                    "Sesi berakhir. Silakan login kembali.",
                  )
                }
                return user.getIdToken()
              }}
              showToast={showToast}
            />
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* CENTRAL PUSAT — PILIH CABANG                */}
      {/* ============================================ */}

      {pusatLocked && (
        <BranchPicker
          branches={branchOptions}
          loading={branchesLoading}
          onSelect={(cabangId) => {
            setCabangFilter(cabangId)
            // Ganti cabang → pilihan toko direset.
            setStoreFilter("")
            setDetailStoreName("")
          }}
        />
      )}

      {/* ============================================ */}
      {/* CENTRAL — MODE REKAP SELURUH TOKO CABANG    */}
      {/* ============================================ */}

      {!pusatLocked && isCentral && storeLocked && (
        <div className="space-y-5">
          {loading && (
            <LoadingState label="Memuat rekap toko..." />
          )}

          {!loading && error && (
            <EmptyState
              title={error}
              description="Silakan muat ulang halaman."
            />
          )}

          {!loading && !error && aggregate && (
            <AggregateDashboard
              data={aggregate}
              cabangNama={scopeCabangNama}
              onSelectStore={(storeId) => {
                // Nama toko diambil dari daftar toko response aggregate
                // (data existing) sebelum masuk mode detail, karena
                // response detail tidak memuat nama toko.
                setDetailStoreName(
                  aggregate.stores.find((s) => s.storeId === storeId)
                    ?.storeName ?? "",
                )
                setStoreFilter(storeId)
              }}
            />
          )}

          {!loading && !error && !aggregate && (
            <EmptyState
              title="Rekap belum tersedia"
              description="Silakan muat ulang halaman."
              icon={Layers}
            />
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* TAB: DASHBOARD PROGRAM                       */}
      {/* ============================================ */}

      {!locked && tab === "dashboard" && (
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

      {!locked && tab === "history" && (
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

// ============================================================
// DASHBOARD REKAP CENTRAL (mode aggregate server)
//
// SELURUH angka berasal dari response aggregate API. Komponen ini
// tidak menghitung ulang dari transaksi mentah dan tidak melakukan
// query Firestore.
//
// Aturan "TARGET BELUM DIBUAT" (hasTarget = false) dijaga di sini:
// angka 0 TIDAK pernah ditampilkan seolah-olah target sudah dibuat.
// ============================================================

// Badge "TARGET BELUM DIBUAT". Dipakai konsisten di seluruh
// dashboard rekap, baik pada level jenis, level toko, maupun
// per toko per jenis.
function TargetBelumDibuatBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-dashed text-muted-foreground",
        className,
      )}
    >
      Target belum dibuat
    </Badge>
  )
}

function AggregateKpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: string
  hint?: string
  tone: Tone
  icon: React.ComponentType<{ className?: string }>
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-3",
        "transition-[transform,box-shadow] duration-200",
        "hover:-translate-y-0.5",
        tone.card,
        accent && tone.barGlow,
      )}
    >
      {/* Hairline neon tipis di tepi atas. Murni visual. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px opacity-60",
          tone.bar,
        )}
      />

      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className={cn("size-3.5 shrink-0", tone.text)} />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 truncate text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// CAKUPAN TARGET
//
// Visual kecil untuk membandingkan berapa toko yang SUDAH punya
// target pada satu jenis dengan berapa toko yang belum.
//
// Angka TIDAK dihitung ulang dari daftar toko: semuanya diambil
// apa adanya dari response aggregate
// (summary.byJenis[jenis].storesWithTarget / storesWithoutTarget
//  / totalStores).
//
// "Target belum dibuat" tetap dibedakan dari "0 dari N toko":
// ketika hasTarget = false, panel menampilkan badge dan BUKAN
// bar 0%.
// ------------------------------------------------------------
function CoverageTarget({
  jenis,
  cell,
  totalStores,
}: {
  jenis: PenjualanJenis
  cell: AddSellAggregateJenisSummary | undefined
  totalStores: number
}) {
  const tone = TONE[jenis]
  const hasTarget = cell?.hasTarget === true

  const storesWithTarget = cell?.storesWithTarget ?? 0
  const storesWithoutTarget =
    cell?.storesWithoutTarget ?? 0

  // Persentase hanya untuk lebar bar. Angka "x dari y" tetap
  // bentuk aslinya supaya tidak pernah menampilkan "0%" untuk
  // toko yang target-nya memang belum dibuat.
  const coverage =
    totalStores > 0
      ? (storesWithTarget / totalStores) * 100
      : 0

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-3",
        "transition-[transform,box-shadow] duration-200",
        "hover:-translate-y-0.5",
        tone.card,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px opacity-60",
          tone.bar,
        )}
      />

      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Layers className="size-3.5 shrink-0" />
        <span className="truncate">Cakupan Target</span>
      </div>

      {hasTarget ? (
        <>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {storesWithTarget}
            </p>
            <p className="truncate text-sm font-medium text-muted-foreground tabular-nums">
              dari {totalStores} toko
            </p>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70"
            role="img"
            aria-label={`${storesWithTarget} dari ${totalStores} toko sudah memiliki target ${JENIS_LABEL[jenis]}`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-[600ms] ease-out",
                tone.fill,
                tone.barGlow,
              )}
              style={{ width: barWidth(coverage) }}
            />
          </div>

          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            {storesWithoutTarget > 0
              ? `${storesWithoutTarget} toko belum ada target`
              : "Semua toko sudah ada target"}
          </p>
        </>
      ) : (
        <>
          <div className="mt-1.5">
            <TargetBelumDibuatBadge />
          </div>
          <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
            0 dari {totalStores} toko punya target {JENIS_LABEL[jenis]}
          </p>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// CHART — TARGET VS ACHIEVEMENT
//
// Tanpa library chart: bar HTML/CSS memakai token warna yang
// sudah dipakai modul ini. Skala mengikuti nilai terbesar antara
// target dan realisasi, sehingga realisasi yang melampaui target
// tetap terlihat penuh.
//
// Phase 3 hanya MEMPOLISH tampilan. Konsep, angka, dan rumus
// TIDAK diubah:
//   - Target   = cell.totalTarget      (dari server)
//   - Realisasi= cell.totalAchievement (dari server)
//   - Progress = cell.progress         (dari server, TIDAK di-cap)
// Lebar bar memakai barWidth() sehingga visual tetap aman pada
// progress > 100% tanpa mengubah angka yang ditampilkan.
// ------------------------------------------------------------
function TargetVsAchievementChart({
  jenis,
  cell,
}: {
  jenis: PenjualanJenis
  cell: AddSellAggregateJenisSummary | undefined
}) {
  const tone = TONE[jenis]

  if (!cell || !cell.hasTarget) {
    return (
      <div className="space-y-2.5 rounded-xl border border-dashed border-border bg-muted/30 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <TrendingUp className="size-3.5" />
          Target vs Realisasi
        </div>
        <TargetBelumDibuatBadge />
        <p className="text-xs text-muted-foreground">
          Belum ada target untuk {JENIS_LABEL[jenis]} pada
          periode ini, sehingga capaian belum dapat dihitung.
        </p>
      </div>
    )
  }

  const totalTarget = cell.totalTarget
  const totalAchievement = cell.totalAchievement
  const skala = Math.max(totalTarget, totalAchievement, 1)

  return (
    <div
      className="space-y-3.5 rounded-xl border border-border bg-background p-4 transition-shadow duration-200 hover:shadow-[0_14px_34px_-26px]"
      role="img"
      aria-label={`Target versus realisasi ${JENIS_LABEL[jenis]}. Target ${formatNilai(jenis, totalTarget)}, realisasi ${formatNilai(jenis, totalAchievement)}, progress ${cell.progress} persen.`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <TrendingUp className={cn("size-3.5", tone.text)} />
          Target vs Realisasi
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cn("size-2 rounded-full", tone.dot)} />
          <span className="font-semibold tabular-nums">
            {cell.progress}%
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Target</span>
            <span className="font-semibold tabular-nums">
              {formatNilai(jenis, totalTarget)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-muted-foreground/45 to-muted-foreground/15 transition-[width] duration-[600ms] ease-out"
              style={{ width: barWidth((totalTarget / skala) * 100) }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Realisasi</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                tone.text,
              )}
            >
              {formatNilai(jenis, totalAchievement)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-[600ms] ease-out",
                tone.fill,
                tone.barGlow,
              )}
              style={{
                width: barWidth((totalAchievement / skala) * 100),
              }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Progress Keseluruhan</span>
          <span className="font-semibold text-foreground tabular-nums">
            {cell.progress}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-[600ms] ease-out",
              tone.fill,
            )}
            style={{ width: barWidth(cell.progress) }}
          />
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// KPI + CHART per jenis target
// ------------------------------------------------------------
function AggregateJenisSection({
  jenis,
  cell,
  totalStores,
}: {
  jenis: PenjualanJenis
  cell: AddSellAggregateJenisSummary | undefined
  totalStores: number
}) {
  const tone = TONE[jenis]
  const Icon = JENIS_ICON[jenis]
  const hasTarget = cell?.hasTarget === true

  return (
    <Card
      className={cn(
        "overflow-hidden",
        tone.card,
        "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
      )}
    >
      <div className="relative">
        <div
          className={cn("h-1 w-full", tone.bar, tone.barGlow)}
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

          {!hasTarget && <TargetBelumDibuatBadge />}
        </div>
      </div>

      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {hasTarget ? (
            <>
              <AggregateKpiCard
                label="Total Target"
                value={formatNilai(jenis, cell!.totalTarget)}
                tone={tone}
                icon={Target}
              />
              <AggregateKpiCard
                label="Total Realisasi"
                value={formatNilai(
                  jenis,
                  cell!.totalAchievement,
                )}
                tone={tone}
                icon={TrendingUp}
              />
              <AggregateKpiCard
                label="Progress"
                value={`${cell!.progress}%`}
                tone={tone}
                icon={TrendingUp}
                accent={cell!.progress > 0}
              />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 sm:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Target className="size-3.5" />
                Total Target · Total Realisasi · Progress
              </div>
              <div className="mt-2">
                <TargetBelumDibuatBadge />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Belum ada target {JENIS_LABEL[jenis]} pada periode
                ini, sehingga target, realisasi, dan progress
                belum dapat ditampilkan.
              </p>
            </div>
          )}

          {/* Cakupan Target menggantikan KPI angka polos agar
              informasi yang sama tidak tampil dua kali, sekaligus
              menambah bar visual. Angkanya tetap dari server. */}
          <CoverageTarget
            jenis={jenis}
            cell={cell}
            totalStores={totalStores}
          />
        </div>

        <TargetVsAchievementChart jenis={jenis} cell={cell} />
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// REKAP PER TOKO
//
// Nama toko memakai storeName dari response API. Kartu bisa diklik
// untuk masuk ke dashboard detail toko (tetap read-only).
// ------------------------------------------------------------
function AggregateStoreCard({
  store,
  onSelect,
}: {
  store: AddSellAggregateStore
  onSelect: (storeId: string) => void
}) {
  // Aksen rekap memakai ACCENT_UTAMA (merah cabai) sehingga satu
  // blok dashboard punya satu warna aksen. Tidak ada warna
  // hardcoded ulang di luar ACCENT_UTAMA.
  const accent = ACCENT_UTAMA

  return (
    <button
      type="button"
      onClick={() => onSelect(store.storeId)}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 text-left",
        accent.card,
        "transition-all duration-200 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-px opacity-50 transition-opacity duration-300 group-hover:opacity-100",
          accent.bar,
        )}
      />

      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            accent.soft,
            accent.text,
            accent.icon,
            "transition-transform duration-300 group-hover:scale-105",
          )}
        >
          <Store className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {store.storeName || store.storeId}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {store.totalEmployees} karyawan
            {store.employeesWithoutTarget > 0
              ? ` · ${store.employeesWithoutTarget} belum ada target`
              : ""}
          </p>
        </div>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {!store.hasTarget ? (
        <TargetBelumDibuatBadge className="self-start" />
      ) : (
        <div className="space-y-3">
          {JENIS_LIST.map((jenis) => {
            const tone = TONE[jenis]
            const cell = store.byJenis[jenis]

            if (!cell?.hasTarget) {
              return (
                <div
                  key={jenis}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-xs text-muted-foreground">
                    {JENIS_PLURAL[jenis]}
                  </span>
                  <TargetBelumDibuatBadge />
                </div>
              )
            }

            return (
              <div key={jenis}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">
                    {JENIS_PLURAL[jenis]}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      cell.progress > 0
                        ? tone.text
                        : "text-muted-foreground",
                    )}
                  >
                    {cell.progress}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-[600ms] ease-out",
                      tone.track,
                      tone.barGlow,
                    )}
                    style={{ width: barWidth(cell.progress) }}
                  />
                </div>
                <p className="mt-1 truncate text-[11px] text-muted-foreground tabular-nums">
                  {formatNilai(jenis, cell.totalAchievement)}
                  {" / "}
                  {formatNilai(jenis, cell.totalTarget)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div
        className={cn(
          "mt-auto flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs font-medium",
          accent.text,
        )}
      >
        Lihat Dashboard Toko
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

// ------------------------------------------------------------
// CHART — GRAFIK PENCAPAIAN PER PROGRAM
//
// Grouped VERTICAL bar: satu kolom per toko, tiga batang
// berdampingan per toko (bukan stacked, bukan horizontal).
//
//   X = nama toko
//   Y = progress (%)
//   SERIES = 3 jenis target, dibedakan lewat LEGEND
//
// DATA — hanya progress dari server:
//   stores[].storeName
//   stores[].byJenis[jenis].hasTarget
//   stores[].byJenis[jenis].progress
//
// totalTarget dan totalAchievement SENGAJA TIDAK dipakai karena
// satuannya berbeda antara jenis (Rupiah vs PCS). Progress (%)
// adalah satuan yang kompatibel sehingga ketiga program bisa
// dibandingkan pada satu sumbu. Progress TIDAK dihitung ulang:
// nilai yang diplot adalah nilai response API apa adanya.
//
// TIDAK ADA selector jenis. Ketiga program tampil bersamaan.
//
// "Target belum dibuat" (hasTarget = false) TIDAK dirender
// sebagai batang 0%: slot-nya kosong dengan placeholder putus-
// putus ringan, karena 0% akan terbaca sebagai pencapaian nol.
//
// Komponen ini murni presentation: tidak ada fetch, query,
// cache, navigasi, maupun handler yang mengubah filter halaman.
// Batang bukan button — interaksi hanya hover.
// ------------------------------------------------------------

// Skala Y untuk Grafik Pencapaian Per Program.
// Batas atas TIDAK di-hardcode 100: bila ada progress > 100%
// (mis. 180%), batas atas dan tick ikut menyesuaikan sehingga
// batang tetap muat. Bila semua nilai <= 100%, skala 0-100%
// dipakai.
function programChartYAxis(maxProgress: number): {
  max: number
  ticks: number[]
} {
  const rawMax = Math.max(100, maxProgress)
  const step =
    rawMax <= 100
      ? 20
      : rawMax <= 200
        ? 25
        : rawMax <= 500
          ? 50
          : rawMax <= 1000
            ? 100
            : Math.ceil(rawMax / 5 / 100) * 100

  const max = Math.ceil(rawMax / step) * step
  const ticks: number[] = []

  for (let value = step; value <= max; value += step) {
    ticks.push(value)
  }

  return { max, ticks }
}

function PerformaStoreChart({
  stores,
}: {
  stores: AddSellAggregateStore[]
}) {
  // Baris chart diturunkan PURELY dari response aggregate.
  // Urutan toko mengikuti urutan response, sama dengan urutan
  // "Rekap per Toko" di bawah, sehingga chart dan daftar toko
  // selalu urut sama. Tidak ada sampling dan tidak ada top-N.
  const rows = React.useMemo(() => {
    return stores.map((store) => ({
      storeId: store.storeId,
      storeName: store.storeName || store.storeId,
      series: JENIS_LIST.map((jenis) => {
        const cell = store.byJenis[jenis]

        return {
          jenis,
          // Otoritas "target sudah dibuat" untuk program ini
          // adalah byJenis[jenis].hasTarget dari server.
          hasTarget: cell?.hasTarget === true,
          // Progress hanya dibaca ketika hasTarget true. Nilai
          // 0 TIDAK dipakai sebagai pengganti "belum ada
          // target", sehingga batang palsu 0% tidak pernah
          // muncul.
          progress:
            cell?.hasTarget === true ? (cell?.progress ?? 0) : null,
        }
      }),
    }))
  }, [stores])

  // Batas atas sumbu Y mengikuti progress TERBESAR yang benar-benar
  // ada, sehingga nilai > 100% tetap terplot utuh.
  const yAxis = React.useMemo(() => {
    let maxProgress = 0

    for (const row of rows) {
      for (const item of row.series) {
        if (item.progress !== null) {
          maxProgress = Math.max(maxProgress, item.progress)
        }
      }
    }

    return programChartYAxis(maxProgress)
  }, [rows])

  const programTerisi = rows.reduce(
    (total, row) =>
      total + row.series.filter((item) => item.hasTarget).length,
    0,
  )
  const programTotal = rows.length * JENIS_LIST.length

  return (
    <Card className="overflow-hidden bg-card ring-1 ring-inset ring-border/70">
      {/* HAIRLINE TIGA WARNA — satu aksen untuk tiga program */}
      <div className="h-1 w-full bg-gradient-to-r from-status-pagi via-status-siang to-fuchsia-500" />

      <CardContent className="space-y-4 pt-4">
        {/* HEADER */}
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground ring-1 ring-inset ring-border/70">
            <BarChart3 className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              Grafik Pencapaian Per Program
            </h2>
            <p className="text-xs text-muted-foreground">
              Progres pencapaian target per program, antar toko
            </p>
          </div>
        </div>

        {/* LEGEND — pembeda ketiga program */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {JENIS_LIST.map((jenis) => (
            <span
              key={jenis}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"
            >
              <span
                aria-hidden
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                  TONE[jenis].fill,
                )}
              />
              {JENIS_LABEL[jenis]}
            </span>
          ))}
        </div>

        {/* RINGKASAN SKALA */}
        {rows.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {programTerisi} dari {programTotal} program sudah punya
            target · sumbu Y 0–{yAxis.max}%
          </p>
        )}

        {/* CHART */}
        {rows.length === 0 ? (
          <EmptyState
            title="Belum ada toko"
            description="Cabang ini belum memiliki toko. Hubungi admin untuk menambahkan toko."
            icon={Store}
          />
        ) : (
          <div className="flex gap-2 rounded-xl border border-border/70 bg-background/60 p-3">
            {/* SUMBU Y — label persen, tidak ikut scroll */}
            <div className="relative h-56 w-9 shrink-0">
              {yAxis.ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ bottom: `${(tick / yAxis.max) * 100}%` }}
                >
                  {tick}%
                </span>
              ))}
            </div>

            {/* AREA PLOT — scroll horizontal DIBATAS di sini,
                halaman tidak pernah overflow horizontal. */}
            <div className="w-full min-w-0 overflow-x-auto">
              <div className="min-w-max">
                {/* Batang + grid */}
                <div className="relative flex h-56 items-stretch gap-3">
                  {/* Gridline mengikuti tick sumbu Y */}
                  {yAxis.ticks.map((tick) => (
                    <div
                      key={tick}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/60"
                      style={{ bottom: `${(tick / yAxis.max) * 100}%` }}
                    />
                  ))}
                  {/* Garis dasar 0% */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border"
                  />

                  {rows.map((row) => (
                    <div
                      key={row.storeId}
                      className="group/store relative flex w-[72px] shrink-0 flex-col justify-end"
                    >
                      <div
                        className="pointer-events-none absolute inset-0 rounded-lg bg-transparent transition-colors duration-200 group-hover/store:bg-muted/40"
                        aria-hidden
                      />
                      <div className="absolute inset-0 flex items-end justify-center gap-1 px-1">
                        {row.series.map((item) => {
                          const itemTone = TONE[item.jenis]

                          if (!item.hasTarget) {
                            // Target belum dibuat untuk program ini
                            // pada toko ini. Slot dikosongkan dengan
                            // placeholder putus-putus ringan —
                            // BUKAN batang 0%.
                            return (
                              <div
                                key={item.jenis}
                                className="h-1.5 w-full max-w-[18px] shrink-0 rounded-[3px] border border-dashed border-border"
                                title={`${row.storeName} · ${JENIS_LABEL[item.jenis]}: Target belum dibuat`}
                              >
                                <span className="sr-only">
                                  {JENIS_LABEL[item.jenis]} — Target
                                  belum dibuat
                                </span>
                              </div>
                            )
                          }

                          // 1.5% dipakai sebagai tinggi minimum
                          // supaya progress 0% yang sah tetap
                          // terlihat sebagai batang tipis di
                          // baseline, dan tidak tertukar dengan
                          // "target belum dibuat" yang memakai
                          // placeholder putus-putus.
                          const tinggi = Math.max(
                            1.5,
                            Math.min(
                              100,
                              Math.max(
                                0,
                                ((item.progress ?? 0) / yAxis.max) *
                                  100,
                              ),
                            ),
                          )

                          return (
                            <div
                              key={item.jenis}
                              className="w-full max-w-[18px] shrink-0"
                              style={{ height: `${tinggi}%` }}
                              title={`${row.storeName} · ${JENIS_LABEL[item.jenis]}: ${item.progress}%`}
                            >
                              <div
                                className={cn(
                                  "h-full w-full rounded-t-[4px]",
                                  "transition-[filter] duration-200",
                                  "group-hover/store:brightness-110",
                                  itemTone.fill,
                                  itemTone.barGlow,
                                )}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* SUMBU X — nama toko, lebar kolom sama dengan
                    batang di atas sehingga selalu rata. */}
                <div className="mt-1.5 flex gap-3">
                  {rows.map((row) => (
                    <p
                      key={row.storeId}
                      className="w-[72px] shrink-0 truncate text-center text-[10px] text-muted-foreground"
                      title={row.storeName}
                    >
                      {row.storeName}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// DONUT — TOTAL PENCAPAIAN (SEMUA TOKO)
//
// RINGKASAN TIGA PROGRESSION INDEPENDEN, BUKAN PART-TO-WHOLE.
//
// PENTING soal makna data: 82% + 77% + 64% TIDAK boleh
// digambar sebagai tiga potong dari total 223% (arti "bagian dari
// satu kesatuan"). Ketiganya adalah progress yang berdiri sendiri.
// Karena itu bentuk yang dipakai adalah TIGA RING BERSUSUN
// (multi-ring), bukan satu pie/segmented arc.
//
//   - setiap ring milik SATU program
//   - lingkaran penuh pada ring berarti 100%
//   - busur nilai panjangnya sebanding dengan progress program itu
//   - progress > 100% tetap digambar PENUH sebagai lingkaran penuh
//     yang bersih, tanpa marker atau titik tambahan apa pun;
//     nilai aslinya hanya dibaca pada legend
//
// MAKNA DATA (> bentuk donut) menjadi prioritas.
//
// SKALA VISUAL ring TIDAK dinamis. Semua ring memakai skala 0-100%
// supaya nilai ekstrem (200%, 261%) tetap tampil penuh dan rapi:
//
//   progressVisual = min(max(progress, 0), 100)
//
// Clamp ini HANYA berlaku pada panjang busur. ANGKA ASLI tidak
// pernah diubah: legend tetap menampilkan nilai server apa adanya
// (mis. 261%), dan rata-rata tengah tetap memakai nilai asli
// tanpa clamp.
//
// DATA — semuanya dari response aggregate yang sudah ada:
//   summary.byJenis[jenis].hasTarget
//   summary.byJenis[jenis].progress
//
// totalTarget, totalAchievement, Rupiah, dan PCS SENGAJA TIDAK
// dipakai. Progress (%) TIDAK dihitung ulang.
//
// Rata-rata tengah memakai HANYA jenis yang benar-benar punya
// target (hasTarget true), dan TIDAK dicap ke 100%.
//
// Komponen ini murni presentation: tanpa fetch, query, cache,
// navigasi, atau handler filter. Tidak ada interaksi klik.
// ------------------------------------------------------------

function TotalPencapaianDonut({
  summary,
}: {
  summary: AddSellAggregateData["summary"]
}) {
  const tone = ACCENT_UTAMA

  // Data ring diturunkan dari summary aggregate yang sudah ada.
  // Tidak ada request tambahan.
  const series = React.useMemo(() => {
    return JENIS_LIST.map((jenis) => {
      const cell = summary.byJenis[jenis]

      return {
        jenis,
        // hasTarget = false berarti target belum dibuat. Nilai ini
        // TIDAK masuk ke perhitungan rata-rata dan TIDAK digambar
        // sebagai 0%.
        hasTarget: cell?.hasTarget === true,
        progress: cell?.hasTarget === true ? (cell?.progress ?? 0) : 0,
      }
    })
  }, [summary])

  // Rata-rata hanya dari program yang punya target. Contoh:
  // 80% + (belum ada target) + 60% = (80 + 60) / 2 = 70%.
  // Bukan (80 + 0 + 60) / 3.
  const terisi = series.filter((item) => item.hasTarget)
  const rataRata = terisi.length
    ? Math.round(
        terisi.reduce((total, item) => total + item.progress, 0) /
          terisi.length,
      )
    : null

  // Radii ring: luar ke dalam mengikuti urutan JENIS_LIST
  // (Additional Selling, Upsize Botol, Selling Eksklusif Perfume).
  // Selisih 12 unit dengan stroke 6 menyisakan celah 6 unit, jadi
  // ketiga ring tidak pernah bertabrakan.
  const radii = [56, 44, 32] as const
  const stroke = 6

  return (
    <Card className="overflow-hidden bg-card ring-1 ring-inset ring-border/70">
      {/* Hairline tiga warna — sama dengan chart per program */}
      <div className="h-1 w-full bg-gradient-to-r from-status-pagi via-status-siang to-fuchsia-500" />

      <CardContent className="space-y-5 pt-5">
        {/* HEADER */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              tone.soft,
              tone.text,
              tone.icon,
            )}
          >
            <ChartPie className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">
              Total Pencapaian
            </h2>
            <p className="text-xs text-muted-foreground">
              Rata-rata progress semua toko
            </p>
          </div>
        </div>

        {/* DONUT MULTI-RING */}
        <div className="relative mx-auto size-40">
          <svg
            viewBox="0 0 120 120"
            className="size-40 -rotate-90"
            role="img"
            aria-label={
              rataRata === null
                ? "Belum ada target penjualan pada cakupan ini."
                : `Rata-rata Pencapaian ${rataRata} persen. ${series
                    .map(
                      (item) =>
                        `${JENIS_LABEL[item.jenis]} ${
                          item.hasTarget
                            ? `${item.progress} persen`
                            : "target belum dibuat"
                        }`,
                    )
                    .join(". ")}.`
            }
          >
            {series.map((item, index) => {
              const r = radii[index]
              const keliling = 2 * Math.PI * r

              // Clamp HANYA untuk panjang busur. Angka yang
              // ditampilkan dan rata-rata tetap nilai asli.
              const progressVisual = item.hasTarget
                ? Math.min(Math.max(item.progress, 0), 100)
                : 0

              // Panjang busur minimal sepanjang stroke supaya
              // progress 1-3% tetap terlihat sebagai busur sangat
              // kecil, tanpa terlihat seperti 10% atau lebih.
              const panjangArc = item.hasTarget
                ? Math.max(
                    (progressVisual / 100) * keliling,
                    stroke,
                  )
                : 0

              return (
                <g key={item.jenis}>
                  {/* Track: lingkaran penuh = 100% */}
                  <circle
                    cx={60}
                    cy={60}
                    r={r}
                    fill="none"
                    strokeWidth={stroke}
                    stroke="currentColor"
                    className="text-muted-foreground/20"
                  />

                  {/* Halo tipis di belakang busur sebagai glow */}
                  {item.hasTarget ? (
                    <circle
                      cx={60}
                      cy={60}
                      r={r}
                      fill="none"
                      strokeWidth={stroke + 5}
                      stroke="currentColor"
                      strokeOpacity={0.16}
                      strokeLinecap="round"
                      className={cn(
                        "transition-[stroke-dashoffset] duration-700 ease-out",
                        TONE[item.jenis].text,
                      )}
                      strokeDasharray={keliling}
                      strokeDashoffset={keliling - panjangArc}
                    />
                  ) : null}

                  {/* Busur nilai */}
                  {item.hasTarget ? (
                    <circle
                      cx={60}
                      cy={60}
                      r={r}
                      fill="none"
                      strokeWidth={stroke}
                      stroke="currentColor"
                      strokeLinecap="round"
                      className={cn(
                        "transition-[stroke-dashoffset] duration-700 ease-out",
                        TONE[item.jenis].text,
                      )}
                      strokeDasharray={keliling}
                      strokeDashoffset={keliling - panjangArc}
                    />
                  ) : null}
                </g>
              )
            })}
          </svg>

          {/* ANGKA TENGAH — hanya rata-rata, tetap di tengah donut.
              Label "Rata-rata n program" SENGAJA tidak dipaksakan
              di dalam hole: hole hanya ~77px sedangkan teks label
              jauh lebih lebar, sehingga posisi tengah dipakai
              bersih untuk angka saja. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
              {rataRata === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={tone.text}>{rataRata}%</span>
              )}
            </span>
          </div>
        </div>

        {/* LABEL RATA-RATA — di bawah donut dengan jarak yang sama
            seperti jarak antar bagian card lainnya, jadi tidak
            menempel donut maupun legend. */}
        <p className="px-2 text-center text-[9px] font-medium uppercase leading-tight tracking-[0.12em] text-muted-foreground">
          {terisi.length > 0
            ? `Rata-rata ${terisi.length} program`
            : "Belum ada target"}
        </p>

        {/* LEGEND — nilai asli tiap program */}
        <div className="divide-y divide-border/50">
          {series.map((item) => (
            <div
              key={item.jenis}
              className="flex items-center gap-2.5 py-2"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2.5 shrink-0 rounded-[3px]",
                  item.hasTarget
                    ? TONE[item.jenis].fill
                    : "border border-dashed border-border bg-transparent",
                )}
              />
              <span
                className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                title={JENIS_LABEL[item.jenis]}
              >
                {JENIS_LABEL[item.jenis]}
              </span>
              {item.hasTarget ? (
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums",
                    TONE[item.jenis].text,
                  )}
                >
                  {item.progress}%
                </span>
              ) : (
                <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                  Target belum dibuat
                </span>
              )}
            </div>
          ))}
        </div>

        {/* CATATAN MAKNA */}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Ringkas penuh berarti 100%. Setiap ring adalah progress
          terpisah, bukan bagian dari satu total.
        </p>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// DASHBOARD REKAP CABANG
//
// Daftar toko hanya ada SATU: bagian "Rekap per Toko". Memilih
// detail toko dilakukan lewat tombol "Lihat Dashboard Toko" pada
// setiap card, jadi tidak ada panel/daftar toko kedua.
// ------------------------------------------------------------
function AggregateDashboard({
  data,
  onSelectStore,
  cabangNama,
}: {
  data: AddSellAggregateData
  onSelectStore: (storeId: string) => void
  // Hanya untuk teks tampilan. data.scope.cabangId (ID) tetap
  // dipakai untuk seluruh logic.
  cabangNama: string
}) {
  const { scope, stores, summary } = data
  const tone = ACCENT_UTAMA

  const totalStores = scope.totalStores || stores.length
  const storesWithAnyTarget = stores.filter(
    (s) => s.hasTarget,
  ).length
  const storesWithoutAnyTarget = Math.max(
    0,
    totalStores - storesWithAnyTarget,
  )

  return (
    <div className="space-y-5">
      {/* HEADER DASHBOARD REKAP */}
      <Card
        className={cn(
          "overflow-hidden",
          tone.card,
          "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
        )}
      >
        <div
          className={cn("h-1 w-full", tone.bar, tone.barGlow)}
        />
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-xl",
                  tone.soft,
                  tone.text,
                  tone.icon,
                )}
              >
                <Layers className="size-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Rekap Seluruh Toko
                </h2>
                <p className="text-xs text-muted-foreground">
                  {scope.cabangId
                    ? `Cabang ${
                        cabangNama || scope.cabangId
                      }`
                    : "Seluruh toko dalam cakupan akun"}
                  {" · "}
                  Periode {formatPeriodeLabel(data.periode)}
                </p>
              </div>
            </div>
          </div>

          {/* KPI RINGKASAN CABANG */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AggregateKpiCard
              label="Total Toko"
              value={String(totalStores)}
              hint="Toko dalam cakupan"
              tone={tone}
              icon={Store}
            />
            <AggregateKpiCard
              label="Toko Sudah Ada Target"
              value={String(storesWithAnyTarget)}
              tone={tone}
              icon={Target}
            />
            <AggregateKpiCard
              label="Toko Belum Ada Target"
              value={String(storesWithoutAnyTarget)}
              tone={tone}
              icon={Target}
            />
            <AggregateKpiCard
              label="Periode"
              value={formatPeriodeLabel(data.periode)}
              tone={tone}
              icon={TrendingUp}
            />
          </div>
        </CardContent>
      </Card>

      {/* KPI + CHART PER JENIS TARGET */}
      {JENIS_LIST.map((jenis) => (
        <AggregateJenisSection
          key={jenis}
          jenis={jenis}
          cell={summary.byJenis[jenis]}
          totalStores={totalStores}
        />
      ))}

      {/* CHART PERFORMA TOKO + DONUT TOTAL PENCAPAIAN
          Chart tetap di kiri, donut di kanan. Di bawah xl keduanya
          ditumpuk vertikal. Wrapper ini HANYA mengatur layout —
          isi dan perilaku PerformaStoreChart tidak diubah. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <PerformaStoreChart stores={stores} />
        <TotalPencapaianDonut summary={summary} />
      </div>

      {/* REKAP PER TOKO */}
      <Card
        className={cn(
          "overflow-hidden",
          tone.card,
          "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
        )}
      >
        <div
          className={cn("h-1 w-full", tone.bar, tone.barGlow)}
        />
        <CardContent className="space-y-4 pt-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">
              Rekap per Toko
            </h2>
            <p className="text-sm text-muted-foreground">
              {stores.length} toko
              {scope.cabangId
                ? ` pada cabang ${
                    cabangNama || scope.cabangId
                  }`
                : ""}
              . Klik satu toko untuk melihat dashboard detail toko
              tersebut.
            </p>
          </div>

          {stores.length === 0 ? (
            <EmptyState
              title="Belum ada toko"
              description="Cabang ini belum memiliki toko. Hubungi admin untuk menambahkan toko."
              icon={Store}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {stores.map((store) => (
                <AggregateStoreCard
                  key={store.storeId}
                  store={store}
                  onSelect={onSelectStore}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

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
              "relative overflow-hidden rounded-xl border border-border bg-background p-3",
              "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5",
              tone.card,
            )}
          >
            <span
              aria-hidden
              className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-px opacity-60",
              tone.bar,
              )}
            />
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <TrendingUp
                className={cn("size-3.5 shrink-0", tone.text)}
              />
              Progress Keseluruhan
            </div>
            <p
              className={cn(
                "mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums",
                summary.progress > 0 ? tone.text : "text-muted-foreground",
              )}
            >
              {summary.totalTarget > 0 ? `${summary.progress}%` : "-"}
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-[600ms] ease-out",
                  tone.fill,
                  tone.barGlow,
                )}
                style={{ width: barWidth(summary.progress) }}
              />
            </div>
          </div>

          <div
            className={cn(
              "relative overflow-hidden rounded-xl border border-border bg-background p-3",
              "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5",
              tone.card,
            )}
          >
            <span
              aria-hidden
              className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-px opacity-60",
              tone.bar,
              )}
            />
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span
                className={cn("size-2 shrink-0 rounded-full", tone.dot)}
              />
              Karyawan
            </div>
            <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {summary.totalEmployees}
            </p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
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
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width] duration-[600ms] ease-out",
                                    tone.fill,
                                    tone.barGlow,
                                  )}
                                  style={{
                                    width: barWidth(row.progress),
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
        "relative overflow-hidden rounded-xl border border-border bg-background p-3",
        "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5",
        tone.card,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px opacity-60",
          tone.bar,
        )}
      />
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className={cn("size-3.5 shrink-0", tone.text)} />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1.5 truncate text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  )
}
