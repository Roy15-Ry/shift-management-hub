"use client"

import * as React from "react"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Layers,
  Loader2,
  Send,
  Store as StoreIcon,
  UserPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import {
  RevisiStatusBadge,
  StatusBadge,
} from "@/components/ui/badge"
import {
  DateField,
  EmptyState,
  Field,
  LoadingState,
  SelectField,
} from "@/components/controls"
import { useApp } from "@/components/app-context"
import { useAuth } from "@/components/auth-context"
import {
  getFirestoreEmployees,
  getFirestoreSchedules,
  getFirestoreStores,
  type FirestoreEmployee,
  type FirestoreStore,
} from "@/lib/firestore-data"
import {
  REVISI_JENIS_ITEMS,
  REVISI_JENIS_LAINNYA,
  getRevisiJenisItem,
  type ShiftStatus,
} from "@/lib/data"
import { cn } from "@/lib/utils"
import type { Revisi } from "@/lib/data"

// ============================================================
// UTILITAS TANGGAL
// ============================================================

function todayISO(): string {
  const now = new Date()
  const pad = (n: number) =>
    String(n).padStart(2, "0")
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-")
}

// Formatter nama bulan Indonesia (contoh: "Agustus 2026")
const monthFormatter = new Intl.DateTimeFormat(
  "id-ID",
  {
    month: "long",
    year: "numeric",
  },
)

// ============================================================
// FILTER REVISI SESUAI BULAN & TAHUN
//
// Difilter berdasarkan tanggal pengajuan (tanggal) agar data
// benar-benar mengikuti bulan yang dipilih. Bulan sebelumnya
// tidak ikut ditampilkan.
// ============================================================

function revisiInMonth(
  list: Revisi[],
  year: number,
  monthIndex: number,
): Revisi[] {
  return list.filter((r) => {
    const parts = String(
      r.tanggal ?? "",
    )
      .split("-")
      .map(Number)

    if (
      parts.length !== 3 ||
      Number.isNaN(parts[0]) ||
      Number.isNaN(parts[1])
    ) {
      return false
    }

    return (
      parts[0] === year &&
      parts[1] === monthIndex + 1
    )
  })
}

// ============================================================
// BADGE JADWAL SHIFT (REFERENSI SAJA)
// ============================================================

function JadwalBadge({
  status,
}: {
  status?: ShiftStatus | null
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Tidak ada jadwal
      </span>
    )
  }
  return (
    <StatusBadge
      status={status}
      withDot
    />
  )
}

// ============================================================
// FORM PENGAJUAN (KHUSUS STORE)
// ============================================================

