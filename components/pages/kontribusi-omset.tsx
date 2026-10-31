"use client"

import * as React from "react"
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Store,
  Target,
  Trash,
} from "lucide-react"

import { useAuth } from "@/components/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import {
  Field,
  LoadingState,
  EmptyState,
  SelectField,
} from "@/components/controls"
import { getFirestoreEmployees } from "@/lib/firestore-data"
import type { KontribusiOmsetTargetRow } from "@/lib/kontribusi-omset/types"
import {
  getTodayJakarta,
  getDaysInMonth,
  hitungSisaHari,
  hitungSisaTarget,
  hitungTargetHarian,
} from "@/lib/kontribusi-omset/target-harian"
import { parseRupiahInput, formatRupiahNumber, formatDigitsWithThousandSeparators } from "@/lib/kontribusi-omset/format-rupiah"
import { getCabangDisplayName } from "@/lib/kontribusi-omset/cabang"
import { cn } from "@/lib/utils"
import type { FirestoreEmployee } from "@/lib/firestore-data"

type BranchOption = {
  cabangId: string
  nama: string
}

type StoreOption = {
  storeId: string
  namaStore: string
  cabangId: string
}

type DailyReportEmployee = {
  employeeId: string
  employeeName: string
  visitor: number
  omset: number
}

type DailyReport = {
  reportId: string
  storeId: string
  tanggal: string // YYYY-MM-DD
  employees: DailyReportEmployee[]
  totalVisitor: number
  totalOmset: number
  jumlahKaryawan: number
  inputBy?: string
  inputAt?: string
  updatedBy?: string
  updatedAt?: string
}

// Nominal omset maksimal per karyawan per tanggal realisasi
const OMSET_MAKS_PER_KARYAWAN = 100_000_000

function formatRupiahCompact(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  if (safe >= 1_000_000_000) {
    return `Rp${(safe / 1_000_000_000).toFixed(1)}M`
  }
  if (safe >= 1_000_000) {
    return `Rp${(safe / 1_000_000).toFixed(1)}Jt`
  }
  if (safe >= 1_000) {
    return `Rp${(safe / 1_000).toFixed(1)}Rb`
  }
  return `Rp${safe}`
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function formatPeriodeLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1))
}

function ScopeValue({
  value,
  muted = false,
}: {
  value: string
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      <span className="truncate">{value}</span>
    </div>
  )
}

