"use client"

import * as React from "react"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
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
import { getFirestoreEmployees } from "@/lib/firestore-data"
import type { FirestoreEmployee } from "@/lib/firestore-data"
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
// AKSEN BLOK REKAP (merah cabai)
//
// TONE di atas adalah IDENTITAS tiap jenis error dan tetap
// dipakai pada KPI jenis, chip History, dan judul kelompok
// detail. Modul ini juga butuh satu aksen yang seragam untuk
// BLOK REKAP (header rekap, KPI ringkasan, kartu toko) supaya
// seluruh blok dibaca sebagai satu bagian, bukan lima warna.
//
// Aksen ini dilokalkan di file ini saja:
//   - globals.css TIDAK disentuh
//   - token global TIDAK ditambah / diubah
//   - tidak memakai varian "dark:" karena aplikasi bisa juga
//     gelap lewat prefers-color-scheme tanpa kelas .dark
//
// Nilai hex sengaja sama pada light dan dark. Token
// "destructive" TETAP dipakai untuk aksi merusak (hapus),
// state error, dan hover baris tabel — bukan untuk accents
// dashboard.
// ============================================================

const ACCENT_UTAMA: {
  chip: string
  text: string
  soft: string
  bar: string
  barGlow: string
  card: string
  icon: string
} = {
  chip: "bg-[#EF3340]/10 text-[#EF3340] ring-1 ring-inset ring-[#EF3340]/25",
  text: "text-[#EF3340]",
  soft: "bg-[#EF3340]/10",
  bar: "bg-gradient-to-r from-[#EF3340] via-[#EF3340]/45 to-transparent",
  barGlow: "shadow-[0_0_16px_-2px] shadow-[#FF3B4D]/45",
  card: "ring-1 ring-inset ring-[#EF3340]/20 transition-all duration-200 hover:ring-[#EF3340]/45 hover:shadow-[0_14px_36px_-16px] hover:shadow-[#FF3B4D]/45",
  icon: "ring-1 ring-inset ring-[#EF3340]/25 shadow-[0_0_20px_-6px] shadow-[#FF3B4D]/50",
}

// ============================================================
// TIPE RESPONSE GET /api/monitoring-error
// ============================================================
//
// Response_detail dan response_aggregate TIDAK PERNAH dipakai
// bergantian pada state yang sama. Bentuk detail TIDAK
// diubah dari sebelum Phase 5; bentuk aggregate mengikuti
// kontrak Phase 4.
//
// SEMUA angka aggregate (scope.totalStores, stores[].totals,
// stores[].totalEmployees, summary.byJenis, summary.total)
// dipakai APA ADANYA dari server. Client TIDAK pernah
// menghitung ulang dari records.

type MonitoringErrorScope = {
  role: string
  level: string
  cabangId: string
  totalStores: number
}

type MonitoringErrorAggregateTotals = {
  [key: string]: number
  total: number
}

type MonitoringErrorAggregateStore = {
  storeId: string
  storeName: string
  cabangId: string
  rows: MonitoringErrorEmployeeRow[]
  totals: MonitoringErrorAggregateTotals
  totalEmployees: number
  records: MonitoringErrorRecord[]
}

