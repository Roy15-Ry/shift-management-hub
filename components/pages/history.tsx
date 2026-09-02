"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, ClipboardList, History as HistoryIcon } from "lucide-react"

import { useAuth } from "@/components/auth-context"
import { EmptyState, LoadingState } from "@/components/controls"
import { Button } from "@/components/ui/button"
import { RevisiStatusBadge } from "@/components/ui/badge"

import {
  getRevisiJenisItem,
  formatTanggal,
} from "@/lib/data"
import {
  SHIFT_STATUS_ITEMS,
  getShiftStatusItem,
} from "@/lib/shift-status"
import { cn } from "@/lib/utils"

// ============================================================
// UTILITAS TANGGAL
// ============================================================

const monthFormatter = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" })

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)
}

// ============================================================
// TIPE DATA HISTORY (hasil API server)
// ============================================================

type HistoryStore = {
  id: string
  nama: string
  cabangId: string
  aktif: boolean
}

type HistoryEmployee = {
  id: string
  name: string
  storeId: string
  posisi: string
  aktif: boolean
}

type HistorySchedule = {
  id: string
  storeId: string
  cabangId: string
  employeeId: string
  tanggal: string
  status: string
  cutiJenis?: string
}

type HistoryRevisi = {
  id: string
  storeId: string
  storeName: string
  cabangId: string
  employeeId: string
  employeeName: string
  tanggal: string
  jenisRevisi: string
  jenisRevisiLainnya: string
  keterangan: string
  tanggalPengajuan: string
  status: string
  prosesOleh: string
}

type HistoryData = {
  stores: HistoryStore[]
  employeesByStoreId: Record<string, HistoryEmployee[]>
  schedulesByStore: Record<string, HistorySchedule[]>
  revisi: HistoryRevisi[]
}

// ============================================================
// TABEL JADWAL BULANAN SATU TOKO (READ-ONLY)
// ============================================================