function StoreRevisiForm() {
  const { createRevisi, isCreatingRevisi } = useApp()
  const { profile } = useAuth()

  const [tanggal, setTanggal] =
    React.useState(todayISO())
  const [employees, setEmployees] =
    React.useState<FirestoreEmployee[]>([])
  const [employeeId, setEmployeeId] =
    React.useState("")
  const [jenisRevisi, setJenisRevisi] =
    React.useState("")
  const [jenisRevisiLainnya, setJenisRevisiLainnya] =
    React.useState("")
  const [keterangan, setKeterangan] =
    React.useState("")
  const [jadwalShift, setJadwalShift] =
    React.useState<ShiftStatus | null>(null)
  const [loadingEmployees, setLoadingEmployees] =
    React.useState(true)
  const [loadingJadwal, setLoadingJadwal] =
    React.useState(false)
  const [error, setError] =
    React.useState("")
  const [success, setSuccess] =
    React.useState("")

  // ==========================================================
  // MEMUAT KARYAWAN
  // ==========================================================

  React.useEffect(() => {
    let active = true

    async function load() {
      if (
        !profile ||
        profile.role !== "store" ||
        !profile.storeId
      ) {
        setLoadingEmployees(false)
        return
      }

      try {
        const data =
          await getFirestoreEmployees(
            profile.storeId,
            profile.cabangId,
          )

        if (!active) return

        setEmployees(
          data.filter(
            (e) => e.aktif !== false,
          ),
        )
      } catch (err) {
        console.error(
          "Gagal memuat karyawan:",
          err,
        )
      } finally {
        if (active) {
          setLoadingEmployees(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [profile])

  // ==========================================================
  // OTOMATIS MEMBACA JADWAL SHIFT (REFERENSI, TIDAK MENGUBAH)
  // ==========================================================

  React.useEffect(() => {
    let active = true

    async function loadJadwal() {
      if (
        !tanggal ||
        !employeeId ||
        !profile?.storeId
      ) {
        setJadwalShift(null)
        return
      }

      setLoadingJadwal(true)

      try {
        const schedules =
          await getFirestoreSchedules(
            profile.storeId,
            tanggal,
            profile.cabangId,
          )

        if (!active) return

        const match =
          schedules.find(
            (s) =>
              s.employeeId ===
              employeeId,
          )

        setJadwalShift(
          (match?.status ??
            null) as ShiftStatus | null,
        )
      } catch (err) {
        console.error(
          "Gagal membaca jadwal shift:",
          err,
        )
        if (active) {
          setJadwalShift(null)
        }
      } finally {
        if (active) {
          setLoadingJadwal(false)
        }
      }
    }

    loadJadwal()

    return () => {
      active = false
    }
  }, [
    tanggal,
    employeeId,
    profile,
  ])

  const selectedEmployee =
    employees.find((e) => e.id === employeeId)

  function resetForm() {
    setTanggal(todayISO())
    setEmployeeId("")
    setJenisRevisi("")
    setJenisRevisiLainnya("")
    setKeterangan("")
    setJadwalShift(null)
  }

  async function handleSubmit(
    e: React.FormEvent,
  ) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!tanggal || !employeeId) {
      setError(
        "Pilih tanggal dan karyawan terlebih dahulu.",
      )
      return
    }

    if (!jenisRevisi) {
      setError(
        "Pilih jenis revisi.",
      )
      return
    }

    if (
      jenisRevisi ===
        REVISI_JENIS_LAINNYA &&
      !jenisRevisiLainnya.trim()
    ) {
      setError(
        "Jenis revisi lainnya wajib diisi.",
      )
      return
    }

    if (!keterangan.trim()) {
      setError(
        "Keterangan wajib diisi.",
      )
      return
    }

    try {
      await createRevisi({
        tanggal,
        employeeId,
        employeeName:
          selectedEmployee?.name ?? "",
        jenisRevisi,
        jenisRevisiLainnya:
          jenisRevisi ===
            REVISI_JENIS_LAINNYA
            ? jenisRevisiLainnya.trim()
            : "",
        keterangan: keterangan.trim(),
      })

      setSuccess(
        "Pengajuan revisi berhasil dikirim. Status saat ini: BARU.",
      )
      resetForm()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Pengajuan revisi gagal. Silakan coba lagi.",
      )
    }
  }

  const employeeOptions = [
    {
      value: "",
      label:
        employees.length > 0
          ? "Pilih karyawan..."
          : "Tidak ada karyawan",
    },
    ...employees.map((e) => ({
      value: e.id,
      label: `${e.name}${e.posisi ? ` - ${e.posisi}` : ""}`,
    })),
  ]

  const jenisOptions = [
    {
      value: "",
      label: "Pilih jenis revisi...",
    },
    ...REVISI_JENIS_ITEMS.map((j) => ({
      value: j.value,
      label: j.label,
    })),
  ]

  const textareaClass =
    "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"

  const jenisSelected =
    getRevisiJenisItem(jenisRevisi)

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UserPlus className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Revisi Absensi
          </h2>
          <p className="text-sm text-muted-foreground">
            Ajukan laporan kejadian absensi karyawan.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-5 space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tanggal">
            <DateField
              value={tanggal}
              onChange={setTanggal}
            />
          </Field>

          <Field label="Karyawan">
            {loadingEmployees ? (
              <div className="flex h-10 items-center gap-2 px-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Memuat karyawan...
              </div>
            ) : (
              <SelectField
                value={employeeId}
                onChange={setEmployeeId}
                options={employeeOptions}
              />
            )}
          </Field>
        </div>

        {/* JADWAL SHIFT - referensi otomatis */}
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              JADWAL SHIFT{" "}
              <span className="font-normal">
                (informasi referensi)
              </span>
            </p>
            {loadingJadwal ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <JadwalBadge
                status={jadwalShift}
              />
            )}
          </div>
        </div>

        {/* JENIS REVISI */}
        <Field label="Jenis Revisi">
          <SelectField
            value={jenisRevisi}
            onChange={setJenisRevisi}
            options={jenisOptions}
          />
        </Field>

        {jenisSelected && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {jenisSelected.description}
          </p>
        )}

        {/* LAINNYA */}
        {jenisRevisi ===
          REVISI_JENIS_LAINNYA && (
          <Field label="Jenis Revisi Lainnya">
            <input
              value={jenisRevisiLainnya}
              onChange={(e) =>
                setJenisRevisiLainnya(
                  e.target.value,
                )
              }
              maxLength={300}
              placeholder="Tulis jenis revisi"
              className={cn(
                textareaClass,
                "h-10",
              )}
            />
          </Field>
        )}

        {/* KETERANGAN */}
        <Field label="Keterangan">
          <textarea
            value={keterangan}
            onChange={(e) =>
              setKeterangan(e.target.value)
            }
            rows={4}
            maxLength={2000}
            placeholder="Jelaskan kejadian atau alasan revisi secara lengkap..."
            className={textareaClass}
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-status-sakit/25 bg-status-sakit-bg px-3 py-2 text-sm text-status-sakit">
            {error}
          </p>
        )}

        {success && (
          <p className="rounded-lg border border-status-pagi/25 bg-status-pagi-bg px-3 py-2 text-sm text-status-pagi">
            {success}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            disabled={
              isCreatingRevisi
            }
          >
            {isCreatingRevisi ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {isCreatingRevisi
              ? "Mengirim..."
              : "Ajukan Revisi"}
          </Button>
        </div>
      </form>
    </section>
  )
}

// ============================================================
// KARTU REVISI (dipakai list store + detail central)
// ============================================================

function RevisiCard({
  item,
  canProcess,
  onProcess,
  processing,
}: {
  item: Revisi
  canProcess: boolean
  onProcess: (id: string) => void
  processing: boolean
}) {
  const jenis =
    getRevisiJenisItem(item.jenisRevisi)

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        item.status === "SELESAI"
          ? "border-border opacity-70"
          : "border-border",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-56">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {item.employeeName
              .slice(0, 1)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {item.employeeName}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {item.storeName || item.storeId}
            </p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">
              Tanggal
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {item.tanggal}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">
              Jadwal
            </p>
            <div className="mt-1">
              <JadwalBadge
                status={item.jadwalShift}
              />
            </div>
          </div>

          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">
              Jenis Revisi
            </p>
            <p className="mt-0.5 text-sm font-medium">
              {jenis?.label ?? "-"}
              {item.jenisRevisiLainnya && (
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {item.jenisRevisiLainnya}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 lg:w-52 lg:flex-col lg:items-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <div className="flex flex-col items-start gap-1">
            <RevisiStatusBadge
              status={item.status}
            />
            {item.prosesOleh && (
              <span className="text-[11px] text-muted-foreground">
                {item.status ===
                "SELESAI"
                  ? `Selesai oleh ${item.prosesOleh}`
                  : `Proses oleh ${item.prosesOleh}`}
              </span>
            )}
          </div>

          {canProcess &&
            item.status !==
              "SELESAI" && (
              <Button
                size="sm"
                variant={
                  item.status ===
                  "PROSES"
                    ? "outline"
                    : "default"
                }
                disabled={processing}
                onClick={() =>
                  onProcess(item.id)
                }
              >
                {processing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : item.status ===
                  "BARU" ? (
                  <ClipboardCheck className="size-4" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                {item.status ===
                "BARU"
                  ? "Proses"
                  : "Selesai"}
              </Button>
            )}
        </div>
      </div>

      {/* Keterangan */}
      {item.keterangan && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            Keterangan
          </p>
          <p className="mt-1 text-sm leading-relaxed">
            {item.keterangan}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// DAFTAR TOKO (CENTRAL CABANG & CENTRAL PUSAT)
// ============================================================

function CentralStoreList({
  stores,
  revisi,
  onSelect,
}: {
  stores: FirestoreStore[]
  revisi: Revisi[]
  onSelect: (id: string) => void
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stores.map((s) => {
          const items = revisi.filter(
            (r) => r.storeId === s.id,
          )
          const pending = items.filter(
            (r) => r.status !== "SELESAI",
          ).length
          const hasAny = pending > 0

          return (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                onSelect(s.id)
              }
              className={cn(
                "group flex items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                hasAny
                  ? "border-status-pagi/30"
                  : "border-border",
              )}
            >
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-lg",
                  hasAny
                    ? "bg-status-pagi-bg text-status-pagi"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {hasAny ? (
                  <ClipboardCheck className="size-5" />
                ) : (
                  <CheckCircle2 className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {s.nama}
                </p>
                {hasAny ? (
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {pending} pengajuan
                    </span>
                    <RevisiStatusBadge status="PROSES" />
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tidak ada pengajuan
                  </p>
                )}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          )
        })}
      </div>

      {stores.length === 0 && (
        <EmptyState
          icon={StoreIcon}
          title="Tidak ada toko"
          description="Belum ada toko yang dapat ditampilkan pada lingkup Anda."
        />
      )}
    </>
  )
}

// ============================================================
// DETAIL PER TOKO (CENTRAL)
// ============================================================

function CentralStoreDetail({
  store,
  revisi,
  onBack,
  isLoading,
}: {
  store: FirestoreStore | undefined
  revisi: Revisi[]
  onBack: () => void
  isLoading: boolean
}) {
  const { advanceRevisi, advanceAllRevisi, isBatchProcessing } =
    useApp()
  const [processingId, setProcessingId] =
    React.useState<string | null>(null)
  const [error, setError] =
    React.useState("")
  const [confirmTo, setConfirmTo] =
    React.useState<
      "PROSES" | "SELESAI" | null
    >(null)
  const [batchError, setBatchError] =
    React.useState("")
  const [batchSuccess, setBatchSuccess] =
    React.useState("")

  const items = revisi
    .filter((r) => r.storeId === store?.id)
    .sort((a, b) =>
      b.tanggalPengajuan.localeCompare(
        a.tanggalPengajuan,
      ),
    )

  const pendingCount = items.filter(
    (r) => r.status !== "SELESAI",
  ).length

  const storeBaruCount = items.filter(
    (r) => r.status === "BARU",
  ).length
  const storeProsesCount = items.filter(
    (r) => r.status === "PROSES",
  ).length

  const storeAllDone =
    storeBaruCount === 0 &&
    storeProsesCount === 0

  async function handleProcess(id: string) {
    setError("")
    setProcessingId(id)
    try {
      await advanceRevisi(id)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal memperbarui status revisi.",
      )
    } finally {
      setProcessingId(null)
    }
  }

  async function confirmBatch(
    to: "PROSES" | "SELESAI",
  ) {
    setBatchError("")
    setBatchSuccess("")
    try {
      if (!store) return
      const processed =
        await advanceAllRevisi(
          store.id,
          to,
        )
      setBatchSuccess(
        to === "PROSES"
          ? `${processed} pengajuan diproses menjadi PROSES.`
          : `${processed} pengajuan diselesaikan.`,
      )
    } catch (err) {
      setBatchError(
        err instanceof Error
          ? err.message
          : "Aksi massal gagal. Silakan coba lagi.",
      )
    } finally {
      setConfirmTo(null)
    }
  }

  const confirmAction =
    confirmTo === "PROSES"
      ? {
          title: "Proses semua pengajuan toko ini?",
          body: `Semua pengajuan BARU pada toko ${store?.nama ?? ""} akan diubah menjadi PROSES.`,
          confirmLabel: "Proses Semua",
        }
      : confirmTo === "SELESAI"
        ? {
            title: "Selesaikan semua pengajuan toko ini?",
            body: `Semua pengajuan PROSES pada toko ${store?.nama ?? ""} akan diubah menjadi SELESAI.`,
            confirmLabel: "Selesaikan Semua",
          }
        : null

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Kembali ke daftar toko
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Revisi Absensi &middot;{" "}
            {store?.nama ?? "-"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pendingCount > 0
              ? `${pendingCount} pengajuan perlu diproses`
              : "Seluruh pengajuan telah selesai"}
          </p>
        </div>

        {/* AKSI MASSAL PER TOKO */}
        <div className="flex items-center gap-2">
          {isBatchProcessing && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}

          <Button
            variant={storeAllDone ? "outline" : "default"}
            disabled={storeAllDone || isBatchProcessing}
            onClick={() =>
              setConfirmTo(
                storeBaruCount > 0
                  ? "PROSES"
                  : "SELESAI",
              )
            }
          >
            <Layers className="size-4" />
            {storeAllDone
              ? "Pengajuan Selesai"
              : storeBaruCount > 0
                ? "Proses Semua Pengajuan"
                : "Selesaikan Semua Pengajuan"}
          </Button>
        </div>
      </div>

      {batchError && (
        <p className="rounded-lg border border-status-sakit/25 bg-status-sakit-bg px-3 py-2 text-sm text-status-sakit">
          {batchError}
        </p>
      )}

      {batchSuccess && (
        <p className="rounded-lg border border-status-pagi/25 bg-status-pagi-bg px-3 py-2 text-sm text-status-pagi">
          {batchSuccess}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-status-sakit/25 bg-status-sakit-bg px-3 py-2 text-sm text-status-sakit">
          {error}
        </p>
      )}

      {isLoading ? (
        <LoadingState label="Memuat revisi..." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Tidak ada riwayat pengerjaan"
          description="Tidak ada riwayat pengerjaan pada bulan ini."
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <RevisiCard
              key={r.id}
              item={r}
              canProcess
              onProcess={handleProcess}
              processing={
                processingId ===
                r.id
              }
            />
          ))}
        </div>
      )}

      {/* KONFIRMASI AKSI MASSAL PER TOKO */}
      <Modal
        open={confirmTo !== null}
        onClose={() =>
          setConfirmTo(null)
        }
        title={confirmAction?.title ?? ""}
        description={confirmAction?.body}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setConfirmTo(null)
              }
              disabled={isBatchProcessing}
            >
              Batal
            </Button>
            <Button
              onClick={() => {
                if (confirmTo) {
                  confirmBatch(
                    confirmTo,
                  )
                }
              }}
              disabled={isBatchProcessing}
            >
              {isBatchProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                confirmAction?.confirmLabel
              )}
            </Button>
          </>
        }
      />
    </div>
  )
}