// ============================================================
// WARNA IDENTITAS PER KARYAWAN
// Digunakan untuk membedakan kelompok kolom di tabel.
// ============================================================
const KARYAWAN_COLORS = [
  { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-500" },
  { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-500" },
  { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-500" },
  { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-500" },
  { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-500" },
  { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-500" },
  { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-500" },
  { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500" },
]

function getKaryawanColor(index: number) {
  return KARYAWAN_COLORS[index % KARYAWAN_COLORS.length]
}

function getKaryawanColorText(index: number) {
  return KARYAWAN_COLORS[index % KARYAWAN_COLORS.length].text
}

// ============================================================
// KARTU KPI TUNGGU PER KARYAWAN
// Gabungkan nama + semua metrik dalam satu kartu.
// ============================================================
function KpiCardPerKaryawan({
  karyawan,
  targetBulanan,
  targetTersedia,
  realisasiBulanan,
  sisaTarget,
  targetHariIni,
  pencapaian,
  onEditTarget,
}: {
  karyawan: { employeeId: string; employeeName: string }
  targetBulanan: number | null
  targetTersedia: boolean
  realisasiBulanan: number
  sisaTarget: number | null
  targetHariIni: number
  pencapaian: number | null
  onEditTarget: () => void
}) {
  const color = getKaryawanColorText(
    karyawan.employeeId.charCodeAt(0) % KARYAWAN_COLORS.length,
  )

  return (
    <Card className="overflow-hidden border border-l-4 border-l-2">
      <CardContent className="p-4 sm:p-5">
        {/* Header: Nama */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full",
                color,
                "bg-blue-500/20 text-blue-600",
              )}
            >
              <Target className="size-3" />
            </span>
            <p className="font-semibold text-sm leading-tight">
              {karyawan.employeeName}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {/* Target Bulan Ini */}
          <div className="rounded-lg border border-muted p-3">
            <p className="text-xs font-medium text-foreground">
              Target Bulan Ini
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {targetTersedia
                ? formatRupiahNumber(targetBulanan ?? 0)
                : formatRupiahNumber(0)}
            </p>
            {targetTersedia === false && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Target belum tersedia
              </p>
            )}
          </div>

          {/* Realisasi */}
          <div className="rounded-lg border border-muted p-3">
            <p className="text-xs font-medium text-foreground">
              Realisasi
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {formatRupiahNumber(realisasiBulanan)}
            </p>
          </div>

          {/* Sisa Target */}
          <div className="rounded-lg border border-muted p-3">
            <p className="text-xs font-medium text-foreground">
              Sisa Target
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {targetTersedia && sisaTarget !== null
                ? formatRupiahNumber(sisaTarget)
                : formatRupiahNumber(0)}
            </p>
          </div>

          {/* Persentase Pencapaian */}
          <div className="rounded-lg border border-muted p-3">
            <p className="text-xs font-medium text-foreground">
              Persentase Pencapaian
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {pencapaian !== null ? `${pencapaian.toFixed(1)}%` : "0%"}
            </p>
          </div>
        </div>

        {/* Target Hari Ini */}
        <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-medium text-foreground">
            Target Hari Ini
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-primary">
            {formatRupiahNumber(targetHariIni)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// MODAL ATUR TARGET TIM (SEMUA KARYAWAN SEKALUS)
// ============================================================
function TargetBulananFormModal({
  open,
  periodeLabel,
  storeName,
  karyawanList,
  karyawanTargets,
  nominalInputs,
  alasanInputs,
  onNominalInput,
  onAlasanInput,
  onClose,
  onSubmit,
  isSaving,
  errors,
}: {
  open: boolean
  periodeLabel: string
  storeName: string
  karyawanList: { employeeId: string; employeeName: string }[]
  karyawanTargets: Record<string, number | null>
  nominalInputs: Record<string, string>
  alasanInputs: Record<string, string>
  onNominalInput: (employeeId: string, value: string) => void
  onAlasanInput: (employeeId: string, value: string) => void
  onClose: () => void
  onSubmit: () => void
  isSaving: boolean
  errors: Record<string, string>
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atur Target Tim"
      description="Tetapkan target bulanan per karyawan untuk periode yang dipilih."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Periode">
            <ScopeValue value={periodeLabel} />
          </Field>
          <Field label="Toko">
            <ScopeValue value={storeName || "â€”"} muted={!storeName} />
          </Field>
        </div>

        <div className="rounded-lg border border-muted bg-muted/10 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Daftar Karyawan & Target Bulanan
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-foreground">
                  <th className="px-3 py-2 font-medium">Karyawan</th>
                  <th className="px-3 py-2 font-medium text-right tabular-nums w-32">
                    Target Bulanan (Rp)
                  </th>
                  <th className="px-3 py-2 font-medium text-right tabular-nums w-24">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted/50">
                {karyawanList.map((karyawan) => (
                  <tr key={karyawan.employeeId} className="group">
                    <td className="px-3 py-3">
                      <p className="font-medium text-sm truncate">
                        {karyawan.employeeName}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="relative w-full">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={nominalInputs[karyawan.employeeId] ?? ""}
                          onChange={createTargetInputHandler(
                            karyawan.employeeId,
                            onNominalInput,
                          )}
                          placeholder="0"
                          className={cn(
                            "h-9 w-auto rounded-lg border border-input bg-input px-3 pl-8 pr-2 text-sm text-right tabular-nums placeholder:text-muted-foreground",
                            errors[karyawan.employeeId]
                              ? "border-destructive ring-1 ring-destructive"
                              : "border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25",
                            "min-w-[80px] max-w-[128px]",
                          )}
                        />
                        {nominalInputs[karyawan.employeeId] !== "" && (
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                            Rp
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className={cn(
                        "text-[10px] font-medium",
                        karyawanTargets[karyawan.employeeId] !== null &&
                          karyawanTargets[karyawan.employeeId]! > 0
                          ? "text-emerald-600"
                          : "text-muted-foreground",
                      )}>
                        {                        karyawanTargets[karyawan.employeeId] !== null
                          ? karyawanTargets[karyawan.employeeId]! > 0
                            ? "Tersedia"
                            : "Rp0"
                          : "â€”"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {karyawanList.some((k) => errors[k.employeeId]) && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10">
              <p className="text-xs text-destructive font-medium mb-1">
                Perbaiki input berikut:
              </p>
              <ul className="text-xs text-destructive list-disc pl-4 space-y-1">
                {karyawanList
                  .filter((k) => errors[k.employeeId])
                  .map((k) => (
                    <li key={k.employeeId}>
                      {k.employeeName}: {errors[k.employeeId]}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Input kosong tidak akan menyimpan perubahan target untuk karyawan
            tersebut. Target baru tidak memerlukan alasan; edit target wajib
            disertai alasan minimal 10 karakter.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          Batal
        </Button>
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          {isSaving ? "Menyimpan..." : "Simpan Semua"}
        </Button>
      </div>
    </Modal>
  )
}

// Handler input Omset dengan format otomatis pemisah ribuan dan
// pemeliharaan posisi kursor.
function createOmsetInputHandler(
  employeeId: string,
  onKaryawanDataChange: (
    employeeId: string,
    field: "omset" | "visitor",
    value: string,
  ) => void,
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement
    const start = input.selectionStart ?? 0
    const rawValue = input.value

    const digits = rawValue.replace(/\D/g, "")
    const formatted = digits
      ? formatDigitsWithThousandSeparators(digits)
      : ""

    const dotsBeforeCaret =
      (rawValue.slice(0, start).match(/\./g) || []).length
    const digitsBeforeCaret =
      (rawValue.slice(0, start).match(/\d/g) || []).length

    onKaryawanDataChange(employeeId, "omset", formatted)

    requestAnimationFrame(() => {
      if (!input || input !== document.activeElement) return
      const totalDigits = digits.length
      const digitsFromRight = totalDigits - digitsBeforeCaret
      let dotsBeforeNewCaret = 0
      if (digitsFromRight >= 3) {
        dotsBeforeNewCaret = Math.floor(digitsFromRight / 3)
        if (digitsFromRight % 3 === 0 && digitsBeforeCaret > 0) {
          dotsBeforeNewCaret -= 1
        }
      }
      const newPos = Math.min(
        digitsBeforeCaret + dotsBeforeNewCaret,
        formatted.length,
      )
      input.setSelectionRange(newPos, newPos)
    })
  }
}

// Handler input nominal target bulanan dengan format otomatis pemisah ribuan
// dan pemeliharaan posisi kursor, mengikuti pola input realisasi yang sudah PASS.
function createTargetInputHandler(
  employeeId: string,
  onNominalInput: (employeeId: string, value: string) => void,
) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement
    const start = input.selectionStart ?? 0
    const rawValue = input.value

    const digits = rawValue.replace(/\D/g, "")
    const formatted = digits
      ? formatDigitsWithThousandSeparators(digits)
      : ""

    const dotsBeforeCaret =
      (rawValue.slice(0, start).match(/\./g) || []).length
    const digitsBeforeCaret =
      (rawValue.slice(0, start).match(/\d/g) || []).length

    onNominalInput(employeeId, formatted)

    requestAnimationFrame(() => {
      if (!input || input !== document.activeElement) return
      const totalDigits = digits.length
      const digitsFromRight = totalDigits - digitsBeforeCaret
      let dotsBeforeNewCaret = 0
      if (digitsFromRight >= 3) {
        dotsBeforeNewCaret = Math.floor(digitsFromRight / 3)
        if (digitsFromRight % 3 === 0 && digitsBeforeCaret > 0) {
          dotsBeforeNewCaret -= 1
        }
      }
      const newPos = Math.min(
        digitsBeforeCaret + dotsBeforeNewCaret,
        formatted.length,
      )
      input.setSelectionRange(newPos, newPos)
    })
  }
}

// Modal Input Realisasi Harian
function InputRealisasiHarianModal({
  open,
  tanggal,
  onTanggalChange,
  karyawanData,
  onKaryawanDataChange,
  isSaving,
  onClose,
  onSubmit,
  error,
  maxTanggal,
  storeName,
}: {
  open: boolean
  tanggal: string
  onTanggalChange: (value: string) => void
  karyawanData: {
    employeeId: string
    employeeName: string
    omset: string
    visitor: string
  }[]
  onKaryawanDataChange: (employeeId: string, field: "omset" | "visitor", value: string) => void
  isSaving: boolean
  onClose: () => void
  onSubmit: () => void
  error: string
  maxTanggal?: string
  storeName?: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Input Realisasi Harian"
      description="Catat realisasi omset per karyawan untuk tanggal terpilih."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Toko">
            <ScopeValue value={storeName || "Memuat toko..."} />
          </Field>
          <Field label="Tanggal">
            <input
              type="date"
              value={tanggal}
              onChange={(e) => onTanggalChange(e.target.value)}
              max={maxTanggal}
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
            />
          </Field>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Daftar Karyawan</p>
            {isSaving && <p className="text-xs text-muted-foreground">Menyimpan...</p>}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-36" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    Karyawan
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    Omset
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    Visitor
                  </th>
                </tr>
              </thead>
              <tbody>
                {karyawanData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Tidak ada karyawan aktif pada toko ini.
                    </td>
                  </tr>
                ) : (
                  karyawanData.map((row) => (
                    <tr key={row.employeeId} className="border-b border-border/60">
                      <td className="px-2 py-2">
                        <p className="truncate font-medium text-xs" title={row.employeeName}>
                          {row.employeeName}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="relative mx-auto w-full">
                          {row.omset !== "" && (
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              Rp
                            </span>
                          )}
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.omset}
                            onChange={createOmsetInputHandler(row.employeeId, onKaryawanDataChange)}
                            placeholder="Rp0"
                            className={cn(
                              "h-8 w-auto rounded-lg border border-input bg-card text-center text-xs tabular-nums",
                              row.omset !== "" ? "pl-7 pr-2" : "px-2",
                              "min-w-[80px] max-w-[128px]",
                            )}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.visitor}
                          onChange={(e) => onKaryawanDataChange(row.employeeId, "visitor", e.target.value)}
                          placeholder="0"
                          className="mx-auto block h-8 w-full max-w-[56px] rounded-lg border border-input bg-card px-1 text-center text-xs tabular-nums"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          Batal
        </Button>
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          {isSaving ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </Modal>
  )
}

export function KontribusiOmsetPage() {
  const { profile, user, loading: authLoading } = useAuth()
  const { showToast } = useToast()

  const role = (profile?.role ?? "").trim().toLowerCase()
  const isStore = role === "store"
  const isCentralCabang = role === "central_cabang"
  const isCentralPusat = role === "central_pusat"
  const isCentral = isCentralCabang || isCentralPusat

  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const [selectedBranch, setSelectedBranch] = React.useState("")
  const [selectedStore, setSelectedStore] = React.useState("")

  const [branches, setBranches] = React.useState<BranchOption[]>([])
  const [branchesLoading, setBranchesLoading] = React.useState(false)
  const [branchesError, setBranchesError] = React.useState("")
  const [branchesReloadKey, setBranchesReloadKey] = React.useState(0)

  const [stores, setStores] = React.useState<StoreOption[]>([])
  const [storeDisplayName, setStoreDisplayName] = React.useState<string | null | undefined>(undefined)
  const [storesLoading, setStoresLoading] = React.useState(false)
  const [storesError, setStoresError] = React.useState("")
  const [storesReloadKey, setStoresReloadKey] = React.useState(0)

  const [employees, setEmployees] = React.useState<FirestoreEmployee[]>([])
  const [employeesLoading, setEmployeesLoading] = React.useState(false)

  const [dailyReports, setDailyReports] = React.useState<DailyReport[]>([])
  const [dailyReportsLoading, setDailyReportsLoading] = React.useState(false)
  const dailyReportsRequestRef = React.useRef(0)

  const [targets, setTargets] = React.useState<KontribusiOmsetTargetRow[]>([])
  const [targetsLoading, setTargetsLoading] = React.useState(false)

  // Modal Atur Target Tim state
  const [targetModalOpen, setTargetModalOpen] = React.useState(false)
  const [targetNominalInputs, setTargetNominalInputs] = React.useState<Record<string, string>>({})
  const [targetAlasanInputs, setTargetAlasanInputs] = React.useState<Record<string, string>>({})
  const [isSavingTarget, setIsSavingTarget] = React.useState(false)
  const [targetErrors, setTargetErrors] = React.useState<Record<string, string>>({})

  // Modal Input Realisasi Harian state
  const [inputModalOpen, setInputModalOpen] = React.useState(false)
  const [inputTanggal, setInputTanggal] = React.useState(() => {
    const t = getTodayJakarta()
    return t ? `${t.year}-${pad2(t.month + 1)}-${pad2(t.date)}` : ""
  })
  const [inputKaryawanData, setInputKaryawanData] = React.useState<{
    employeeId: string
    employeeName: string
    omset: string
    visitor: string
  }[]>([])
  const [isSavingRealisasi, setIsSavingRealisasi] = React.useState(false)
  const [inputError, setInputError] = React.useState("")

  // Edit Realisasi Harian state
  const [editReportModalOpen, setEditReportModalOpen] = React.useState(false)
  const [editReportTanggal, setEditReportTanggal] = React.useState("")
  const [editReportData, setEditReportData] = React.useState<{
    employeeId: string
    employeeName: string
    omset: string
    visitor: string
  }[]>([])
  const [isEditingReport, setIsEditingReport] = React.useState(false)
  const [editReportError, setEditReportError] = React.useState("")

  // Hapus Realisasi Harian state
  const [deleteReportOpen, setDeleteReportOpen] = React.useState(false)
  const [deleteReportTanggal, setDeleteReportTanggal] = React.useState("")
  const [isDeletingReport, setIsDeletingReport] = React.useState(false)
  const [deleteReportError, setDeleteReportError] = React.useState("")

  const periodeLabel = formatPeriodeLabel(period.year, period.month)
  const periode = `${period.year}-${pad2(period.month + 1)}`

  const pusatLocked = isCentralPusat && !selectedBranch
  const storeScopeCabang = isCentralPusat
    ? selectedBranch
    : String(profile?.cabangId ?? "").trim().toUpperCase()

  // Load branches (Central Pusat)
  React.useEffect(() => {
    if (!isCentralCabang) {
      return
    }
    const cabangId = String(profile?.cabangId ?? "").trim().toUpperCase()
    if (cabangId) {
      setSelectedBranch(cabangId)
    }
  }, [isCentralCabang, profile?.cabangId])

  React.useEffect(() => {
    if (isCentralPusat && selectedBranch) {
      setSelectedStore("")
    }
  }, [isCentralPusat, selectedBranch])

  React.useEffect(() => {
    if (!isCentral || !user) {
      setBranches([])
      setBranchesLoading(false)
      setBranchesError("")
      return
    }
    const authedUser = user
    let cancelled = false
    setBranchesLoading(true)
    setBranchesError("")
    async function loadBranches() {
      try {
        const idToken = await authedUser.getIdToken()
        const response = await fetch("/api/admin/branches", {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error("Daftar cabang tidak dapat dimuat.")
        }
        const result = (await response.json()) as {
          success?: boolean
          branches?: { cabangId?: string; nama?: string }[]
        }
        if (cancelled || !result.success) return
        const list = (result.branches ?? [])
          .map((branch) => ({
            cabangId: String(branch.cabangId ?? "").trim().toUpperCase(),
            nama: String(branch.nama ?? "").trim(),
          }))
          .filter((branch) => branch.cabangId)
          .sort((a, b) => a.cabangId.localeCompare(b.cabangId))
        setBranches(list)
      } catch (loadError) {
        console.error("Gagal memuat daftar cabang:", loadError)
        if (!cancelled) {
          setBranchesError("Daftar cabang belum dapat dimuat. Silakan coba lagi.")
        }
      } finally {
        if (!cancelled) {
          setBranchesLoading(false)
        }
      }
    }
    loadBranches()
    return () => { cancelled = true }
  }, [isCentral, user, branchesReloadKey])

  React.useEffect(() => {
    if (!isCentral || !user) {
      setStores([])
      setStoresLoading(false)
      setStoresError("")
      return
    }
    if (!storeScopeCabang) {
      setStores([])
      setStoresLoading(false)
      setStoresError("")
      return
    }
    const authedUser = user
    let cancelled = false
    setStoresLoading(true)
    setStoresError("")
    async function loadStores() {
      try {
        const idToken = await authedUser.getIdToken()
        const response = await fetch("/api/admin/stores", {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error("Daftar toko tidak dapat dimuat.")
        }
        const result = (await response.json()) as {
          success?: boolean
          stores?: { storeId?: string; namaStore?: string; cabangId?: string }[]
        }
        if (cancelled || !result.success) return
        const list = (result.stores ?? [])
          .map((store) => ({
            storeId: String(store.storeId ?? "").trim(),
            namaStore: String(store.namaStore ?? "").trim(),
            cabangId: String(store.cabangId ?? "").trim().toUpperCase(),
          }))
          .filter(
            (store) =>
              Boolean(store.storeId) &&
              store.cabangId === storeScopeCabang,
          )
          .sort((a, b) =>
            (a.namaStore || a.storeId).localeCompare(
              b.namaStore || b.storeId,
              "id",
              { sensitivity: "base" },
            ),
          )
        setStores(list)
      } catch (loadError) {
        console.error("Gagal memuat daftar toko:", loadError)
        if (!cancelled) {
          setStoresError("Daftar toko belum dapat dimuat. Silakan coba lagi.")
        }
      } finally {
        if (!cancelled) {
          setStoresLoading(false)
        }
      }
    }
    loadStores()
    return () => { cancelled = true }
  }, [isCentral, storeScopeCabang, user, storesReloadKey])

  React.useEffect(() => {
    if (!isStore || !user || !profile?.storeId) {
      setStoreDisplayName(undefined)
      return
    }

    if (profile?.namaStore) {
      setStoreDisplayName(profile.namaStore)
      return
    }

    let cancelled = false
    setStoreDisplayName(undefined)
    const authedUser = user
    async function loadStoreName() {
      try {
        const idToken = await authedUser.getIdToken()
        const response = await fetch("/api/admin/stores", {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        })
        if (!response.ok) {
          throw new Error("Gagal memuat nama toko.")
        }
        const result = (await response.json()) as {
          success?: boolean
          stores?: { storeId?: string; namaStore?: string }[]
        }
        if (cancelled || !result.success) return
        const store = (result.stores ?? []).find(
          (item) => String(item.storeId ?? "").trim() === String(profile?.storeId ?? "").trim(),
        )
        if (!cancelled) {
          setStoreDisplayName(store?.namaStore || null)
        }
      } catch (loadError) {
        console.error("Gagal memuat nama toko:", loadError)
        if (!cancelled) {
          setStoreDisplayName(null)
        }
      }
    }
    loadStoreName()
    return () => {
      cancelled = true
    }
  }, [isStore, user, profile?.storeId, profile?.namaStore])

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const next = new Date(current.year, current.month + offset, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const branchOption = branches.find((branch) => branch.cabangId === selectedBranch)
  const branchDisplayName = isCentralPusat
    ? branchOption
      ? getCabangDisplayName(branchOption.cabangId, branchOption.nama)
      : getCabangDisplayName(selectedBranch)
    : getCabangDisplayName(profile?.cabangId) ||
      branchOption?.nama ||
      profile?.cabangId ||
      "Cabang tidak dikenal"

  const selectedStoreOption = stores.find((store) => store.storeId === selectedStore)
  const storeLabel = isStore
    ? profile?.namaStore ||
      (storeDisplayName === undefined
        ? "Memuat toko..."
        : storeDisplayName || profile?.storeId || "Toko")
    : selectedStoreOption?.namaStore || "Semua Toko"

  const targetStoreId = isStore ? profile?.storeId ?? "" : selectedStore
  const targetStoreName = isStore
    ? profile?.namaStore ||
      (storeDisplayName === undefined
        ? "Memuat toko..."
        : storeDisplayName || profile?.storeId || "Toko")
    : selectedStoreOption?.namaStore || "Semua Toko"

  const singleStoreContext =
    Boolean(user) &&
    Boolean(targetStoreId) &&
    (isStore || (isCentral && Boolean(selectedBranch) && Boolean(selectedStore)))

  // Load employees (active only)
  React.useEffect(() => {
    const storeIdForEmployees = isStore ? profile?.storeId : selectedStore
    if ((!isStore && !isCentral) || !storeIdForEmployees) {
      setEmployees([])
      return
    }
    let cancelled = false
    setEmployeesLoading(true)
    getEmployees(storeIdForEmployees)
      .then((list) => {
        if (!cancelled) {
          setEmployees(Array.isArray(list) ? list : [])
        }
      })
      .catch((err) => {
        console.error("Gagal memuat karyawan:", err)
        if (!cancelled) {
          setEmployees([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEmployeesLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [isStore, isCentral, profile?.storeId, selectedStore])

  async function getEmployees(storeId: string): Promise<FirestoreEmployee[]> {
    return getFirestoreEmployees(storeId)
  }

  // Load daily reports
  const loadReports = async () => {
    if (authLoading) {
      setDailyReportsLoading(false)
      return
    }
    if (!isStore && !isCentral) {
      setDailyReports([])
      setDailyReportsLoading(false)
      return
    }
    if (!user) {
      setDailyReports([])
      setDailyReportsLoading(false)
      return
    }
    const requestId = ++dailyReportsRequestRef.current
    setDailyReportsLoading(true)
    try {
      const authedUser = user
      const idToken = await authedUser.getIdToken()
      const params = new URLSearchParams({
        year: String(period.year),
        month: String(period.month),
      })
      let url = "/api/kontribusi-omset/reports?" + params.toString()
      if (isCentralPusat) {
        if (!selectedBranch) {
          setDailyReports([])
          return
        }
        url += "&cabang=" + encodeURIComponent(selectedBranch)
        if (selectedStore) {
          url += "&store=" + encodeURIComponent(selectedStore)
        }
      }
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${idToken}` },
        cache: "no-store",
      })
      if (!response.ok) {
        throw new Error("Gagal memuat laporan omset.")
      }
      const result = (await response.json()) as {
        success?: boolean
        reports?: DailyReport[]
      }
      if (requestId === dailyReportsRequestRef.current && result.success) {
        setDailyReports(result.reports ?? [])
      }
    } finally {
      if (requestId === dailyReportsRequestRef.current) {
        setDailyReportsLoading(false)
      }
    }
  }

  React.useEffect(() => {
    loadReports().catch((loadError) => {
      console.error("Gagal memuat laporan omset:", loadError)
      showToast("error", "Gagal memuat laporan", "Laporan omset belum dapat dimuat. Silakan coba lagi.")
    })
  }, [isStore, isCentral, isCentralPusat, period, selectedBranch, selectedStore, user, authLoading])

  // Load targets per employee
  const loadTargets = async () => {
    if (authLoading) {
      setTargetsLoading(false)
      return
    }
    if (!isStore && !isCentral) {
      setTargets([])
      setTargetsLoading(false)
      return
    }
    if (!user) {
      setTargets([])
      setTargetsLoading(false)
      return
    }
    if (!targetStoreId) {
      setTargets([])
      setTargetsLoading(false)
      return
    }
    const authedUser = user
    let cancelled = false
    setTargetsLoading(true)
    try {
      const idToken = await authedUser.getIdToken()
      const fetchedTargets: KontribusiOmsetTargetRow[] = []

      for (const emp of activeEmployees) {
        const params = new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
          store: targetStoreId,
          employeeId: emp.id,
        })
        const url = "/api/kontribusi-omset/target?" + params.toString()
        const response = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        })
        if (!response.ok) continue
        const result = (await response.json()) as {
          success?: boolean
          message?: string
          targets?: KontribusiOmsetTargetRow[]
        }
        if (cancelled || !result?.success) continue
        fetchedTargets.push(...(Array.isArray(result.targets) ? result.targets : []))
      }

      if (cancelled) return
      setTargets(fetchedTargets)
    } catch (loadError) {
      console.error("Gagal memuat target:", loadError)
      if (!cancelled) {
        setTargets([])
        setTargetsLoading(false)
      }
    } finally {
      if (!cancelled) {
        setTargetsLoading(false)
      }
    }
    return () => { cancelled = true }
  }

  React.useEffect(() => {
    loadTargets()
  }, [isStore, isCentral, isCentralPusat, period, selectedBranch, selectedStore, targetStoreId, employees, user, authLoading])

  // Initialize target modal inputs when employees change
  React.useEffect(() => {
    if (!targetModalOpen) return
    const newInputs: Record<string, string> = {}
    const newAlasan: Record<string, string> = {}
    for (const emp of employees.filter((e) => e.aktif !== false)) {
      const target = targets.find((t) => t.employeeId === emp.id && t.targetTersedia)
      newInputs[emp.id] = target?.targetBulanan != null ? Number(target.targetBulanan).toLocaleString("id-ID") : ""
      newAlasan[emp.id] = ""
    }
    setTargetNominalInputs(newInputs)
    setTargetAlasanInputs(newAlasan)
    setTargetErrors({})
  }, [employees, targets, targetModalOpen])

  // Derived computations
  const activeEmployees = employees.filter((emp) => emp.aktif !== false)

  // Map employeeId -> target
  const targetMap = new Map<string, KontribusiOmsetTargetRow | null>()
  for (const emp of activeEmployees) {
    const target = targets.find((t) => t.employeeId === emp.id && t.targetTersedia)
    targetMap.set(emp.id, target || null)
  }

  // Map tanggal -> report
  const reportsByDate = new Map<string, DailyReport>()
  for (const r of dailyReports) {
    reportsByDate.set(r.tanggal, r)
  }

  const daysInMonth = getDaysInMonth(period.year, period.month)
  const todayJakarta = getTodayJakarta()
  const todayJakartaDateStr = todayJakarta
    ? `${todayJakarta.year}-${pad2(todayJakarta.month + 1)}-${pad2(todayJakarta.date)}`
    : null
  const todayPeriode = todayJakarta
    ? `${todayJakarta.year}-${pad2(todayJakarta.month + 1)}`
    : null
  const isPastMonth = todayPeriode !== null && periode < todayPeriode
  const sisaHari = hitungSisaHari(period.year, period.month, todayJakarta)
  const periodeAdjustable = todayPeriode !== null ? periode >= todayPeriode : false

  // KPI data per employee
  const karyawanKPI = activeEmployees.map((emp) => {
    const target = targetMap.get(emp.id)
    const targetBulanan = target?.targetBulanan ?? null
    const targetTersedia = target?.targetTersedia ?? false

    // Realisasi from daily reports
    let realisasiBulanan = 0
    let realisasiSebelumHariIni = 0
    for (const r of dailyReports) {
      const empReport = r.employees.find((e) => e.employeeId === emp.id)
      if (empReport) {
        realisasiBulanan += empReport.omset
        if (r.tanggal !== todayJakartaDateStr) {
          realisasiSebelumHariIni += empReport.omset
        }
      }
    }

    const sisaTarget = targetBulanan !== null ? hitungSisaTarget(targetBulanan, realisasiBulanan) : null
    const pencapaian = targetBulanan !== null && targetBulanan > 0 ? (realisasiBulanan / targetBulanan) * 100 : null
    const sisaTargetSebelumHariIni = targetBulanan !== null ? hitungSisaTarget(targetBulanan, realisasiSebelumHariIni) : null
    const targetHariIni = sisaTarget !== null && sisaHari > 0
      ? hitungTargetHarian(sisaTarget, sisaHari) ?? 0
      : 0

    return {
      employeeId: emp.id,
      employeeName: (emp as any).nama || emp.name || emp.id,
      targetBulanan,
      targetTersedia,
      realisasiBulanan,
      sisaTarget,
      pencapaian,
      targetHariIni,
    }
  })

  // Target modal handlers
  const TARGET_MAKS_INPUT = 1_000_000_000_000 - 1

  function openTargetModal() {
    if (isSavingTarget) return
    // Initialize inputs from current targets
    const newInputs: Record<string, string> = {}
    const newAlasan: Record<string, string> = {}
    const newErrors: Record<string, string> = {}
    for (const emp of activeEmployees) {
      const target = targets.find((t) => t.employeeId === emp.id && t.targetTersedia)
      newInputs[emp.id] = target?.targetBulanan != null ? Number(target.targetBulanan).toLocaleString("id-ID") : ""
      newAlasan[emp.id] = ""
      newErrors[emp.id] = ""
    }
    setTargetNominalInputs(newInputs)
    setTargetAlasanInputs(newAlasan)
    setTargetErrors(newErrors)
    setTargetModalOpen(true)
  }

  function updateTargetNominalInput(employeeId: string, value: string) {
    const current = targetNominalInputs[employeeId] ?? ""
    const nextValue =
      current === "0" ? value.replace(/^0+/, "") || "" : value
    setTargetNominalInputs((prev) => ({ ...prev, [employeeId]: nextValue }))
    setTargetErrors((prev) => ({ ...prev, [employeeId]: "" }))
  }

  function updateTargetAlasanInput(employeeId: string, value: string) {
    setTargetAlasanInputs((current) => ({ ...current, [employeeId]: value }))
  }

  async function performSaveTarget() {
    if (isSavingTarget) return
    if (!user) return
    if (!isStore && !isCentral) {
      showToast("error", "Role akun tidak memiliki kewenangan menetapkan target omset.")
      return
    }
    if (!targetStoreId) {
      showToast("error", "Pilih satu toko untuk menetapkan target.")
      return
    }
    if (!periodeAdjustable) {
      showToast("error", "Target bulan lampau tidak dapat dibuat atau diubah.")
      return
    }

    // Validate all inputs
    const newErrors: Record<string, string> = {}
    const targetsToSave: Array<{
      employeeId: string
      targetBulanan: number
      alasan: string
      mode: "create" | "edit"
    }> = []

    let hasError = false
    for (const emp of activeEmployees) {
      const nominal = targetNominalInputs[emp.id] ?? ""
      const parsed = parseRupiahInput(nominal)

      if (nominal === "" || nominal.trim() === "") {
        // Empty input - skip (don't save)
        continue
      }

      if (!Number.isFinite(parsed) || parsed < 0 || parsed > TARGET_MAKS_INPUT) {
        newErrors[emp.id] = "Nominal target harus angka Rupiah nonnegatif yang valid."
        hasError = true
        continue
      }

      const existingTarget = targets.find((t) => t.employeeId === emp.id && t.targetTersedia)
      const mode: "create" | "edit" = existingTarget ? "edit" : "create"
      const alasan = targetAlasanInputs[emp.id] ?? ""

      targetsToSave.push({
        employeeId: emp.id,
        targetBulanan: parsed,
        alasan: alasan.trim(),
        mode,
      })
    }

    if (hasError) {
      setTargetErrors(newErrors)
      return
    }

    if (targetsToSave.length === 0) {
      showToast("info", "Tidak ada perubahan", "Tidak ada target yang diubah.")
      setTargetModalOpen(false)
      return
    }

    setIsSavingTarget(true)
    try {
      const idToken = await user.getIdToken()
      let successCount = 0
      let failureCount = 0

      // Save all targets sequentially
      for (const t of targetsToSave) {
        const response = await fetch("/api/kontribusi-omset/target", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storeId: targetStoreId,
            employeeId: t.employeeId,
            periode,
            targetBulanan: t.targetBulanan,
            alasan: t.alasan,
            mode: t.mode,
          }),
        })
        const result = (await response.json().catch(() => null)) as
          | { success?: boolean; message?: string }
          | null

        if (!response.ok || !result?.success) {
          failureCount++
          setTargetErrors((current) => ({
            ...current,
            [t.employeeId]: result?.message ?? "Gagal menyimpan target.",
          }))
        } else {
          successCount++
        }
      }

      // Refresh targets after save
      await loadTargets()

      setTargetNominalInputs({})
      setTargetAlasanInputs({})

      if (failureCount === 0 && successCount > 0) {
        setTargetModalOpen(false)
        setTargetErrors({})
        showToast("success", "Target tersimpan", "Target bulanan karyawan telah diperbarui.")
      } else if (failureCount > 0 && successCount > 0) {
        showToast("info", "Sebagian tersimpan", `${successCount} target tersimpan, ${failureCount} gagal. Silakan perbaiki yang gagal dan coba lagi.`)
      } else if (failureCount > 0) {
        showToast("error", "Gagal menyimpan", `Gagal menyimpan target untuk ${failureCount} karyawan. Silakan coba lagi.`)
      }
    } catch (err) {
      showToast("error", "Gagal menyimpan", "Terjadi kesalahan saat menyimpan target.")
    } finally {
      setIsSavingTarget(false)
    }
  }

  // Input realisasi handlers
  function updateInputKaryawanData(employeeId: string, field: "omset" | "visitor", value: string) {
    setInputKaryawanData((current) =>
      current.map((row) =>
        row.employeeId === employeeId ? { ...row, [field]: value } : row
      ),
    )
  }

  function updateEditReportData(
    employeeId: string,
    field: "omset" | "visitor",
    value: string
  ) {
    setEditReportData((current) =>
      current.map((row) =>
        row.employeeId === employeeId ? { ...row, [field]: value } : row
      ),
    )
  }

  function handleInputTanggalChange(value: string) {
    setInputTanggal(value)
    if (value && reportsByDate.has(value)) {
      setInputError(
        "Laporan untuk tanggal ini sudah tersedia. Silakan gunakan tombol Edit pada laporan tersebut untuk melakukan perubahan.",
      )
    } else {
      setInputError("")
    }
  }

  async function handleSaveRealisasi() {
    if (isSavingRealisasi) return
    if (!user) return
    if (!targetStoreId) {
      setInputError("Toko tidak valid.")
      return
    }
    if (!inputTanggal) {
      setInputError("Tanggal wajib diisi.")
      return
    }
    const todayStr = todayJakartaDateStr
    if (!todayStr) {
      setInputError("Tanggal hari ini tidak dapat ditentukan.")
      return
    }
    if (inputTanggal > todayStr) {
      setInputError("Tanggal mendatang tidak dapat dipilih.")
      return
    }
    const existingReport = reportsByDate.get(inputTanggal)
    if (existingReport) {
      setInputError(
        "Laporan untuk tanggal ini sudah tersedia. Silakan gunakan tombol Edit pada laporan tersebut untuk melakukan perubahan.",
      )
      return
    }
    if (inputKaryawanData.length === 0) {
      setInputError("Tidak ada karyawan aktif pada toko ini.")
      return
    }
    for (const row of inputKaryawanData) {
      const omset = parseRupiahInput(row.omset)
      if (omset < 0) {
        setInputError("Nominal omset tidak boleh negatif.")
        return
      }
      if (omset > OMSET_MAKS_PER_KARYAWAN) {
        setInputError(
          `Nominal omset maksimal Rp${OMSET_MAKS_PER_KARYAWAN.toLocaleString("id-ID")} per karyawan.`,
        )
        return
      }
      const visitor = row.visitor !== "" ? Number(row.visitor) : 0
      if (row.visitor !== "" && (!Number.isInteger(visitor) || visitor < 0)) {
        setInputError("Jumlah Visitor harus bilangan bulat nonnegatif.")
        return
      }
    }

    setIsSavingRealisasi(true)
    setInputError("")
    try {
      const idToken = await user.getIdToken()
      const response = await fetch("/api/kontribusi-omset/reports", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tanggal: inputTanggal,
          employees: inputKaryawanData.map((row) => ({
            employeeId: row.employeeId,
            omset: parseRupiahInput(row.omset),
            visitor: row.visitor !== "" ? Number(row.visitor) : 0,
            revenueConfirmed: row.omset !== "",
            visitorConfirmed: row.visitor !== "",
          })),
        }),
      })
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null

      if (!response.ok || !result?.success) {
        setInputError(result?.message ?? "Terjadi kesalahan saat menyimpan laporan omset.")
        return
      }

      showToast("success", "Laporan disimpan", "Realisasi omset berhasil disimpan.")
      setInputModalOpen(false)
      void loadReports()
    } catch (err) {
      setInputError("Terjadi kesalahan saat menyimpan laporan omset.")
    } finally {
      setIsSavingRealisasi(false)
    }
  }

  // ---------- EDIT REALISASI HARIAN ----------
  function handleEditReport(tanggal: string) {
    const report = dailyReports.find((r) => r.tanggal === tanggal)
    if (!report) {
      setEditReportError("Laporan tidak ditemukan.")
      return
    }
    setEditReportTanggal(tanggal)
    setEditReportData(
      report.employees.map((emp) => ({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        omset: emp.omset > 0 ? emp.omset.toLocaleString("id-ID") : "",
        visitor: emp.visitor > 0 ? emp.visitor.toLocaleString("id-ID") : "",
      })),
    )
    setEditReportError("")
    setEditReportModalOpen(true)
  }

  function closeEditReportModal() {
    setEditReportModalOpen(false)
    setEditReportTanggal("")
    setEditReportData([])
    setEditReportError("")
  }

  async function handleSaveEditReport() {
    if (isEditingReport) return
    if (!user) return
    if (!targetStoreId) {
      setEditReportError("Toko tidak valid.")
      return
    }
    if (!editReportTanggal) {
      setEditReportError("Tanggal wajib diisi.")
      return
    }
    if (editReportData.length === 0) {
      setEditReportError("Tidak ada karyawan aktif pada toko ini.")
      return
    }
    for (const row of editReportData) {
      const omset = parseRupiahInput(row.omset)
      if (omset < 0) {
        setEditReportError("Nominal omset tidak boleh negatif.")
        return
      }
      if (omset > OMSET_MAKS_PER_KARYAWAN) {
        setEditReportError(
          `Nominal omset maksimal Rp${OMSET_MAKS_PER_KARYAWAN.toLocaleString("id-ID")} per karyawan.`,
        )
        return
      }
      const visitor = row.visitor !== "" ? Number(row.visitor) : 0
      if (row.visitor !== "" && (!Number.isInteger(visitor) || visitor < 0)) {
        setEditReportError("Jumlah Visitor harus bilangan bulat nonnegatif.")
        return
      }
    }

    setIsEditingReport(true)
    setEditReportError("")
    try {
      const idToken = await user.getIdToken()
      const response = await fetch("/api/kontribusi-omset/reports", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tanggal: editReportTanggal,
          employees: editReportData.map((row) => ({
            employeeId: row.employeeId,
            omset: parseRupiahInput(row.omset),
            visitor: row.visitor !== "" ? Number(row.visitor) : 0,
            revenueConfirmed: row.omset !== "",
            visitorConfirmed: row.visitor !== "",
          })),
        }),
      })
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null

      if (!response.ok || !result?.success) {
        setEditReportError(result?.message ?? "Gagal menyimpan perubahan.")
        return
      }

      showToast("success", "Laporan diperbarui", "Realisasi omset berhasil diubah.")
      closeEditReportModal()
      void loadReports()
    } catch (err) {
      setEditReportError("Terjadi kesalahan saat menyimpan perubahan.")
    } finally {
      setIsEditingReport(false)
    }
  }

  // ---------- HAPUS REALISASI HARIAN ----------
  function handleDeleteReport(tanggal: string) {
    setDeleteReportTanggal(tanggal)
    setDeleteReportError("")
    setDeleteReportOpen(true)
  }

  function closeDeleteReportDialog() {
    setDeleteReportOpen(false)
    setDeleteReportTanggal("")
    setDeleteReportError("")
  }

  async function handleConfirmDelete() {
    if (!deleteReportTanggal) {
      closeDeleteReportDialog()
      return
    }
    if (!user) return
    if (!targetStoreId) {
      setDeleteReportError("Toko tidak valid.")
      return
    }

    setIsDeletingReport(true)
    try {
      const idToken = await user.getIdToken()
      const response = await fetch("/api/kontribusi-omset/reports", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tanggal: deleteReportTanggal,
          storeId: targetStoreId,
        }),
      })
      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null

      if (!response.ok || !result?.success) {
        setDeleteReportError(result?.message ?? "Gagal menghapus laporan.")
        return
      }

      showToast("success", "Laporan dihapus", "Realisasi omset berhasil dihapus.")
      closeDeleteReportDialog()
      void loadReports()
    } catch (err) {
      setDeleteReportError("Terjadi kesalahan saat menghapus laporan.")
    } finally {
      setIsDeletingReport(false)
    }
  }

  if (authLoading) {
    return <LoadingState label="Memuat daftar cabang..." />
  }

  if (!profile) {
    return (
      <EmptyState
        title="Profil tidak ditemukan"
        description="Silakan login kembali untuk membuka halaman ini."
      />
    )
  }

  if (!isStore && !isCentral) {
    return (
      <EmptyState
        title="Akses tidak dikenali"
        description="Halaman ini hanya tersedia untuk Store dan Central."
      />
    )
  }

  if (isStore && !profile.storeId) {
    return (
      <EmptyState
        title="Toko belum terhubung"
        description="Akun Store ini belum memiliki data toko."
      />
    )
  }

  if (isCentralCabang && !profile.cabangId) {
    return (
      <EmptyState
        title="Cabang belum terhubung"
        description="Akun Central Cabang ini belum memiliki data cabang."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Kontribusi Omset
          </h1>
          <p className="text-xs text-muted-foreground">
            Program Kerja &middot; Pemantauan realisasi omset harian per
            karyawan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isCentralPusat && selectedBranch && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedBranch("")
                setSelectedStore("")
              }}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Kembali Pilih Cabang
            </Button>
          )}
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
              {periodeLabel}
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
          {singleStoreContext && (
            <Button
              type="button"
              onClick={openTargetModal}
              disabled={targetsLoading || isSavingTarget}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              <Target className="size-4 mr-2" />
              Atur Target Tim
            </Button>
          )}
        </div>
      </div>

      {/* Scope selector */}
      {pusatLocked ? (
        <BranchPicker
          branches={branches}
          loading={branchesLoading}
          error={branchesError}
          onRetry={() => setBranchesReloadKey((key) => key + 1)}
          onSelect={(cabangId) => {
            setSelectedBranch(cabangId)
            setSelectedStore("")
          }}
        />
      ) : (
        <div>
          <Card>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Cabang">
                {isCentralPusat ? (
                  <SelectField
                    value={selectedBranch}
                    onChange={(value) => {
                      setSelectedBranch(value)
                      setSelectedStore("")
                    }}
                    options={[
                      { value: "", label: "Pilih cabang" },
                      ...branches.map((branch) => ({
                        value: branch.cabangId,
                        label: getCabangDisplayName(branch.cabangId, branch.nama) || branch.cabangId,
                      })),
                    ]}
                  />
                ) : (
                  <ScopeValue value={branchDisplayName || "Cabang tidak dikenal"} />
                )}
              </Field>
              <Field label="Toko">
                {isStore ? (
                  <ScopeValue value={storeLabel} />
                ) : storesLoading ? (
                  <ScopeValue value="Memuat toko..." muted />
                ) : storesError ? (
                  <ScopeValue value="Daftar toko tidak tersedia" muted />
                ) : (
                  <SelectField
                    value={selectedStore}
                    onChange={setSelectedStore}
                    options={[
                      { value: "", label: "Semua Toko" },
                      ...stores.map((store) => ({
                        value: store.storeId,
                        label: store.namaStore || store.storeId,
                      })),
                    ]}
                  />
                )}
              </Field>
            </CardContent>
          </Card>
          {storesError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{storesError}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStoresReloadKey((key) => key + 1)}
              >
                Coba Lagi
              </Button>
            </div>
          )}
          {singleStoreContext && !storesLoading && !storesError && (!isCentral || stores.length > 0) ? (
            <div className="space-y-4">
              {/* KPI Cards per karyawan */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {karyawanKPI.length === 0 ? (
                  <div className="col-span-full">
                    <EmptyState
                      title="Belum ada karyawan aktif"
                      description="Tidak ada karyawan aktif pada toko ini."
                      icon={Store}
                    />
                  </div>
                ) : (
                  karyawanKPI.map((kpi) => (
                    <KpiCardPerKaryawan
                      key={kpi.employeeId}
                      karyawan={{
                        employeeId: kpi.employeeId,
                        employeeName: kpi.employeeName,
                      }}
                      targetBulanan={kpi.targetBulanan}
                      targetTersedia={kpi.targetTersedia}
                      realisasiBulanan={kpi.realisasiBulanan}
                      sisaTarget={kpi.sisaTarget}
                      targetHariIni={kpi.targetHariIni ?? 0}
                      pencapaian={kpi.pencapaian}
                      onEditTarget={() => openTargetModal()}
                    />
                  ))
                )}
              </div>

              {/* Tabel Realisasi Harian */}
              <Card className="overflow-hidden">
                <CardHeader className="gap-1 border-b border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Realisasi Harian</CardTitle>
                    <div className="flex items-center gap-2">
                      {isStore && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInputError("")
                            setInputTanggal(todayJakartaDateStr ?? "")
                            setInputKaryawanData(
                              activeEmployees
                                .filter((emp) => emp.aktif !== false)
                                .map((emp) => ({
                                  employeeId: emp.id,
                                  employeeName:
                                    (emp as any).nama || emp.name || emp.id,
                                  omset: "",
                                  visitor: "",
                                })),
                            )
                            setInputModalOpen(true)
                          }}
                        >
                          Input Realisasi Harian
                        </Button>
                      )}
                      <Badge variant="muted">
                        {dailyReports.length} laporan pada periode ini
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>
                    Setiap baris mewakili satu tanggal. Setiap karyawan
                    memiliki kolom OMSET dan VISITOR dengan warna identitas
                    masing-masing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-16" />
                        {activeEmployees.map(() => (
                          <>
                            <col className="w-32" />
                            <col className="w-24" />
                          </>
                        ))}
                        <col className="w-40" />
                        <col className="w-40" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-2 font-medium text-center w-16 border-r border-solid border-border">TGL</th>
                          {activeEmployees.map((emp, idx) => {
                            const color = getKaryawanColor(idx)
                            return (
                              <th
                                key={emp.id}
                                className={cn(
                                  "px-2 py-2 font-medium text-center border-r border-solid",
                                  color.border,
                                  "border-t border-b",
                                )}
                                colSpan={2}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span className="text-xs font-semibold text-center block" style={{ color: getKaryawanColorText(idx % KARYAWAN_COLORS.length) }}>
                                    {karyawanKPI.find((k) => k.employeeId === emp.id)?.employeeName ?? emp.name ?? emp.id}
                                  </span>
                                </div>
                              </th>
                            )
                          })}
                          <th className="px-2 py-2 font-medium text-center tabular-nums w-40 border-l border-solid border-red-500/30 border-r border-solid border-border">
                            Total Omset Harian
                          </th>
                          <th className="px-2 py-2 font-medium text-center w-40 border-l border-solid border-red-500/30">
                            Aksi
                          </th>
                        </tr>
                        <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-2 font-medium border-r border-solid border-border"></th>
                          {activeEmployees.map((emp, idx) => {
                            const color = getKaryawanColor(idx)
                            return (
                              <>
                                <th
                                  key={`${emp.id}-omset`}
                                  className={cn(
                                    "px-2 py-2 font-medium text-center tabular-nums w-32 border-r border-solid",
                                    color.border,
                                  )}
                                >
                                  Omset
                                </th>
                                <th
                                  className={cn(
                                    "px-2 py-2 font-medium text-center tabular-nums w-24 border-r border-solid",
                                    color.border,
                                  )}
                                >
                                  Visitor
                                </th>
                              </>
                            )
                          })}
                          <th className="px-2 py-2 font-medium text-center tabular-nums border-r border-solid border-border"></th>
                          <th className="px-2 py-2 font-medium text-center w-40 border-l border-solid border-red-500/30"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                          const tanggal = `${period.year}-${pad2(period.month + 1)}-${pad2(day)}`
                          const report = reportsByDate.get(tanggal)
                          const dayTotalOmset = report?.totalOmset ?? 0
                          const dayTotalVisitor = report?.totalVisitor ?? 0

                          return (
                            <tr
                              key={tanggal}
                              className={cn(
                                "border-b border-border/60",
                                tanggal === todayJakartaDateStr && "bg-muted/30",
                              )}
                            >
                              <td className="px-2 py-2 text-center font-medium border-r border-solid border-border">
                                {pad2(day)}
                              </td>
                              {activeEmployees.map((emp, idx) => {
                                const empReport = report?.employees.find((e) => e.employeeId === emp.id)
                                const omset = empReport?.omset ?? 0
                                const visitor = empReport?.visitor ?? 0
                                const color = getKaryawanColor(idx)
                                return (
                                  <>
                                    <td
                                      key={`${tanggal}-${emp.id}-omset`}
                                      className={cn(
                                        "px-2 py-2 text-center tabular-nums w-32 border-r border-solid",
                                        color.border,
                                        omset > 0 && `${color.bg}`,
                                      )}
                                    >
                                      {omset > 0 ? formatRupiahNumber(omset) : "0"}
                                    </td>
                                    <td
                                      key={`${tanggal}-${emp.id}-visitor`}
                                      className={cn(
                                        "px-2 py-2 text-center tabular-nums w-24 border-r border-solid",
                                        color.border,
                                      )}
                                    >
                                      {visitor > 0 ? visitor.toLocaleString("id-ID") : "0"}
                                    </td>
                                  </>
                                )
                              })}
                              <td className="px-2 py-2 text-center tabular-nums font-medium border-r border-solid border-border">
                                {dayTotalOmset > 0 ? formatRupiahNumber(dayTotalOmset) : "0"}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {report ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEditReport(tanggal)}
                                      disabled={isEditingReport || isDeletingReport}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => handleDeleteReport(tanggal)}
                                      disabled={isEditingReport || isDeletingReport}
                                    >
                                      <Trash className="size-3" />
                                      Hapus
                                    </Button>
                                  </div>
                                  ) : null}
                              </td>
                            </tr>
                          )})}
                      </tbody>
                      <tfoot>
                          <tr className="border-t border-border bg-muted/30 text-sm font-semibold">
                          <td className="px-2 py-2 text-center">Total Periode</td>
                          {activeEmployees.map((emp, idx) => {
                            const empTotalOmset = dailyReports.reduce(
                              (sum, r) => {
                                const e = r.employees.find((emp2) => emp2.employeeId === emp.id)
                                return sum + (e?.omset ?? 0)
                              },
                              0,
                            )
                            const empTotalVisitor = dailyReports.reduce(
                              (sum, r) => {
                                const e = r.employees.find((emp2) => emp2.employeeId === emp.id)
                                return sum + (e?.visitor ?? 0)
                              },
                              0,
                            )
                            const color = getKaryawanColor(idx)
                            return (
                              <>
                                <td
                                  key={`${emp.id}-omset-total`}
                                  className={cn(
                                    "px-2 py-2 text-center tabular-nums w-32 border-r border-solid",
                                    color.border,
                                  )}
                                >
                                  {empTotalOmset > 0 ? formatRupiahNumber(empTotalOmset) : "0"}
                                </td>
                                <td
                                  key={`${emp.id}-visitor-total`}
                                  className={cn(
                                    "px-2 py-2 text-center tabular-nums w-24 border-r border-solid",
                                    color.border,
                                  )}
                                >
                                  {empTotalVisitor > 0 ? empTotalVisitor.toLocaleString("id-ID") : "0"}
                                </td>
                              </>
                            )
                          })}
                          <td className="px-2 py-2 text-center tabular-nums w-40 border-r border-solid border-border">
                            {dailyReports.reduce((sum, r) => sum + r.totalOmset, 0) > 0
                              ? formatRupiahNumber(
                                  dailyReports.reduce(
                                    (sum, r) => sum + r.totalOmset,
                                    0,
                                  ),
                                )
                              : "0"}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyState
              title="Belum ada toko"
              description="Belum ada toko pada cabang yang dipilih."
              icon={Store}
            />
          )}
        </div>
      )}
    {/* Modal Atur Target Tim */}
    {targetModalOpen && (
      <TargetBulananFormModal
        open={targetModalOpen}
        periodeLabel={periodeLabel}
        storeName={targetStoreName}
        karyawanList={activeEmployees.map((emp) => ({
          employeeId: emp.id,
          employeeName: (emp as any).nama || emp.name || emp.id,
        }))}
        karyawanTargets={Object.fromEntries(
          activeEmployees.map((emp) => [
            emp.id,
            targets.find((t) => t.employeeId === emp.id && t.targetTersedia)?.targetBulanan ?? null,
          ]),
        )}
        nominalInputs={targetNominalInputs}
        alasanInputs={targetAlasanInputs}
        onNominalInput={updateTargetNominalInput}
        onAlasanInput={updateTargetAlasanInput}
        onClose={() => setTargetModalOpen(false)}
        onSubmit={performSaveTarget}
        isSaving={isSavingTarget}
        errors={targetErrors}
      />
    )}
    {/* Modal Input Realisasi Harian */}
    {inputModalOpen && (
      <InputRealisasiHarianModal
        open={inputModalOpen}
        tanggal={inputTanggal}
        onTanggalChange={handleInputTanggalChange}
        maxTanggal={todayJakartaDateStr ?? undefined}
        karyawanData={inputKaryawanData}
        onKaryawanDataChange={updateInputKaryawanData}
        isSaving={isSavingRealisasi}
        onClose={() => setInputModalOpen(false)}
        onSubmit={handleSaveRealisasi}
        error={inputError}
        storeName={storeLabel}
      />
    )}
    {/* Modal Edit Realisasi Harian */}
    {editReportModalOpen && (
      <EditReportModal
        open={editReportModalOpen}
        tanggal={editReportTanggal}
        karyawanData={editReportData}
        onKaryawanDataChange={updateEditReportData}
        isSaving={isEditingReport}
        onClose={closeEditReportModal}
        onSubmit={handleSaveEditReport}
        error={editReportError}
        storeName={targetStoreName}
      />
    )}
    {/* Dialog Hapus Realisasi Harian */}
    {deleteReportOpen && (
      <DeleteReportDialog
        open={deleteReportOpen}
        tanggal={deleteReportTanggal}
        onClose={closeDeleteReportDialog}
        onConfirm={handleConfirmDelete}
        isSaving={isDeletingReport}
        error={deleteReportError}
      />
    )}
    </div>
  )
}

// Modal Edit Realisasi Harian
function EditReportModal({
  open,
  tanggal,
  karyawanData,
  onKaryawanDataChange,
  isSaving,
  onClose,
  onSubmit,
  error,
  storeName,
}: {
  open: boolean
  tanggal: string
  karyawanData: {
    employeeId: string
    employeeName: string
    omset: string
    visitor: string
  }[]
  onKaryawanDataChange: (employeeId: string, field: "omset" | "visitor", value: string) => void
  isSaving: boolean
  onClose: () => void
  onSubmit: () => void
  error: string
  storeName?: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit Realisasi ${tanggal}`}
      description="Ubah omset dan visitor per karyawan."
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Toko">
            <ScopeValue value={storeName || "Memuat toko..."} />
          </Field>
          <Field label="Tanggal">
            <ScopeValue value={tanggal} />
          </Field>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Daftar Karyawan</p>
            {isSaving && <p className="text-xs text-muted-foreground">Menyimpan...</p>}
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-36" />
                <col className="w-20" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    Karyawan
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    Omset
                  </th>
                  <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                    Visitor
                  </th>
                </tr>
              </thead>
              <tbody>
                {karyawanData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-sm text-muted-foreground">
                      Tidak ada karyawan aktif pada toko ini.
                    </td>
                  </tr>
                ) : (
                  karyawanData.map((row) => (
                    <tr key={row.employeeId} className="border-b border-border/60">
                      <td className="px-2 py-2">
                        <p className="truncate font-medium text-xs" title={row.employeeName}>
                          {row.employeeName}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <div className="relative mx-auto w-full">
                          {row.omset !== "" && (
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                              Rp
                            </span>
                          )}
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.omset}
                            onChange={createOmsetInputHandler(
                              row.employeeId,
                              onKaryawanDataChange,
                            )}
                            placeholder="Rp0"
                            className={cn(
                              "h-8 w-auto rounded-lg border border-input bg-card text-center text-xs tabular-nums",
                              row.omset !== "" ? "pl-7 pr-2" : "px-2",
                              "min-w-[80px] max-w-[128px]",
                            )}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={row.visitor}
                          onChange={(e) =>
                            onKaryawanDataChange(row.employeeId, "visitor", e.target.value)
                          }
                          placeholder="0"
                          className="mx-auto block h-8 w-full max-w-[56px] rounded-lg border border-input bg-card px-1 text-center text-xs tabular-nums"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          Batal
        </Button>
        <Button type="button" onClick={onSubmit} disabled={isSaving}>
          {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
        </Button>
      </div>
    </Modal>
  )
}

// Dialog Hapus Realisasi Harian
function DeleteReportDialog({
  open,
  tanggal,
  onClose,
  onConfirm,
  isSaving,
  error,
}: {
  open: boolean
  tanggal: string
  onClose: () => void
  onConfirm: () => void
  isSaving: boolean
  error: string
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Konfirmasi Hapus Realisasi"
      description={
        tanggal
          ? `Apakah Anda yakin ingin menghapus realisasi omset tanggal ${tanggal}? Data yang dihapus tidak akan dikembalikan.`
          : undefined
      }
    >
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSaving}
        >
          Batal
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onConfirm}
          disabled={isSaving}
        >
          {isSaving ? "Menghapus..." : "Ya, Hapus"}
        </Button>
      </div>
    </Modal>
  )
}

// BranchPicker component (reused for Central Pusat branch selection)
function BranchPicker({
  branches,
  loading,
  error,
  onRetry,
  onSelect,
}: {
  branches: BranchOption[]
  loading: boolean
  error: string
  onRetry: () => void
  onSelect: (cabangId: string) => void
}) {
  if (loading) {
    return <LoadingState label="Memuat daftar cabang..." />
  }
  if (error) {
    return (
      <div className="space-y-3">
        <EmptyState title="Gagal memuat cabang" description={error} icon={Store} />
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={onRetry}>
            Coba Lagi
          </Button>
        </div>
      </div>
    )
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
          Pilih satu cabang untuk menampilkan dashboard Kontribusi Omset.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {branches.map((branch) => (
          <button
            key={branch.cabangId}
            type="button"
            onClick={() => onSelect(branch.cabangId)}
            className={cn(
              "group flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm",
              "transition-all duration-200",
              "hover:border-primary/50 hover:bg-primary/5 hover:shadow-md",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            )}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              <Store className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {branch.nama || branch.cabangId}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Klik untuk membuka dashboard
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  )
}
