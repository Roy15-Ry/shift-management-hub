"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  Palmtree,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  EmptyState,
  LoadingState,
} from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"

// ============================================================
// JADWAL LIBUR
//
// Kalender bulanan yang menampilkan karyawan yang berstatus
// LIBUR atau CUTI pada tiap tanggal, dikelompokkan berdasarkan
// toko. Setiap toko memiliki satu warna yang konsisten.
//
// Hanya untuk CENTRAL CABANG & CENTRAL PUSAT. Keterangan umum
// bulan dan keterangan per tanggal dikelola oleh CENTRAL; STORE
// tidak memiliki menu ini (akses dibatasi).
//
// SISTEM KETERANGAN = MENEKST BEBAS (tanpa dropdown / pilihan).
//
// - Per tanggal: klik "+" pada tanggal -> langsung kolom teks.
// - Kolom bawah (KEGIATAN PERUSAHAAN & OPERASIONAL): klik "+" ->
//   area teks multiline; isi diketik manual dan disimpan apa
//   adanya. Jenis keterangan ditentukan otomatis dari konteks
//   (bukan dipilih user).
//
// Data dimuat melalui server (Admin SDK) agar scope role
// divalidasi di sisi server.
// ============================================================

type KeteranganJenis =
  | "kegiatan"
  | "operasional"
  | "tanggal"

const monthFormatter = new Intl.DateTimeFormat(
  "id-ID",
  {
    month: "long",
    year: "numeric",
  },
)

// Warna tinggi-kontras untuk setiap toko. Seluruh anggota string
// ditulis lengkap agar tetap diproses oleh Tailwind.
const STORE_COLORS = [
  "bg-blue-600",
  "bg-red-600",
  "bg-emerald-600",
  "bg-purple-600",
  "bg-orange-500",
  "bg-teal-600",
  "bg-amber-500",
  "bg-pink-600",
  "bg-indigo-600",
  "bg-cyan-600",
  "bg-lime-600",
  "bg-fuchsia-600",
  "bg-sky-600",
  "bg-violet-600",
  "bg-yellow-600",
  "bg-rose-600",
] as const

const DAY_HEADERS = [
  "MINGGU",
  "SENIN",
  "SELASA",
  "RABU",
  "KAMIS",
  "JUMAT",
  "SABTU",
]

// Status yang ditampilkan di kalender JADWAL LIBUR.
const LIBUR_CUTI = new Set(["libur", "cuti"])

// ============================================================
// TYPES
// ============================================================

type JadwalLiburStore = {
  id: string
  nama: string
  kode: string
  cabangId: string
  aktif: boolean
}

type JadwalLiburEmployee = {
  id: string
  name: string
  nik: string
  storeId: string
  cabangId: string
  posisi: string
  aktif: boolean
}

type JadwalLiburSchedule = {
  id: string
  storeId: string
  cabangId: string
  employeeId: string
  tanggal: string
  status: string
  cutiJenis?: string
}

type JadwalLiburKeterangan = {
  id: string
  jenis: KeteranganJenis
  teks: string
  bulan: string
  tanggal: string
  cabangId: string
}

type JadwalLiburData = {
  stores: JadwalLiburStore[]
  employeesByStoreId: Record<
    string,
    JadwalLiburEmployee[]
  >
  schedulesByStore: Record<
    string,
    JadwalLiburSchedule[]
  >
  isCentralPusat: boolean
  keterangan: JadwalLiburKeterangan[]
}

// ============================================================
// UTILITAS TANGGAL
// ============================================================

function getDaysInMonth(
  year: number,
  month: number,
) {
  return new Date(
    year,
    month + 1,
    0,
  ).getDate()
}

function getDateKey(
  year: number,
  month: number,
  day: number,
) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getBulanKey(
  year: number,
  month: number,
) {
  return `${year}-${String(month + 1).padStart(2, "0")}`
}

// ============================================================
// BADGE KARYAWAN (PERSEGI, WARNA TOKO + STATUS)
// ============================================================

