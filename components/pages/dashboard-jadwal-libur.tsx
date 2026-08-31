"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  Palmtree,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  EmptyState,
  LoadingState,
} from "@/components/controls"
import { useAuth } from "@/components/auth-context"

import {
  CalendarGrid,
  KeteranganSection,
  StoreLegend,
  type JadwalLiburData,
  type JadwalLiburEmployee,
  type JadwalLiburKeterangan,
  type JadwalLiburSchedule,
  type JadwalLiburStore,
} from "@/components/pages/jadwal-libur"

// ============================================================
// SECTION JADWAL LIBUR — DASHBOARD STORE (READ-ONLY)
//
// Menampilkan hasil JADWAL LIBUR pada Dashboard akun STORE dengan
// sumber data yang SAMA dengan halaman Jadwal Libur (endpoint
// /api/jadwal-libur). Akun STORE otomatis hanya membaca data
// cabangnya. Bagian ini murni untuk melihat (read-only): tidak ada
// tombol tambah/edit/hapus, tidak ada form, tidak ada input.
// ============================================================

const monthFormatter = new Intl.DateTimeFormat(
  "id-ID",
  {
    month: "long",
    year: "numeric",
  },
)

// Warna tinggi-kontras untuk setiap toko (identik dengan halaman
// JADWAL LIBUR agar warna toko konsisten).
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

type DashboardLiburResult = {
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
}

export function DashboardJadwalLibur() {
  const { profile, user } = useAuth()

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
          (await response.json()) as DashboardLiburResult

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
          isCentralPusat: false,
        })
      } catch (loadError) {
        console.error(
          "Gagal memuat JADWAL LIBUR Dashboard:",
          loadError,
        )
        if (!cancelled) {
          setError(
            "Data jadwal libur belum dapat dimuat.",
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
  }, [profile, user, period.year, period.month])

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

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <LoadingState label="Memuat jadwal libur..." />
      </div>
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

  const keterangan = data.keterangan ?? []
  const kegiatan = keterangan.filter(
    (k) => k.jenis === "kegiatan",
  )
  const operasional = keterangan.filter(
    (k) => k.jenis === "operasional",
  )

  const noopSave = async () => {}
  const noopDelete = () => {}

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Jadwal Libur
          </h3>
          <p className="text-xs text-muted-foreground">
            Libur &amp; cuti karyawan cabang
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
          <p className="min-w-40 text-center text-sm font-semibold">
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

      {stores.length === 0 ? (
        <EmptyState
          icon={Palmtree}
          title="Tidak ada toko"
          description="Belum ada toko aktif pada cabang ini."
        />
      ) : (
        <div className="space-y-4">
          <StoreLegend
            stores={stores}
            colorByStoreId={colorByStoreId}
          />

          <CalendarGrid
            period={period}
            stores={stores}
            data={data}
            colorByStoreId={colorByStoreId}
            isCentral={false}
            onSave={noopSave}
            onDelete={noopDelete}
          />

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <KeteranganSection
              title="Kegiatan Perusahaan"
              items={kegiatan}
              addJenis="kegiatan"
              isCentral={false}
              onSave={noopSave}
              onDelete={noopDelete}
            />
            <KeteranganSection
              title={`Operasional ${monthLabel}`}
              items={operasional}
              addJenis="operasional"
              isCentral={false}
              onSave={noopSave}
              onDelete={noopDelete}
            />
          </div>
        </div>
      )}
    </div>
  )
}