type MonitoringErrorAggregate = {
  periode: string
  scope: MonitoringErrorScope
  stores: MonitoringErrorAggregateStore[]
  summary: {
    byJenis: Record<string, number>
    total: number
  }
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
// UKURAN AREA DAFTAR MODAL DETAIL
// ============================================================
//
// Dipakai untuk membatasi tinggi area daftar sehingga maksimal
// 6 card kejadian terlihat sekaligus, sesuai struktur card
// existing. Angka dalam piksel mengikuti tinggi card yang
// sekarang; card itu sendiri tidak diubah.

// Jumlah card kejadian yang dituju untuk terlihat sekaligus.
const DETAIL_ITEM_VISIBLE = 6
// py-2 (16) + text-sm (20) + text-xs (16) + border (2).
const DETAIL_ITEM_HEIGHT = 54
// space-y-2 pada daftar item.
const DETAIL_ITEM_GAP = 8
// Judul kelompok jenis (h4 + badge jumlah).
const DETAIL_GROUP_HEADER_HEIGHT = 24
// space-y-4 antar kelompok jenis.
const DETAIL_GROUP_GAP = 16

// ============================================================
// PEMILIHAN CABANG (CENTRAL PUSAT)
// ============================================================
//
// Pola kartu mengikuti CentralStorePicker di atas dan BranchPicker
// halaman Target Penjualan: grid kartu yang bisa diklik. Data yang
// dipakai HANYA branchOptions dari /api/admin/branches — tidak ada
// fetch, Firestore read, atau data Monitoring Error tambahan
// sebelum kartu dipilih.

// Resolver DISPLAY SAJA - menghasilkan teks untuk UI.
//
// cabangFilter, storeScopeCabang, parameter API, dan query TIDAK
// PERNAH memakai fungsi ini. Semuanya tetap memakai cabangId
// ("BGR-1" / "CJR-01") apa adanya.
//
// Firestore hanya menyimpan nama tanpa wilayah ("CABANG BOGOR",
// "CABANG CIANJUR"), sehingga nama lengkap untuk display memakai
// mapping lokal di bawah ini.

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

function CentralBranchPicker({
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
        description="Tidak ada cabang yang dapat dipilih. Hubungi admin."
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
          Pilih satu cabang untuk melihat rekap Monitoring Error
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
// DASHBOARD REKAP (MODE AGGREGATE CABANG)
// ============================================================
//
// Seluruh komponen di bawah HANYA untuk role Central dan
// HANYA pada mode aggregate. Komponen ini murni presentation:
// tidak ada fetch, query, cache, navigasi, maupun handler
// yang mengubah filter halaman.
//
// ATURAN DATA — dikunci:
//   - scope.totalStores, stores[].totals, stores[].totalEmployees,
//     summary.byJenis, dan summary.total dipakai APA ADANYA dari
//     server. Client TIDAK menghitung ulang dari records.
//   - stores[].totalEmployees berarti "karyawan dengan minimal
//     satu incident pada periode ini", BUKAN jumlah seluruh
//     karyawan toko. Teks label memakai kalimat itu.
//   - Lima jenis error tetap memakai TONE masing-masing sebagai
//     identitas, sementara blok rekap memakai ACCENT_UTAMA.
//   - Modul ini tetap murni pencatatan kejadian error. Tidak ada
//     angkarencana, capaian, atau badge thereof di sini.
//
// Pola visual mengikuti bahasa desain halaman agregasi
// penjualan: Card dengan h-1 gradient bar di atas, icon tile,
// judul tracking-tight, KPI card kecil dengan hover lift, dan
// grid kartu toko yang bisa diklik. Yang disalin hanya
// estetika; konsep lain dari halaman tersebut tidak ikut
// terbawa.

// Komponen ini dipakai OLEH DUA blok: dashboard rekap (mode
// aggregate) dan dashboard detail toko, sehingga keduanya
// membaca sebagai satu sistem visual yang sama.
function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = ACCENT_UTAMA,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: {
    text: string
    bar: string
    card: string
  }
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-3",
        "transition-[transform,box-shadow] duration-200",
        "hover:-translate-y-0.5",
        tone.card,
      )}
    >
      {/* Hairline tipis di tepi atas. Murni visual. */}
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

function AggregateStoreCard({
  store,
  onSelect,
}: {
  store: MonitoringErrorAggregateStore
  onSelect: (storeId: string) => void
}) {
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
            {/* totalEmployees = karyawan dengan minimal satu
                incident pada periode ini, bukan seluruh
                karyawan toko. */}
            {store.totalEmployees} karyawan dengan incident
          </p>
        </div>

        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      {store.totals.total > 0 ? (
        <div className="space-y-2">
          {MONITORING_ERROR_JENIS_LIST.map((jenis) => {
            const tone = TONE[jenis]
            const value = store.totals[jenis] ?? 0

            return (
              <div
                key={jenis}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                  {/* Titik warna memakai TONE jenis sebagai
                      identitas. Tidak ada bar, gauge, atau
                      meter di sini supaya tidak terbaca sebagai
                      visualisation capaian. */}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      value > 0 ? tone.text : "bg-border",
                    )}
                  />
                  {MONITORING_ERROR_JENIS_LABEL[jenis]}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    value > 0
                      ? tone.text
                      : "text-muted-foreground",
                  )}
                >
                  {value}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Belum ada kejadian human error pada periode ini.
          </p>
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

function AggregateDashboard({
  data,
  onSelectStore,
  cabangNama,
  monthLabel,
}: {
  data: MonitoringErrorAggregate
  onSelectStore: (storeId: string) => void
  // HANYA untuk teks tampilan. data.scope.cabangId (ID) tetap
  // dipakai untuk seluruh logic dan parameter API.
  cabangNama: string
  monthLabel: string
}) {
  const { scope, stores, summary } = data
  const accent = ACCENT_UTAMA

  const totalStores =
    typeof scope.totalStores === "number" && scope.totalStores > 0
      ? scope.totalStores
      : stores.length

  return (
    <div className="space-y-5">
      {/* ======================================== */}
      {/* HEADER REKAP                          */}
      {/* ======================================== */}
      <Card
        className={cn(
          "overflow-hidden",
          accent.card,
          "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
        )}
      >
        <div
          className={cn("h-1 w-full", accent.bar, accent.barGlow)}
        />
        <div className="space-y-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-xl",
                accent.soft,
                accent.text,
                accent.icon,
              )}
            >
              <Layers className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">
                Rekap Monitoring Error
              </h2>
              <p className="text-xs text-muted-foreground">
                {scope.cabangId
                  ? `${cabangNama || scope.cabangId} · Periode ${monthLabel}`
                  : `Seluruh toko dalam cakupan akun · Periode ${monthLabel}`}
              </p>
            </div>
          </div>

          {/* KPI RINGKASAN — angka apa adanya dari server. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label="Total Error"
              value={String(summary.total)}
              hint="Seluruh toko dalam cakupan"
              icon={TriangleAlert}
            />
            {MONITORING_ERROR_JENIS_LIST.map((jenis) => (
              <KpiCard
                key={jenis}
                label={MONITORING_ERROR_JENIS_LABEL[jenis]}
                value={String(summary.byJenis[jenis] ?? 0)}
                icon={ShieldAlert}
                tone={{
                  text: TONE[jenis].text,
                  bar: TONE[jenis].soft,
                  card: TONE[jenis].card,
                }}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* ======================================== */}
      {/* REKAP PER TOKO                       */}
      {/* ======================================== */}
      <Card
        className={cn(
          "overflow-hidden",
          accent.card,
          "shadow-[0_1px_0_0_rgba(0,0,0,0.02)]",
        )}
      >
        <div
          className={cn("h-1 w-full", accent.bar, accent.barGlow)}
        />
        <div className="space-y-4 px-4 py-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">
              Rekap per Toko
            </h2>
            <p className="text-sm text-muted-foreground">
              {/*Angka jumlah toko diambil dari server lewat
                  scope.totalStores. stores.length hanya dipakai
                  sebagai fallback tampilan bila server tidak
                  mengirim nilai tersebut. */}
              {totalStores} toko
              {scope.cabangId
                ? ` pada cabang ${cabangNama || scope.cabangId}`
                : ""}
              . Klik satu toko untuk melihat dashboard detail toko
              tersebut.
            </p>
          </div>

          {stores.length === 0 ? (
            <EmptyState
              title="Belum ada toko"
              description="Cabang ini belum memiliki toko aktif. Hubungi admin untuk menambahkan toko."
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
        </div>
      </Card>
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
  // Terisi = drill-down per kategori jenis error (dipakai angka
  // pada kolom kategori).
  // Kosong = SEMUA jenis error milik karyawan (dipakai icon mata
  // pada kolom DETAIL).
  jenis?: MonitoringErrorJenis
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
  const [branchOptions, setBranchOptions] = React.useState<
    { cabangId: string; nama: string }[]
  >([])
  const [branchesLoading, setBranchesLoading] =
    React.useState(false)

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

        // cabangId tetap dipakai sebagai nilai (value) dropdown
        // dan seluruh logic. nama hanya untuk teks label.
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
  // PEMILIHAN TOKO
  //   STORE          -> tokonya sendiri (tanpa selector)
  //   CENTRAL CABANG -> rekap seluruh toko aktif pada cabangnya,
  //                     lalu klik satu toko untuk masuk detail
  //   CENTRAL PUSAT  -> pilih cabang, lalu rekap seluruh toko
  //                     aktif pada cabang itu
  //
  // Toko yang sedang dibaca pada mode DETAIL.
  // Untuk role Store selalu tokonya sendiri dan TIDAK pernah
  // kosong, sehingga role Store tidak pernah masuk mode
  // aggregate.
  // ----------------------------------------------------------

  const [storeFilter, setStoreFilter] = React.useState("")

  // Nama toko pada header mode detail. Diisi saat Central
  // mengklik kartu toko pada rekap, dan dikuatkan lagi dari
  // response detail. HANYA untuk teks tampilan.
  const [detailStoreName, setDetailStoreName] =
    React.useState("")

  // Penanda perubahan data yang memaksa fetch ulang (setelah
  // simpan / ubah / hapus). Dipakai bersama cache rekap.
  const [reloadKey, setReloadKey] = React.useState(0)
  const requestSeqRef = React.useRef(0)

  // ----------------------------------------------------------
  // CACHE REKAP (IN-MEMORY SAJA)
  //
  // Dipakai hanya agar perpindahan detail toko -> rekap tidak
  // memicu fetch ulang untuk cabang + periode yang sama. TIDAK
  // ada localStorage, Firestore, collection, atau cache persisten.
  // ----------------------------------------------------------

  // Kunci cache memuat identitas scope yang sebenarnya, BUKAN
  // hanya role + cabang terpilih. Untuk Central Cabang
  // `cabangFilter` memang selalu kosong (cabang berasal dari
  // profile), jadi cabang profile WAJIB ikut masuk kunci.
  // `user.uid` juga dimasukkan supaya data akun sebelumnya tidak
  // pernah tampil bila component bertahan saat user berganti.
  const aggregateCacheKey = [
    role,
    user?.uid ?? "-",
    profile?.cabangId ?? "-",
    profile?.storeId ?? "-",
    cabangFilter,
    periode,
  ].join("::")
  const aggregateCacheRef = React.useRef<{
    key: string
    data: MonitoringErrorAggregate
  } | null>(null)
  // Ditulis BERSAMAAN dengan setAggregate supaya render pertama
  // sudah melihat rekap yang tersedia. Dipakai oleh detailLocked.
  const aggregateReadyRef = React.useRef(false)
  const handledReloadKeyRef = React.useRef(reloadKey)

  const activeStoreId = isStore
    ? (profile?.storeId ?? "")
    : storeFilter

  // Central Pusat belum memilih cabang.
  const pusatLocked = isCentralPusat && !cabangFilter
  // Central belum memilih toko -> sedang menampilkan dashboard
  // rekap seluruh toko aktif dalam scope cabangnya (mode
  // aggregate). Central TIDAK lagi terjebak di pemilih toko.
  const storeLocked = isCentral && !storeFilter
  // Dashboard rekap (aggregate) dan dashboard detail toko HARUS
  // saling terpisah:
  //   - `storeLocked`    -> sedang mode aggregate, jadi blok
  //     detail TIDAK boleh dirender sama sekali.
  //   - `pusatLocked`    -> belum ada cabang, baru pemilih
  //     cabang; belum ada rekap maupun detail.
  //   - `!activeStoreId` -> scope toko belum pasti.
  // Jika salah satu terpenuhi, blok detail disembunyikan.
  const detailLocked =
    pusatLocked || storeLocked || !activeStoreId

  // ----------------------------------------------------------
  // DATA (GET /api/monitoring-error)
  //
  // Dua mode dari server yang sama:
  //   DETAIL    -> 1 toko, bentuk response tidak berubah
  //   AGGREGATE -> seluruh toko AKTIF pada satu cabang
  //
  // State detail dan state aggregate SELALU terpisah dan tidak
  // pernah dipakai bergantian. Angka aggregate tidak pernah
  // dihitung ulang di client.
  // ----------------------------------------------------------

  const [records, setRecords] = React.useState<MonitoringErrorRecord[]>([])
  const [rows, setRows] = React.useState<MonitoringErrorEmployeeRow[]>([])
  const [totals, setTotals] = React.useState(() => ({
    ...emptyRowByJenis(),
    total: 0,
  }))

  const [aggregate, setAggregate] =
    React.useState<MonitoringErrorAggregate | null>(null)

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!profile || !user) {
      setLoading(false)
      return
    }

    // Central Pusat belum memilih cabang: TIDAK ada request apa
    // pun, sehingga tidak pernah membaca seluruh cabang.
    if (pusatLocked) {
      setLoading(false)
      setRecords([])
      setRows([])
      setTotals({ ...emptyRowByJenis(), total: 0 })
      setAggregate(null)
      aggregateReadyRef.current = false
      return
    }

    // Kembali dari detail toko ke rekap: rekap sebelumnya masih
    // berlaku untuk cabang + periode yang sama, sehingga dipakai
    // langsung tanpa fetch lagi.
    const forceReload =
      reloadKey !== handledReloadKeyRef.current
    handledReloadKeyRef.current = reloadKey

    if (storeLocked) {
      const cached = aggregateCacheRef.current

      if (
        !forceReload &&
        cached &&
        cached.key === aggregateCacheKey
      ) {
        setError("")
        setRecords([])
        setRows([])
        setTotals({ ...emptyRowByJenis(), total: 0 })
        setAggregate(cached.data)
        aggregateReadyRef.current = true
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
        // Central yang belum memilih toko -> parameter "store"
        // TIDAK dikirim, sehingga server memakai mode REKAP
        // untuk seluruh toko aktif dalam scope cabangnya.
        // Untuk role Store parameter store TIDAK dikirim: server
        // selalu memakai user.storeId dan mode detail.
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
          mode?: string
          storeName?: string
          records?: MonitoringErrorRecord[]
          rows?: MonitoringErrorEmployeeRow[]
          totals?: Record<string, number>
          scope?: MonitoringErrorScope
          stores?: MonitoringErrorAggregateStore[]
          summary?: {
            byJenis?: Record<string, number>
            total?: number
          }
        }

        if (!response.ok || !result.success) {
          throw new Error(
            result?.message ??
              "Data Monitoring Error tidak dapat dimuat.",
          )
        }

        if (cancelled || seq !== requestSeqRef.current) return

        // Bentuk aggregate dan bentuk detail TIDAK pernah dipakai
        // bergantian: mode dari server yang menentukan.
        if (result.mode === "aggregate") {
          const byJenis: Record<string, number> = {}

          for (const jenis of MONITORING_ERROR_JENIS_LIST) {
            byJenis[jenis] = Number(
              result.summary?.byJenis?.[jenis] ?? 0,
            )
          }

          const nextAggregate: MonitoringErrorAggregate = {
            periode: periode,
            scope: result.scope ?? {
              role,
              level: "",
              cabangId: "",
              totalStores: 0,
            },
            stores: Array.isArray(result.stores)
              ? result.stores
              : [],
            // summary dipakai APA ADANYA dari server. Nilai
            // per-jenis dinormalisasi hanya agar tipenya konsisten,
            // tidak dijumlah ulang dari records.
            summary: {
              byJenis,
              total: Number(result.summary?.total ?? 0),
            },
          }

          aggregateCacheRef.current = {
            key: aggregateCacheKey,
            data: nextAggregate,
          }

          setAggregate(nextAggregate)
          aggregateReadyRef.current = true
          setRecords([])
          setRows([])
          setTotals({ ...emptyRowByJenis(), total: 0 })
          return
        }

        // MODE DETAIL. Bentuk response tidak diubah dari
        // sebelum Phase 5.
        setAggregate(null)
        aggregateReadyRef.current = false

        const responseStoreName = String(
          result.storeName ?? "",
        ).trim()
        if (responseStoreName) {
          setDetailStoreName(responseStoreName)
        }

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
    isCentralPusat,
    pusatLocked,
    storeLocked,
    isCentral,
    periode,
    role,
    aggregateCacheKey,
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
        (detail.jenis === undefined ||
          r.jenisError === detail.jenis),
    )
  }, [detail, records])

  // Kelompok per jenis error untuk mode "semua jenis" (icon
  // mata). Urutan memakai MONITORING_ERROR_JENIS_LIST supaya
  // konsisten dengan urutan kolom pada tabel dashboard. Data
  // diambil dari `records` yang SUDAH ada di memori — tidak ada
  // request atau Firestore read tambahan.
  const detailGroups = React.useMemo(() => {
    return MONITORING_ERROR_JENIS_LIST.map(
      (jenis) => ({
        jenis,
        records: detailRecords.filter(
          (r) => r.jenisError === jenis,
        ),
      }),
    ).filter((group) => group.records.length > 0)
  }, [detailRecords])

  // ----------------------------------------------------------
  // BATAS AREA DAFTAR — maksimal 6 kejadian terlihat
  // ----------------------------------------------------------
  //
  // Tinggi area daftar DIBATAS, bukan dipotong. Kejadian ke-7
  // dan seterusnya tetap utuh dan hanya bisa dilihat lewat
  // scroll vertikal pada area daftar. Header modal, nama
  // karyawan, periode, total error, dan tombol Tutup berada
  // di luar area ini sehingga tidak ikut bergerak dan halaman
  // belakang tidak ikut bergeser.
  //
  // Angka 6 diturunkan dari struktur card existing, bukan dari
  // perkiraan viewport:
  //   - tinggi 1 card  = py-2 (16) + text-sm (20) + text-xs
  //                      (16) + border (2)
  //   - jarak 1 item  = space-y-2
  //   - tinggi judul kelompok jenis (h4 + badge)
  //   - jarak antar kelompok = space-y-4
  //
  // Card existing tidak dikecilkan dan tidak dikunci
  // tingginya, sehingga keterangan panjang tetap terbaca
  // utuh. Keterangan yang lebih tinggi dari rata-rata hanya
  // membuat area daftar menampilkan lebih sedikit dari 6 item,
  // dan sisanya tetap dapat di-scroll.
  const detailListMaxHeight = React.useMemo(() => {
    if (detailRecords.length === 0) {
      return undefined
    }

    // 6 kejadian PERTAMA dihitung menurut urutan TAMPIL.
    // Daftar dirender per kelompok jenis (detailGroups), jadi
    // urutan yang dihitung HARUS ikut urutan kelompok — bukan
    // urutan tanggal milik detailRecords. Kalau memakai urutan
    // tanggal, jumlah judul kelompok bisa berbeda dari yang
    // benar-benar tampil sebelum kejadian ke-6, sehingga area
    // jadi terlalu tinggi dan lebih dari 6 item terlihat.
    const firstItems = detailGroups
      .flatMap((group) => group.records)
      .slice(0, DETAIL_ITEM_VISIBLE)

    // Hanya kelompok yang sudah menumpuk 6 kejadian pertama
    // yang judulnya ikut terlihat. Kelompok berikutnya ikut
    // ter-scroll bersama kejadiannya.
    const headerCount = new Set(
      firstItems.map((r) => r.jenisError),
    ).size

    const itemsHeight =
      DETAIL_ITEM_VISIBLE * DETAIL_ITEM_HEIGHT +
      (DETAIL_ITEM_VISIBLE - 1) * DETAIL_ITEM_GAP

    const headersHeight =
      headerCount * DETAIL_GROUP_HEADER_HEIGHT +
      Math.max(0, headerCount - 1) * DETAIL_GROUP_GAP

    return itemsHeight + headersHeight
  }, [detailGroups, detailRecords])

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

  // ----------------------------------------------------------
  // NAMA CABANG UNTUK TAMPILAN SAJA
  //
  // Berlaku aturan yang sama seperti resolver display di atas:
  // HANYA menghasilkan teks. Idleks cabangId, parameter API,
  // query, dan seluruh logic TIDAK PERNAH memakai nilai ini.
  // ----------------------------------------------------------

  const aggregateScopeCabangId =
    aggregate?.scope.cabangId ?? ""

  const aggregateScopeNama = getCabangDisplayName(
    aggregateScopeCabangId || cabangFilter,
    branchOptions.find(
      (b) =>
        b.cabangId.toUpperCase() ===
        (aggregateScopeCabangId || cabangFilter || "").toUpperCase(),
    )?.nama,
  )

  // Nama toko pada header. Mode detail memakai nama dari
  // response API; mode rekap memakai "Seluruh Toko" + cabang.
  const headerSubtitle = isStore
    ? profile?.namaStore || profile?.storeId || "-"
    : storeLocked
      ? aggregateScopeNama
        ? `Seluruh Toko · ${aggregateScopeNama}`
        : "Seluruh Toko"
      : detailStoreName || activeStoreId || "-"

  // Tombol kembali memakai aksen rekap yang sama dengan blok
  // rekap, bukan warna link biasa.
  const backButtonClass = cn(
    "gap-1.5",
    "ring-1 ring-inset ring-[#EF3340]/30",
    "shadow-[0_0_16px_-8px] shadow-[#FF3B4D]/45",
    "transition-all duration-200",
    "hover:ring-[#EF3340]/60",
  )

  // Kembali dari detail toko ke rekap cabang. Rekap sebelumnya
  // masih berlaku untuk cabang + periode yang sama.
  function backToAggregate() {
    setStoreFilter("")
    setDetailStoreName("")
  }

  // Kembali ke pemilih cabang. Rekap cabang lama dibuang supaya
  // data cabang sebelumnya tidak pernah ikut tampil.
  function backToBranchPicker() {
    setCabangFilter("")
    setStoreFilter("")
    setDetailStoreName("")
    setAggregate(null)
    aggregateReadyRef.current = false
    aggregateCacheRef.current = null
  }

  return (
    <div className="space-y-5">
      {/* ============================================ */}
      {/* HEADER                                     */}
      {/* ============================================ */}

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Ikon sejajar dengan blok judul, mengikuti pola
              header halaman lain. Aksen memakai ACCENT_UTAMA;
              "destructive" tetap khusus untuk aksi merusak dan
              state error. */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                ACCENT_UTAMA.soft,
                ACCENT_UTAMA.text,
                "ring-1 ring-inset ring-[#EF3340]/30",
                "shadow-[0_0_18px_-4px] shadow-[#FF3B4D]/45",
              )}
            >
              <ShieldAlert className="size-5" />
            </span>

            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Monitoring Error
              </h1>
              <p className="text-xs text-muted-foreground">
                Program Kerja · {headerSubtitle}
              </p>
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
          {isCentralPusat && cabangFilter && storeLocked && (
            <Button
              type="button"
              variant="outline"
              onClick={backToBranchPicker}
              className={backButtonClass}
            >
              <ArrowLeft className="size-4" />
              Kembali Pilih Cabang
            </Button>
          )}

          {isCentral && storeFilter && (
            <Button
              type="button"
              variant="outline"
              onClick={backToAggregate}
              className={backButtonClass}
            >
              <ArrowLeft className="size-4" />
              Kembali ke Semua Toko
            </Button>
          )}

          {/* Tab Dashboard / History hanya bermakna pada mode
              DETAIL toko. Mode rekap memakai seluruh halaman
              untuk dashboard rekap; History memakai state
              `records` yang hanya terisi pada mode detail. */}
          {!pusatLocked && !storeLocked && (
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "dashboard", label: "Dashboard" },
                { value: "history", label: "History" },
              ]}
            />
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* CENTRAL PUSAT — BELUM MEMILIH CABANG          */}
      {/* ============================================ */}

      {pusatLocked && (
        <CentralBranchPicker
          branches={branchOptions}
          loading={branchesLoading}
          onSelect={(cabangId) => {
            setCabangFilter(cabangId)
            setStoreFilter("")
            setDetailStoreName("")
            // Ganti cabang -> rekap cabang sebelumnya dibuang.
            setAggregate(null)
            aggregateReadyRef.current = false
            aggregateCacheRef.current = null
          }}
        />
      )}

      {/* ============================================ */}
      {/* CENTRAL — MODE REKAP SELURUH TOKO CABANG     */}
      {/* ============================================ */}

      {!pusatLocked && isCentral && storeLocked && (
        <div className="space-y-5">
          {loading && <LoadingState label="Memuat rekap toko..." />}

          {!loading && error && (
            <EmptyState
              title={error}
              description="Silakan muat ulang halaman."
              icon={TriangleAlert}
            />
          )}

          {!loading && !error && aggregate && (
            <AggregateDashboard
              data={aggregate}
              cabangNama={aggregateScopeNama}
              monthLabel={monthLabel}
              onSelectStore={(storeId) => {
                // Nama toko diambil dari daftar toko pada response
                // aggregate sebelum masuk mode detail, supaya
                // header tidak berkedip sampai response detail
                // selesai.
                setDetailStoreName(
                  aggregate.stores.find(
                    (s) => s.storeId === storeId,
                  )?.storeName ?? "",
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
      {/* TAB: DASHBOARD TOKO (MODE DETAIL)            */}
      {/* ============================================ */}

      {!detailLocked && tab === "dashboard" && (
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
              {/* RINGKASAN PER JENIS
                  Memakai komponen KpiCard yang sama dengan blok
                  rekap supaya mode detail dan mode rekap terlihat
                  sebagai satu sistem. Angka dibaca apa adanya dari
                  `totals` hasil response server. */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <KpiCard
                  label="Total Error"
                  value={String(totals.total ?? 0)}
                  hint={isStore ? "Seluruh periode aktif" : "Toko ini"}
                  icon={TriangleAlert}
                />
                {MONITORING_ERROR_JENIS_LIST.map((jenis) => {
                  const value = totals[jenis] ?? 0

                  return (
                    <KpiCard
                      key={jenis}
                      label={MONITORING_ERROR_JENIS_LABEL[jenis]}
                      value={String(value)}
                      icon={ShieldAlert}
                      tone={{
                        text:
                          value > 0
                            ? TONE[jenis].text
                            : "text-muted-foreground",
                        bar:
                          value > 0
                            ? TONE[jenis].soft
                            : "bg-border",
                        card:
                          value > 0
                            ? TONE[jenis].card
                            : "",
                      }}
                    />
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
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-3 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="size-3.5 shrink-0" />
                              Nama Karyawan
                            </span>
                          </th>
                          {MONITORING_ERROR_JENIS_LIST.map(
                            (jenis) => (
                              <th
                                key={jenis}
                                className="px-3 py-3 text-center font-medium"
                              >
                                {
                                  MONITORING_ERROR_JENIS_LABEL[
                                    jenis
                                  ]
                                }
                              </th>
                            ),
                          )}
                          <th className="border-l border-border px-3 py-3 text-right font-medium text-foreground">
                            Total
                          </th>
                          <th className="px-3 py-3 text-center font-medium text-foreground">
                            Detail
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.employeeId}
                            className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                          >
                            <td
                              className="max-w-[240px] px-3 py-3"
                              title={row.employeeName || "-"}
                            >
                              <span className="block truncate text-sm font-semibold text-foreground">
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
                                    className="px-3 py-3 text-center"
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
                                        "inline-grid size-9 place-items-center rounded-lg text-sm font-bold tabular-nums transition-all duration-200",
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

                            <td className="whitespace-nowrap border-l border-border px-3 py-3 text-right text-base font-bold text-foreground tabular-nums">
                              {row.total}
                            </td>

                            {/* KOLOM DETAIL — icon mata membuka
                                modal seluruh error karyawan ini
                                pada periode aktif. Data diambil
                                dari `records` yang sudah dimuat;
                                tidak ada request tambahan. */}
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setDetail({
                                    employeeId: row.employeeId,
                                    employeeName:
                                      row.employeeName,
                                  })
                                }
                                disabled={row.total === 0}
                                className={cn(
                                  "inline-grid size-9 place-items-center rounded-lg transition-all duration-200",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                                  row.total > 0
                                    ? "text-muted-foreground hover:bg-primary/10 hover:text-primary hover:ring-1 hover:ring-inset hover:ring-primary/40"
                                    : "cursor-default text-muted-foreground/30",
                                )}
                                aria-label={`Detail seluruh error ${row.employeeName}`}
                                title={`Detail seluruh error ${row.employeeName}`}
                              >
                                <Eye className="size-4" />
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* TOTAL KESELURUHAN */}
                        <tr className="border-t-2 border-border bg-muted/50">
                          <td className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Total
                          </td>
                          {MONITORING_ERROR_JENIS_LIST.map(
                            (jenis) => {
                              const value =
                                totals[jenis] ?? 0

                              return (
                                <td
                                  key={jenis}
                                  className="px-3 py-3 text-center text-sm font-bold tabular-nums"
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
                          <td className="whitespace-nowrap border-l border-border px-3 py-3 text-right text-lg font-bold text-foreground tabular-nums">
                            {totals.total ?? 0}
                          </td>
                          <td className="px-3 py-3" />
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

      {!detailLocked && tab === "history" && (
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
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-3 font-medium">
                            Tanggal
                          </th>
                          <th className="px-3 py-3 font-medium">
                            Karyawan
                          </th>
                          <th className="px-3 py-3 font-medium">
                            Jenis Error
                          </th>
                          <th className="px-3 py-3 font-medium">
                            Keterangan
                          </th>
                          {isStore && (
                            <th className="px-3 py-3 text-right font-medium">
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
                              className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                            >
                              <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                                {formatTanggal(r.tanggal)}
                              </td>
                              <td className="px-3 py-3">
                                <span className="block text-sm font-semibold text-foreground">
                                  {r.employeeName || "-"}
                                </span>
                              </td>
                              <td className="px-3 py-3">
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
                              <td className="px-3 py-3 text-muted-foreground">
                                {showKeterangan(r) || "-"}
                              </td>

                              {isStore && (
                                <td className="px-3 py-3">
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
            ? detail.jenis === undefined
              ? detail.employeeName
              : `${MONITORING_ERROR_JENIS_LABEL[detail.jenis]} · ${detail.employeeName}`
            : "Detail"
        }
        description={`Periode ${monthLabel}. Total error: ${detailRecords.length} kejadian.`}
        footer={
          <Button
            type="button"
            variant="outline"
            onClick={() => setDetail(null)}
          >
            Tutup
          </Button>
        }
      >
        {detailRecords.length === 0 ? (
          <EmptyState
            title="Tidak ada kejadian"
            description="Belum ada kejadian pada kategori ini."
          />
        ) : detail?.jenis === undefined ? (
          // MODE SEMUA JENIS (kolom DETAIL) — dikelompokkan per
          // jenis error, seluruh kejadian karyawan ditampilkan.
          // Area daftar ini SATU-SATUNYA bagian yang boleh
          // scroll; header, total, dan tombol Tutup tetap diam.
          <div
            className="-mr-1 space-y-4 overflow-y-auto pr-1"
            style={{ maxHeight: detailListMaxHeight }}
          >
            {detailGroups.map((group) => (
              <section
                key={group.jenis}
                className="space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-wider",
                      TONE[group.jenis].text,
                    )}
                  >
                    {MONITORING_ERROR_JENIS_LABEL[group.jenis]}
                  </h4>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                      TONE[group.jenis].chip,
                    )}
                  >
                    {group.records.length}
                  </span>
                </div>

                <ul className="space-y-2">
                  {group.records.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                    >
                      <p className="text-sm font-medium">
                        {formatTanggal(r.tanggal)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Keterangan: {showKeterangan(r) || "-"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          // MODE PER KATEGORI (klik angka pada kolom jenis) —
          // isi daftar tetap sama, hanya area daftarnya yang
          // dibatasi tinggi dan bisa scroll.
          <ul
            className="-mr-1 space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight: detailListMaxHeight }}
          >
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