function EmployeePill({
  name,
  status,
  cutiJenis,
  colorClass,
}: {
  name: string
  status: "libur" | "cuti"
  cutiJenis?: string
  colorClass: string
}) {
  const isCuti = status === "cuti"
  const cutiSub = isCuti
    ? cutiJenis
      ? `Cuti: ${cutiJenis}`
      : "Cuti"
    : "Libur"

  return (
    <span
      title={`${name} - ${cutiSub}`}
      className={cn(
        // Bentuk persegi lebar konsisten; nama di tengah;
        // nama panjang dipotong dengan ellipsis.
        "flex w-full items-center justify-center gap-1 rounded-none px-1.5 py-1 text-white shadow-sm",
        colorClass,
      )}
    >
      <span className="min-w-0 truncate text-[0.65rem] font-semibold leading-tight">
        {name}
      </span>
      {isCuti && (
        <span className="shrink-0 text-[0.6rem] font-bold leading-tight">
          ©
        </span>
      )}
    </span>
  )
}

// ============================================================
// HALAMAN UTAMA
// ============================================================

export function JadwalLiburPage() {
  const { profile, user } = useAuth()
  const { showToast } = useToast()

  const [period, setPeriod] =
    React.useState(() => {
      const now = new Date()
      return {
        year: now.getFullYear(),
        month: now.getMonth(),
      }
    })

  const [data, setData] =
    React.useState<JadwalLiburData | null>(null)
  const [loading, setLoading] =
    React.useState(true)
  const [error, setError] =
    React.useState("")

  const isCentral =
    profile?.role === "central_cabang" ||
    profile?.role === "central_pusat"

  React.useEffect(() => {
    if (!profile || !user || !isCentral) {
      setLoading(false)
      return
    }

    const authedUser = user
    let cancelled = false
    setLoading(true)
    setError("")

    async function loadData() {
      try {
        const idToken =
          await authedUser.getIdToken()

        const params = new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
        })

        const response = await fetch(
          `/api/jadwal-libur?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${idToken}`,
            },
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error(
            "Data jadwal libur tidak dapat dimuat.",
          )
        }

        const result =
          (await response.json()) as {
            success?: boolean
            stores?: JadwalLiburStore[]
            employeesByStoreId?: Record<
              string,
              JadwalLiburEmployee[]
            >
            schedulesByStore?: Record<
              string,
              JadwalLiburSchedule[]
            >
            keterangan?: JadwalLiburKeterangan[]
            isCentralPusat?: boolean
          }

        if (cancelled) return

        setData({
          stores: Array.isArray(result.stores)
            ? result.stores
            : [],
          employeesByStoreId:
            result.employeesByStoreId &&
            typeof result.employeesByStoreId === "object"
              ? result.employeesByStoreId
              : {},
          schedulesByStore:
            result.schedulesByStore &&
            typeof result.schedulesByStore === "object"
              ? result.schedulesByStore
              : {},
          keterangan: Array.isArray(
            result.keterangan,
          )
            ? result.keterangan
            : [],
          isCentralPusat:
            result.isCentralPusat === true,
        })
      } catch (loadError) {
        console.error(
          "Gagal memuat data Jadwal Libur:",
          loadError,
        )
        if (!cancelled) {
          setError(
            "Data jadwal libur belum dapat dimuat. Silakan coba lagi.",
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
  }, [profile, user, isCentral, period.year, period.month])

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

  // ==========================================================
  // NOT CENTRAL -> akses dibatasi
  // ==========================================================

  if (!isCentral) {
    return (
      <EmptyState
        icon={Palmtree}
        title="Akses dibatasi"
        description="Halaman ini hanya tersedia untuk akun Central Cabang dan Central Pusat."
      />
    )
  }

  if (loading) {
    return (
      <LoadingState label="Memuat jadwal libur..." />
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={Palmtree}
        title="Jadwal belum dapat dimuat"
        description={error}
      />
    )
  }

  // ==========================================================
  // DATA SIAP
  // ==========================================================

  if (!data) {
    return null
  }

  const stores = (
    data.stores ?? []
  ).sort((a, b) =>
    a.nama.localeCompare(
      b.nama,
      "id",
      { sensitivity: "base" },
    ),
  )

  // Warna konsisten per toko (berdasarkan urutan toko).
  const colorByStoreId = new Map<
    string,
    string
  >()

  stores.forEach((store, index) => {
    colorByStoreId.set(
      store.id,
      STORE_COLORS[
        index % STORE_COLORS.length
      ],
    )
  })

  // Periksa apakah ada jadwal LIBUR/CUTI pada bulan ini.
  const hasAnyLiburCuti =
    Object.values(
      data.schedulesByStore ?? {},
    ).some((schedules) =>
      schedules.some(
        (s) =>
          LIBUR_CUTI.has(s.status),
      ),
    )

  const keterangan = data.keterangan ?? []
  const kegiatan = keterangan.filter(
    (k) => k.jenis === "kegiatan",
  )
  const operasional = keterangan.filter(
    (k) => k.jenis === "operasional",
  )

  // ==========================================================
  // PENYIMPANAN / PENGHAPUSAN KETERANGAN
  // ==========================================================

  async function handleSaveKeterangan(
    payload: {
      id?: string
      jenis: KeteranganJenis
      teks: string
      tanggal?: string
    },
  ) {
    if (!user) return

    try {
      const idToken = await user.getIdToken()

      const body: Record<string, unknown> = {
        id: payload.id,
        jenis: payload.jenis,
        teks: payload.teks,
        bulan: getBulanKey(period.year, period.month),
      }
      if (payload.tanggal) {
        body.tanggal = payload.tanggal
      }

      const response = await fetch(
        "/api/jadwal-libur",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${idToken}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        },
      )

      const result =
        (await response.json()) as {
          success?: boolean
          message?: string
          id?: string
        }

      if (!response.ok || !result.success) {
        throw new Error(
          result?.message ??
            "Keterangan gagal disimpan.",
        )
      }

      showToast(
        "success",
        "Keterangan tersimpan",
        payload.id
          ? "Keterangan berhasil diperbarui."
          : "Keterangan berhasil ditambahkan.",
      )

      await refreshKeterangan()
    } catch (saveError) {
      console.error(
        "Gagal menyimpan keterangan:",
        saveError,
      )
      showToast(
        "error",
        "Gagal menyimpan",
        saveError instanceof Error
          ? saveError.message
          : undefined,
      )
    }
  }

  async function handleDeleteKeterangan(
    item: JadwalLiburKeterangan,
  ) {
    if (!user) return
    if (
      !window.confirm(
        "Hapus keterangan ini?",
      )
    ) {
      return
    }

    try {
      const idToken = await user.getIdToken()

      const response = await fetch(
        "/api/jadwal-libur",
        {
          method: "DELETE",
          headers: {
            Authorization:
              `Bearer ${idToken}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            id: item.id,
          }),
        },
      )

      const result =
        (await response.json()) as {
          success?: boolean
          message?: string
        }

      if (!response.ok || !result.success) {
        throw new Error(
          result?.message ??
            "Keterangan gagal dihapus.",
        )
      }

      showToast(
        "success",
        "Keterangan dihapus",
        "Keterangan berhasil dihapus.",
      )
      await refreshKeterangan()
    } catch (deleteError) {
      console.error(
        "Gagal menghapus keterangan:",
        deleteError,
      )
      showToast(
        "error",
        "Gagal menghapus",
        deleteError instanceof Error
          ? deleteError.message
          : undefined,
      )
    }
  }

  async function refreshKeterangan() {
    if (!user) return

    try {
      const idToken = await user.getIdToken()
      const params = new URLSearchParams({
        year: String(period.year),
        month: String(period.month),
      })

      const response = await fetch(
        `/api/jadwal-libur?${params.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${idToken}`,
          },
          cache: "no-store",
        },
      )

      if (!response.ok) return

      const result =
        (await response.json()) as {
          keterangan?: JadwalLiburKeterangan[]
        }

      setData((current) =>
        current
          ? {
              ...current,
              keterangan: Array.isArray(
                result.keterangan,
              )
                ? result.keterangan
                : current.keterangan,
            }
          : current,
      )
    } catch (refreshError) {
      console.error(
        "Gagal memuat ulang keterangan:",
        refreshError,
      )
    }
  }

  const sectionCommon = {
    isCentral,
    onSave: handleSaveKeterangan,
    onDelete: handleDeleteKeterangan,
  }

  const bottomColumns = (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <KeteranganSection
        title="Kegiatan Perusahaan"
        items={kegiatan}
        addJenis="kegiatan"
        {...sectionCommon}
      />
      <KeteranganSection
        title={`Operasional ${monthLabel}`}
        items={operasional}
        addJenis="operasional"
        {...sectionCommon}
      />
    </div>
  )

  // ==========================================================
  // TANPA TOKO PADA SCOPE -> empty state
  // ==========================================================

  if (stores.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          monthLabel={monthLabel}
          changeMonth={changeMonth}
        />
        <EmptyState
          icon={Palmtree}
          title="Tidak ada toko"
          description={
            data.isCentralPusat
              ? "Belum ada data toko."
              : "Belum ada toko aktif pada cabang ini."
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        monthLabel={monthLabel}
        changeMonth={changeMonth}
      />

      {/* KETERANGAN TOKO (legenda warna toko) */}
      <StoreLegend
        stores={stores}
        colorByStoreId={colorByStoreId}
      />

      {/* KALENDER */}
      <CalendarGrid
        period={period}
        stores={stores}
        data={data}
        colorByStoreId={colorByStoreId}
        isCentral={isCentral}
        onSave={handleSaveKeterangan}
        onDelete={handleDeleteKeterangan}
      />

      {/* DUA KOLOM KETERANGAN DI BAWAH KALENDER */}
      {bottomColumns}
    </div>
  )
}

// ============================================================
// HEADER JUDUL + NAVIGASI BULAN
// ============================================================

function PageHeader({
  monthLabel,
  changeMonth,
}: {
  monthLabel: string
  changeMonth: (offset: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Jadwal Libur
        </h2>
        <p className="text-sm text-muted-foreground">
          Jadwal libur dan cuti karyawan per bulan
        </p>
      </div>

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
  )
}

// ============================================================
// LEGENDA WARNA TOKO
// ============================================================

function StoreLegend({
  stores,
  colorByStoreId,
}: {
  stores: JadwalLiburStore[]
  colorByStoreId: Map<string, string>
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Keterangan Toko
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {stores.map((store) => (
          <div
            key={store.id}
            className="flex items-center gap-1.5"
          >
            <span
              className={cn(
                "size-3 shrink-0 rounded-full",
                colorByStoreId.get(
                  store.id,
                ),
              )}
            />
            <span className="text-xs text-foreground">
              {store.nama}
            </span>
          </div>
        ))}
        {stores.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Tidak ada toko.
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================
// KALENDER BULANAN (7 KOLOM)
// ============================================================

function CalendarGrid({
  period,
  stores,
  data,
  colorByStoreId,
  isCentral,
  onSave,
  onDelete,
}: {
  period: { year: number; month: number }
  stores: JadwalLiburStore[]
  data: JadwalLiburData
  colorByStoreId: Map<string, string>
  isCentral: boolean
  onSave: (payload: {
    id?: string
    jenis: KeteranganJenis
    teks: string
    tanggal?: string
  }) => Promise<void> | void
  onDelete: (item: JadwalLiburKeterangan) => void
}) {
  const { year, month } = period
  const daysInMonth =
    getDaysInMonth(year, month)

  // Input teks per tanggal (tambah).
  const [addingDate, setAddingDate] =
    React.useState<string | null>(null)
  const [addDraft, setAddDraft] =
    React.useState("")

  // Input teks per tanggal (ubah).
  const [editingKey, setEditingKey] =
    React.useState<string | null>(null)
  const [editDraft, setEditDraft] =
    React.useState("")

  // 0 = MINGGU ... 6 = SABTU
  const firstWeekday =
    new Date(
      year,
      month,
      1,
    ).getDay()

  // Peta employeeId -> nama untuk resolusi cepat.
  const nameByEmployeeId =
    new Map<
      string,
      string
    >()

  stores.forEach((store) => {
    const employees =
      data.employeesByStoreId[
        store.id
      ] ?? []
    employees.forEach((e) => {
      nameByEmployeeId.set(
        e.id,
        e.name,
      )
    })
  })

  // Jadwal LIBUR/CUTI per tanggal, dikelompokkan toko lalu
  // karyawan (urutan toko -> karyawan).
  const scheduleByDay = new Map<
    string,
    {
      key: string
      storeName: string
      colorClass: string
      employeeName: string
      status: "libur" | "cuti"
      cutiJenis?: string
    }[]
  >()

  stores.forEach((store) => {
    const schedules =
      (data.schedulesByStore[
        store.id
      ] ?? []).filter(
        (s) =>
          LIBUR_CUTI.has(s.status),
      )

    const colorClass =
      colorByStoreId.get(
        store.id,
      ) ?? "bg-slate-600"

    schedules.forEach((s, idx) => {
      if (!s.tanggal) return

      const entry = {
        key: `${s.id}-${idx}`,
        storeName: store.nama,
        colorClass,
        employeeName:
          nameByEmployeeId.get(
            s.employeeId,
          ) ?? "-",
        status:
          s.status === "cuti"
            ? ("cuti" as const)
            : ("libur" as const),
        cutiJenis: s.cutiJenis,
      }

      const existing =
        scheduleByDay.get(
          s.tanggal,
        ) ?? []
      existing.push(entry)
      scheduleByDay.set(
        s.tanggal,
        existing,
      )
    })
  })

  // Keterangan per tanggal.
  const tanggalByDay = new Map<
    string,
    JadwalLiburKeterangan[]
  >()

  ;(data.keterangan ?? []).forEach(
    (k) => {
      if (k.jenis !== "tanggal")
        return
      const list =
        tanggalByDay.get(
          k.tanggal,
        ) ?? []
      list.push(k)
      tanggalByDay.set(
        k.tanggal,
        list,
      )
    },
  )

  async function handleCreateTanggal(
    dateKey: string,
  ) {
    const teks = addDraft.trim()
    if (!teks) return
    await onSave({
      jenis: "tanggal",
      teks,
      tanggal: dateKey,
    })
    setAddingDate(null)
    setAddDraft("")
  }

  async function handleUpdateTanggal(
    item: JadwalLiburKeterangan,
  ) {
    const teks = editDraft.trim()
    if (!teks) return
    await onSave({
      id: item.id,
      jenis: "tanggal",
      teks,
      tanggal: item.tanggal,
    })
    setEditingKey(null)
    setEditDraft("")
  }

  // Sel-sel: sel kosong di awal (minggu pertama) + hari.
  const leadingEmpty =
    Array.from({
      length: firstWeekday,
    }).map((_, i) => i)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <div className="min-w-[760px]">
        {/* Header 7 kolom */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="border-r border-border px-2 py-2 text-center text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Grid hari */}
        <div className="grid grid-cols-7">
          {leadingEmpty.map((i) => (
            <div
              key={`empty-${i}`}
              className="min-h-28 border-b border-r border-border bg-muted/10 p-1 last:border-r-0"
            />
          ))}

          {Array.from({
            length: daysInMonth,
          }).map((_, index) => {
            const day = index + 1
            const dateKey =
              getDateKey(
                year,
                month,
                day,
              )
            const items =
              scheduleByDay.get(
                dateKey,
              ) ?? []
            const tanggalItems =
              tanggalByDay.get(
                dateKey,
              ) ?? []

            const isAdding =
              addingDate === dateKey

            return (
              <div
                key={dateKey}
                className="relative min-h-28 border-b border-r border-border p-1.5 last:border-r-0"
              >
                <div className="mb-1 text-center text-xs font-semibold text-foreground">
                  {day}
                </div>

                {/* Action group per tanggal: [ + ] [ ✏ ] [ 🗑 ] */}
                {isCentral && (
                  <div className="mb-1 flex items-center justify-center gap-1">
                    <ActionButton
                      small
                      title="Tambah keterangan"
                      onClick={() => {
                        setAddingDate(
                          isAdding
                            ? null
                            : dateKey,
                        )
                        setAddDraft("")
                        setEditingKey(null)
                        setEditDraft("")
                      }}
                    >
                      <Plus className="size-3" />
                    </ActionButton>
                    {tanggalItems.length > 0 && (
                      <>
                        <ActionButton
                          small
                          title="Ubah keterangan"
                          onClick={() => {
                            const last =
                              tanggalItems[
                                tanggalItems.length -
                                  1
                              ]
                            setEditingKey(
                              last.id,
                            )
                            setEditDraft(
                              last.teks,
                            )
                            setAddingDate(null)
                          }}
                        >
                          <PenLine className="size-3" />
                        </ActionButton>
                        <ActionButton
                          small
                          danger
                          title="Hapus keterangan"
                          onClick={() =>
                            onDelete(
                              tanggalItems[
                                tanggalItems.length -
                                  1
                              ],
                            )
                          }
                        >
                          <Trash2 className="size-3" />
                        </ActionButton>
                      </>
                    )}
                  </div>
                )}

                {/* Input teks manual per tanggal */}
                {isAdding && isCentral && (
                  <div className="mb-1 flex flex-col gap-1">
                    <textarea
                      value={addDraft}
                      onChange={(e) =>
                        setAddDraft(
                          e.target.value,
                        )
                      }
                      rows={2}
                      placeholder="Tulis keterangan..."
                      autoFocus
                      className="w-full resize-none rounded-sm border border-input bg-card px-1.5 py-1 text-[0.6rem] text-foreground shadow-sm outline-none focus-visible:border-ring"
                    />
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          setAddingDate(null)
                          setAddDraft("")
                        }}
                      >
                        Batal
                      </Button>
                      <Button
                        size="xs"
                        disabled={
                          !addDraft.trim()
                        }
                        onClick={() =>
                          handleCreateTanggal(
                            dateKey,
                          )
                        }
                      >
                        Simpan
                      </Button>
                    </div>
                  </div>
                )}

                {/* Keterangan manual pada tanggal (PALING ATAS) */}
                {tanggalItems.length > 0 && (
                  <div className="mb-1 flex flex-col gap-0.5">
                    {tanggalItems.map(
                      (k) => {
                        const isEditing =
                          editingKey ===
                          k.id
                        return isEditing ? (
                          <div
                            key={k.id}
                            className="flex flex-col gap-1"
                          >
                            <textarea
                              value={
                                editDraft
                              }
                              onChange={(e) =>
                                setEditDraft(
                                  e.target
                                    .value,
                                )
                              }
                              rows={2}
                              autoFocus
                              className="w-full resize-none rounded-sm border border-input bg-card px-1.5 py-1 text-[0.6rem] text-foreground shadow-sm outline-none focus-visible:border-ring"
                            />
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => {
                                  setEditingKey(
                                    null,
                                  )
                                  setEditDraft(
                                    "",
                                  )
                                }}
                              >
                                Batal
                              </Button>
                              <Button
                                size="xs"
                                disabled={
                                  !editDraft.trim()
                                }
                                onClick={() =>
                                  handleUpdateTanggal(
                                    k,
                                  )
                                }
                              >
                                Simpan
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            key={k.id}
                            title={k.teks}
                            className="truncate rounded-sm border border-white/90 bg-black px-1 py-0.5 text-center text-[0.6rem] font-medium leading-tight text-white"
                          >
                            {k.teks}
                          </div>
                        )
                      },
                    )}
                  </div>
                )}

                {items.length > 0 ? (
                  <div className="flex w-full flex-col items-stretch gap-1">
                    {items.map(
                      (item) => (
                        <EmployeePill
                          key={item.key}
                          name={
                            item.employeeName
                          }
                          status={
                            item.status
                          }
                          cutiJenis={
                            item.cutiJenis
                          }
                          colorClass={
                            item.colorClass
                          }
                        />
                      ),
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-5 items-center justify-center rounded-sm border border-dashed border-border">
                    <span className="text-[0.6rem] text-muted-foreground/50">
                      -
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// TOMBOL AKSI KETERANGAN ( + / ✏ / 🗑 )
// ============================================================

function ActionButton({
  title,
  small,
  danger,
  onClick,
  children,
}: {
  title: string
  small?: boolean
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
        small
          ? "flex size-4 rounded-sm hover:bg-muted hover:text-foreground"
          : "flex size-6 hover:bg-muted hover:text-foreground",
        danger
          ? "hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          : "",
      )}
    >
      {children}
    </button>
  )
}

// ============================================================
// KETERANGAN BULAN (KOLOM DI BAWAH KALENDER)
// ============================================================

function KeteranganSection({
  title,
  items,
  addJenis,
  isCentral,
  onSave,
  onDelete,
}: {
  title: string
  items: JadwalLiburKeterangan[]
  addJenis: KeteranganJenis
  isCentral: boolean
  onSave: (payload: {
    id?: string
    jenis: KeteranganJenis
    teks: string
    tanggal?: string
  }) => Promise<void> | void
  onDelete: (item: JadwalLiburKeterangan) => void
}) {
  const [mode, setMode] =
    React.useState<
      | { type: "add" }
      | { type: "edit"; item: JadwalLiburKeterangan }
      | null
    >(null)
  const [text, setText] =
    React.useState("")

  function startAdd() {
    setMode({ type: "add" })
    setText("")
  }

  function startEdit(item: JadwalLiburKeterangan) {
    setMode({ type: "edit", item })
    setText(item.teks)
  }

  async function handleSave() {
    if (!text.trim() || !mode) return
    await onSave({
      id:
        mode.type === "edit"
          ? mode.item.id
          : undefined,
      jenis:
        mode.type === "edit"
          ? mode.item.jenis
          : addJenis,
      teks: text.trim(),
    })
    setMode(null)
    setText("")
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex-1 text-center text-sm font-bold tracking-tight">
          {title}
        </h3>
        {isCentral && (
          <div className="flex shrink-0 items-center gap-1">
            <ActionButton title="Tambah" onClick={startAdd}>
              <Plus className="size-4" />
            </ActionButton>
            {items.length > 0 && (
              <>
                <ActionButton
                  title="Ubah"
                  onClick={() =>
                    startEdit(
                      items[
                        items.length - 1
                      ],
                    )
                  }
                >
                  <PenLine className="size-4" />
                </ActionButton>
                <ActionButton
                  danger
                  title="Hapus"
                  onClick={() =>
                    onDelete(
                      items[
                        items.length - 1
                      ],
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </ActionButton>
              </>
            )}
          </div>
        )}
      </div>

      {/* Form input teks manual (tanpa dropdown / pilihan) */}
      {mode && isCentral && (
        <div className="mb-3 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) =>
              setText(e.target.value)
            }
            rows={4}
            placeholder="Ketik keterangan secara manual..."
            autoFocus
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode(null)
                setText("")
              }}
            >
              Batal
            </Button>
            <Button
              size="sm"
              disabled={!text.trim()}
              onClick={handleSave}
            >
              {mode.type === "edit"
                ? "Simpan Perubahan"
                : "Simpan"}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada keterangan.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <span
                className="block min-w-0 whitespace-pre-line text-sm text-foreground"
                title={item.teks}
              >
                {item.teks}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