function HistoryMonthlyTable({
  store,
  index,
  employees,
  schedules,
  period,
}: {
  store: HistoryStore
  index: number
  employees: HistoryEmployee[]
  schedules: HistorySchedule[]
  period: { year: number; month: number }
}) {
  const days = getDaysInMonth(period.year, period.month)

  const scheduleByCell = React.useMemo(() => {
    return new Map(
      schedules.map((s) => [`${s.employeeId}:${s.tanggal}`, s.status]),
    )
  }, [schedules])

  const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short" })

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
          {index}
        </div>
        <p className="truncate text-sm font-semibold">{store.nama}</p>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {employees.length} karyawan
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="min-w-[9rem] border-b border-r border-border bg-muted/60 px-1.5 py-2 text-left align-middle font-semibold sm:px-2 md:min-w-[12rem] md:py-2.5">
                Karyawan
              </th>
              {days.map((day) => {
                const date = new Date(period.year, period.month, day)
                return (
                  <th
                    key={day}
                    className="min-w-9 overflow-hidden border-b border-r border-border px-0.5 py-1 text-center align-middle font-semibold last:border-r-0 md:min-w-12"
                  >
                    <span className="block truncate text-[0.7rem] leading-tight text-foreground md:text-sm">{day}</span>
                    <span className="block truncate text-[0.5rem] uppercase leading-tight md:text-[0.65rem]">
                      {weekdayFormatter.format(date)}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="min-w-[9rem] border-b border-r border-border bg-card px-1.5 py-1.5 align-middle sm:px-2 md:min-w-[12rem]">
                  <p className="truncate text-[0.7rem] font-semibold text-foreground md:text-xs md:font-semibold">
                    {employee.name}
                  </p>
                </td>
                {days.map((day) => {
                  const tanggal = getDateKey(period.year, period.month, day)
                  const status = scheduleByCell.get(`${employee.id}:${tanggal}`)
                  const option = getShiftStatusItem(status)
                  return (
                    <td key={tanggal} className="border-b border-r border-border p-0.5 text-center last:border-r-0">
                      <span
                        title={option?.title ?? "Belum dijadwalkan"}
                        className={cn(
                          "flex h-6 items-center justify-center truncate rounded px-1 text-[0.6rem] font-bold ring-1 md:mx-auto md:h-7 md:min-w-12 md:px-1.5 md:text-[0.68rem] md:whitespace-nowrap",
                          option ? option.className : "bg-background text-muted-foreground ring-border",
                        )}
                      >
                        {option?.label ?? "-"}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {employees.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Belum ada data jadwal pada toko ini.</p>
      )}
    </div>
  )
}

// ============================================================
// BADGE STATUS (dari lib/shift-status)
// ============================================================

function StatusBadge({ status }: { status: string | undefined }) {
  const option = getShiftStatusItem(status)
  if (!option) return <span className="text-muted-foreground">-</span>
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold",
        option.className,
      )}
    >
      {option.label}
    </span>
  )
}

// ============================================================
// TABLE WRAPPER (list)
// ============================================================

function HistoryTable({
  headers,
  children,
}: {
  headers: string[]
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {headers.map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// HALAMAN UTAMA
// ============================================================

export function HistoryPage() {
  const { profile, user } = useAuth()

  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  const [stores, setStores] = React.useState<HistoryStore[]>([])
  const [employeesByStoreId, setEmployeesByStoreId] = React.useState<Record<string, HistoryEmployee[]>>({})
  const [schedulesByStore, setSchedulesByStore] = React.useState<Record<string, HistorySchedule[]>>({})
  const [revisi, setRevisi] = React.useState<HistoryRevisi[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  // ==========================================================
  // PEMILIHAN STORE (khusus CENTRAL PUSAT / CENTRAL CABANG)
  // ==========================================================

  const [selectedStoreId, setSelectedStoreId] =
    React.useState<string | null>(null)

  // ==========================================================
  // AMBIL DATA HISTORY MELALUI SERVER (Admin SDK)
  // ==========================================================

  React.useEffect(() => {
    if (!profile || !user) {
      setLoading(false)
      return
    }

    const authedUser = user
    let cancelled = false
    setLoading(true)
    setError("")

    async function loadData() {
      try {
        const idToken = await authedUser.getIdToken()

        const params = new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
        })

        const response = await fetch(
          `/api/history?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error("Data history tidak dapat dimuat.")
        }

        const data = (await response.json()) as HistoryData & { success: boolean }

        if (cancelled) return

        setStores(Array.isArray(data.stores) ? data.stores : [])
        setEmployeesByStoreId(
          data.employeesByStoreId && typeof data.employeesByStoreId === "object"
            ? data.employeesByStoreId
            : {},
        )
        setSchedulesByStore(
          data.schedulesByStore && typeof data.schedulesByStore === "object"
            ? data.schedulesByStore
            : {},
        )
        setRevisi(Array.isArray(data.revisi) ? data.revisi : [])
      } catch (loadError) {
        console.error("Gagal memuat data History:", loadError)
        if (!cancelled) {
          setError("History tidak dapat dimuat. Silakan coba lagi.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [profile, user, period.year, period.month])

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const d = new Date(current.year, current.month + offset, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const monthLabel = monthFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()

  // ==========================================================
  // DATA LIBUR / CUTI / IZIN / SAKIT
  // ==========================================================

  const statusItems = React.useMemo(() => {
    const STATUS_KEYS = new Set(["libur", "cuti", "izin", "sakit"])

    const items: {
      key: string
      storeId: string
      employeeName: string
      tanggal: string
      status: string
      keterangan: string
    }[] = []

    for (const store of stores) {
      const employees = employeesByStoreId[store.id] ?? []

      const nameByEmployeeId = new Map(
        employees.map((e) => [e.id, e.name]),
      )

      for (const schedule of schedulesByStore[store.id] ?? []) {
        if (!STATUS_KEYS.has(schedule.status)) continue

        items.push({
          key: schedule.id,
          storeId: store.id,
          employeeName:
            nameByEmployeeId.get(schedule.employeeId) ?? "-",
          tanggal: schedule.tanggal,
          status: schedule.status,
          keterangan:
            schedule.status === "cuti"
              ? schedule.cutiJenis ?? "-"
              : "-",
        })
      }
    }

    items.sort((a, b) =>
      a.tanggal.localeCompare(b.tanggal) ||
      a.employeeName.localeCompare(b.employeeName, "id", { sensitivity: "base" }),
    )

    return items
  }, [stores, employeesByStoreId, schedulesByStore])

  // ==========================================================
  // DATA REVISI ABSENSI (urutan terbaru dahulu)
  // ==========================================================

  const revisiItems = React.useMemo(() => {
    return [...revisi].sort((a, b) =>
      b.tanggalPengajuan.localeCompare(a.tanggalPengajuan),
    )
  }, [revisi])

  // Pemilihan Store hanya diterapkan untuk CENTRAL PUSAT /
  // CENTRAL CABANG. Role STORE tetap memakai perilaku lama
  // (menampilkan seluruh history tanpa harus memilih Store).
  const isCentral =
    profile?.role === "central_pusat" ||
    profile?.role === "central_cabang"

  const filteredStatusItems = isCentral
    ? statusItems.filter(
        (item) => item.storeId === selectedStoreId,
      )
    : statusItems

  const filteredRevisiItems = isCentral
    ? revisiItems.filter(
        (item) => item.storeId === selectedStoreId,
      )
    : revisiItems

  const anyStore = stores.length > 0

  return (
    <div className="space-y-5">
      {/* ======================================================
          HEADER + FILTER BULAN
      ====================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HistoryIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">History</h2>
            <p className="text-sm text-muted-foreground">
              Riwayat jadwal shift, libur/cuti/izin/sakit, dan revisi absensi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Bulan sebelumnya" onClick={() => changeMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-sm font-semibold">{monthLabel}</p>
          <Button variant="ghost" size="icon" aria-label="Bulan berikutnya" onClick={() => changeMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* ======================================================
          LEGENDA STATUS
      ====================================================== */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        {SHIFT_STATUS_ITEMS.map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 min-w-9 items-center justify-center whitespace-nowrap rounded-md px-1.5 text-[0.68rem] font-bold ring-1",
                item.className,
              )}
            >
              {item.label}
            </span>
            <span className="text-xs text-muted-foreground">{item.title}</span>
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* ======================================================
          HISTORY JADWAL SHIFT
      ====================================================== */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ClipboardList className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight">History Jadwal Shift</h3>
            <p className="text-sm text-muted-foreground">
              Jadwal shift yang tersimpan pada {monthLabel.toLowerCase()}.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Memuat jadwal shift..." />
        ) : !anyStore ? (
          <EmptyState
            title="Tidak ada jadwal shift pada bulan ini."
            description="Belum ada toko pada cakupan Anda."
          />
        ) : (
          <div className="space-y-4">
            {stores.map((store, index) => (
              <HistoryMonthlyTable
                key={store.id}
                store={store}
                index={index + 1}
                employees={employeesByStoreId[store.id] ?? []}
                schedules={schedulesByStore[store.id] ?? []}
                period={period}
              />
            ))}
          </div>
        )}
      </section>

      {/* ======================================================
          HISTORY LIBUR, CUTI, IZIN, SAKIT
      ====================================================== */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HistoryIcon className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight">History Libur, Cuti, Izin, Sakit</h3>
            <p className="text-sm text-muted-foreground">
              Siapa yang libur, cuti, izin, atau sakit pada {monthLabel.toLowerCase()}.
            </p>
          </div>
        </div>

        {/* ==================================================
            PEMILIHAN STORE (khusus CENTRAL PUSAT / CABANG)
        ================================================== */}
        {isCentral && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <label
              htmlFor="history-store-select"
              className="text-sm font-medium text-foreground"
            >
              Pilih Store
            </label>
            <select
              id="history-store-select"
              value={selectedStoreId ?? ""}
              onChange={(event) =>
                setSelectedStoreId(event.target.value || null)
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">-- Pilih Store --</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <LoadingState label="Memuat data status..." />
        ) : isCentral && !selectedStoreId ? (
          <EmptyState
            title="Pilih Store"
            description="Pilih Store terlebih dahulu untuk melihat history libur, cuti, izin, atau sakit."
          />
        ) : filteredStatusItems.length === 0 ? (
          <EmptyState
            title="Tidak ada data libur, cuti, izin, atau sakit pada bulan ini."
          />
        ) : (
          <HistoryTable headers={["Tanggal", "Karyawan", "Status", "Keterangan"]}>
            {filteredStatusItems.map((item) => (
              <tr
                key={item.key}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30"
              >
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {formatTanggal(item.tanggal)}
                </td>
                <td className="px-4 py-3">{item.employeeName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.keterangan}</td>
              </tr>
            ))}
          </HistoryTable>
        )}
      </section>

      {/* ======================================================
          HISTORY REVISI ABSENSI
      ====================================================== */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ClipboardList className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight">History Revisi Absensi</h3>
            <p className="text-sm text-muted-foreground">
              Pengajuan revisi absensi pada {monthLabel.toLowerCase()}.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Memuat data revisi..." />
        ) : isCentral && !selectedStoreId ? (
          <EmptyState
            title="Pilih Store"
            description="Pilih Store terlebih dahulu untuk melihat history revisi absensi."
          />
        ) : filteredRevisiItems.length === 0 ? (
          <EmptyState
            title="Tidak ada revisi absensi pada bulan ini."
          />
        ) : (
          <HistoryTable headers={["Tanggal", "Karyawan", "Jenis Revisi", "Keterangan", "Status"]}>
            {filteredRevisiItems.map((item) => {
              const jenis = getRevisiJenisItem(item.jenisRevisi)
              return (
                <tr
                  key={item.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {formatTanggal(item.tanggal)}
                  </td>
                  <td className="px-4 py-3">{item.employeeName}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{jenis?.label ?? item.jenisRevisi}</p>
                    {item.jenisRevisiLainnya && (
                      <p className="text-xs text-muted-foreground">{item.jenisRevisiLainnya}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.keterangan}</td>
                  <td className="px-4 py-3">
                    <RevisiStatusBadge status={item.status as "BARU" | "PROSES" | "SELESAI"} />
                  </td>
                </tr>
              )
            })}
          </HistoryTable>
        )}
      </section>
    </div>
  )
}