// ============================================================
// LIST STORE SENDIRI (KHUSUS STORE)
// ============================================================

function StoreSubmissions({
  revisi,
  isLoading,
  monthLabel,
}: {
  revisi: Revisi[]
  isLoading: boolean
  monthLabel: string
}) {
  const sorted = [...revisi].sort((a, b) =>
    b.tanggalPengajuan.localeCompare(
      a.tanggalPengajuan,
    ),
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ClipboardCheck className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Riwayat Pengajuan {monthLabel}
          </h2>
          <p className="text-sm text-muted-foreground">
            Revisi yang telah Anda ajukan pada bulan{" "}
            {monthLabel} beserta statusnya.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Memuat pengajuan..." />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Belum ada pengajuan"
          description="Belum ada riwayat pengajuan bulan ini."
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((r) => (
            <RevisiCard
              key={r.id}
              item={r}
              canProcess={false}
              onProcess={() => {}}
              processing={false}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ============================================================
// HALAMAN UTAMA
// ============================================================

export function RevisiPage() {
  const { profile } = useAuth()
  const {
    revisi,
    loadingRevisi,
  } = useApp()

  const [stores, setStores] =
    React.useState<FirestoreStore[]>([])
  const [selected, setSelected] =
    React.useState<string | null>(null)

  // ============================================================
  // PERIODE BULAN (CENTRAL)
  //
  // STORE tidak memiliki filter bulan dan selalu menggunakan
  // bulan berjalan. CENTRAL memilih bulan pada halaman depan.
  // ============================================================

  const [period, setPeriod] =
    React.useState(() => {
      const now = new Date()
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
      }
    })

  const role = profile?.role

  const isStore = role === "store"
  const isCentral =
    role === "central_cabang" ||
    role === "central_pusat"

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const d = new Date(
        current.year,
        current.month + offset,
        1,
      )
      return {
        year: d.getFullYear(),
        month: d.getMonth(),
      }
    })
  }

  const monthLabel =
    monthFormatter
      .format(
        new Date(
          period.year,
          period.month,
          1,
        ),
      )
      .toUpperCase()

  // Data yang tampil benar-benar mengikuti bulan yang dipilih.
  const monthRevisi =
    revisiInMonth(
      revisi,
      period.year,
      period.month,
    )

  React.useEffect(() => {
    let active = true

    async function loadStores() {
      if (!isCentral) return
      if (!profile) return

      try {
        const data =
          await getFirestoreStores(
            role,
            profile.storeId,
            profile.cabangId,
          )
        if (active) {
          setStores(data)
        }
      } catch (err) {
        console.error(
          "Gagal memuat daftar toko:",
          err,
        )
      }
    }

    loadStores()

    return () => {
      active = false
    }
  }, [isCentral, role, profile])

  const selectedStore =
    stores.find((s) => s.id === selected)

  // Store tidak perlu halaman detail, langsung tampil
  // form + riwayat. STORE tidak memiliki filter/dropdown
  // bulan; selalu menampilkan bulan berjalan saja.
  if (isStore) {
    const now = new Date()

    const storeMonthLabel =
      monthFormatter
        .format(now)
        .toUpperCase()

    const storeMonthRevisi =
      revisiInMonth(
        revisi,
        now.getFullYear(),
        now.getMonth(),
      )

    return (
      <div className="space-y-6">
        <StoreRevisiForm />

        <StoreSubmissions
          revisi={storeMonthRevisi}
          isLoading={loadingRevisi}
          monthLabel={
            storeMonthLabel
          }
        />
      </div>
    )
  }

  if (!isCentral) {
    return (
      <EmptyState
        icon={StoreIcon}
        title="Akses dibatasi"
        description="Halaman ini hanya tersedia untuk akun Store dan Central."
      />
    )
  }

  const pendingTotal = revisi.filter(
    (r) => r.status !== "SELESAI",
  ).length

  return (
    <div className="space-y-5">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Revisi Absensi
          </h2>
          <p className="text-sm text-muted-foreground">
            Pantau dan proses pengajuan revisi absensi di setiap toko.
            {pendingTotal > 0 && (
              <span className="ml-1 font-medium text-foreground">
                {pendingTotal} pengajuan menunggu.
              </span>
            )}
          </p>
        </div>

        {/* PILIHAN BULAN (SEBELUM DAFTAR TOKO) */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bulan sebelumnya"
            onClick={() =>
              changeMonth(-1)
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-sm font-semibold">
            {monthLabel}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bulan berikutnya"
            onClick={() =>
              changeMonth(1)
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {selected && selectedStore ? (
        <CentralStoreDetail
          store={selectedStore}
          revisi={monthRevisi}
          onBack={() => setSelected(null)}
          isLoading={loadingRevisi}
        />
      ) : (
        <CentralStoreList
          stores={stores}
          revisi={monthRevisi}
          onSelect={setSelected}
        />
      )}
    </div>
  )
}
