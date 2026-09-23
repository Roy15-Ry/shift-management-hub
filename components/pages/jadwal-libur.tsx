"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Palmtree,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/components/ui/toast"
import {
  EmptyState,
  LoadingState,
  SelectField,
} from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"
import { generateJadwalLiburPdf } from "@/lib/pdf-jadwal-libur"
import { slugifyStoreName } from "@/lib/pdf-shift"

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

export type KeteranganJenis =
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
// LABEL TAMPILAN CABANG UNTUK PDF
//
// cabangId tetap dipakai untuk filtering dan scope data.
// Mapping ini HANYA untuk tampilan PDF / nama file — TIDAK
// mengubah data sumber.
// ============================================================

const CABANG_DISPLAY_LABEL: Record<string, string> = {
  "BGR-1": "CABANG BOGOR - BANTEN",
  "CJR-1": "CABANG CIANJUR - CIPANAS",
}

function displayCabangLabel(cabangId: string): string {
  const normalized = String(cabangId ?? "")
    .trim()
    .toUpperCase()
  if (!normalized) return "CABANG"
  return (
    CABANG_DISPLAY_LABEL[normalized] ??
    `CABANG ${normalized}`
  )
}

// ============================================================
// TYPES
// ============================================================

export type JadwalLiburStore = {
  id: string
  nama: string
  kode: string
  cabangId: string
  aktif: boolean
}

export type JadwalLiburEmployee = {
  id: string
  name: string
  nik: string
  storeId: string
  cabangId: string
  posisi: string
  aktif: boolean
}

export type JadwalLiburSchedule = {
  id: string
  storeId: string
  cabangId: string
  employeeId: string
  tanggal: string
  status: string
  cutiJenis?: string
}

export type JadwalLiburKeterangan = {
  id: string
  jenis: KeteranganJenis
  teks: string
  bulan: string
  tanggal: string
  cabangId: string
  /*
   * Penanda item OTOMATIS yang dibentuk saat rendering dari jadwal
   * libur (schedulesByStore + employeesByStoreId), bukan dokumen
   * Firestore. true -> read-only, tidak bisa diedit/dihapus.
   */
  auto?: boolean
}

export type JadwalLiburData = {
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
// OPERASIONAL — ITEM OTOMATIS DARI JADWAL LIBUR
// ============================================================
//
// Data otomatis dibentuk SAAT RENDERING dari schedulesByStore +
// employeesByStoreId (data GET /api/jadwal-libur). Tidak pernah
// disimpan ke collection jadwal-libur-keterangan, sehingga ketika
// jadwal libur berubah, Operasional otomatis ikut terbarui tanpa
// sinkronisasi tambahan.
//
// Format baris:
//   [Tanggal] [Bulan] [Tahun] : [Nama Karyawan] [Keterangan]
//
// HANYA schedule berstatus "cuti" yang menjadi item otomatis.
// Status "libur" TIDAK masuk ke Operasional.
//
// Contoh:
//   "1 September 2026 : Yana Supriatna Cuti"
//   "2 September 2026 : Yana Supriatna Cuti Tahunan"
//   "3 September 2026 : Ahmad Azhari Cuti Melahirkan"

const operasionalDateFormatter = new Intl.DateTimeFormat(
  "id-ID",
  {
    day: "numeric",
    month: "long",
    year: "numeric",
  },
)

function formatOperasionalDate(tanggal: string): string {
  const [rawYear, rawMonth, rawDay] =
    tanggal.split("-")
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)

  if (!year || !month || !day) {
    return tanggal
  }

  return operasionalDateFormatter.format(
    new Date(
      year,
      month - 1,
      day,
    ),
  )
}

// Membangun item OPERASIONAL gabungan: keterangan manual (dari
// collection jadwal-libur-keterangan) + item otomatis (dari jadwal
// libur). Hanya schedule berstatus "cuti" yang menjadi item
// otomatis (status "libur" tidak termasuk). Item otomatis ditandai
// auto: true dan diurutkan berdasarkan tanggal ISO YYYY-MM-DD
// (ASCENDING).
export function buildOperasionalItems(
  data: Pick<
    JadwalLiburData,
    "keterangan" | "employeesByStoreId" | "schedulesByStore"
  >,
): JadwalLiburKeterangan[] {
  const manual = (
    data.keterangan ?? []
  ).filter(
    (item) =>
      item.jenis === "operasional",
  )

  // Peta id employee -> name untuk lookup cepat.
  const employeeById = new Map<string, string>()

  for (const employees of Object.values(
    data.employeesByStoreId ?? {},
  )) {
    for (const employee of employees) {
      if (!employeeById.has(employee.id)) {
        employeeById.set(
          employee.id,
          employee.name,
        )
      }
    }
  }

  const auto: JadwalLiburKeterangan[] = []

  for (const schedules of Object.values(
    data.schedulesByStore ?? {},
  )) {
    for (const schedule of schedules) {
      const status = (
        schedule.status ?? ""
      )
        .trim()
        .toLowerCase()

      if (
        status !== "cuti"
      ) {
        continue
      }

      const nama =
        employeeById.get(
          schedule.employeeId,
        ) ?? "-"

      let keterangan: string
      keterangan = (
        schedule.cutiJenis ?? ""
      ).trim()
      if (!keterangan) {
        keterangan = "Cuti"
      }

      const tanggal =
        schedule.tanggal ?? ""

      auto.push({
        id: `auto:${schedule.storeId ?? ""}:${schedule.employeeId ?? ""}:${tanggal}`,
        jenis: "operasional",
        teks: `${formatOperasionalDate(tanggal)} : ${nama} ${keterangan}`,
        bulan: tanggal.slice(0, 7),
        tanggal,
        cabangId:
          schedule.cabangId ?? "",
        auto: true,
      })
    }
  }

  auto.sort((a, b) =>
    a.tanggal < b.tanggal
      ? -1
      : a.tanggal > b.tanggal
        ? 1
        : 0,
  )

  return [...manual, ...auto]
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

  // Filter cabang HANYA untuk CENTRAL PUSAT.
  // "" = belum memilih cabang; selain itu = cabang terpilih.
  const [cabangFilter, setCabangFilter] =
    React.useState("")
  // Daftar cabang untuk dropdown CENTRAL PUSAT.
  const [branchOptions, setBranchOptions] =
    React.useState<string[]>([])

  const [data, setData] =
    React.useState<JadwalLiburData | null>(null)
  const [loading, setLoading] =
    React.useState(true)
  const [error, setError] =
    React.useState("")

  // Keterangan yang menunggu konfirmasi HAPUS (custom dialog).
  const [pendingDelete, setPendingDelete] =
    React.useState<JadwalLiburKeterangan | null>(null)

  // Sedang menyiapkan PDF (cegah double click saat generate).
  const [pdfLoading, setPdfLoading] =
    React.useState(false)

  // Penanda urutan request agar response lama tidak menimpa
  // state hasil request yang lebih baru (loadData / refresh).
  const requestSeqRef = React.useRef(0)

  // Tahap 4: kalender TIDAK dimuat saat halaman dibuka. Kalender
  // baru dimuat ketika user menekan "LIHAT JADWAL LIBUR".
  const [calendarOpen, setCalendarOpen] =
    React.useState(false)
  // Context (tahun/bulan/cabang) yang SUDAH berhasil dimuat penuh.
  // Hanya diisi setelah full GET sukses; dipakai agar buka kembali
  // dengan context yang sama TIDAK melakukan GET ulang.
  const loadedContextRef =
    React.useRef<{
      year: number
      month: number
      cabang: string
    } | null>(null)

  const isCentral =
    profile?.role === "central_cabang" ||
    profile?.role === "central_pusat"

  const isCentralPusat =
    profile?.role === "central_pusat"

  // Muat daftar cabang untuk dropdown CENTRAL PUSAT.
  React.useEffect(() => {
    if (!isCentralPusat || !user) {
      return
    }

    const authedUser = user
    let cancelled = false

    async function loadBranches() {
      try {
        const idToken = await authedUser.getIdToken()
        const response = await fetch(
          "/api/admin/branches",
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
            cache: "no-store",
          },
        )

        if (!response.ok) return

        const result =
          (await response.json()) as {
            success?: boolean
            branches?: {
              cabangId?: string
              nama?: string
            }[]
          }

        if (cancelled || !result.success) return

        const list = (result.branches ?? [])
          .map((b) => String(b.cabangId ?? "").trim().toUpperCase())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))

        setBranchOptions(list)
      } catch (branchError) {
        console.error(
          "Gagal memuat daftar cabang:",
          branchError,
        )
      }
    }

    loadBranches()

    return () => {
      cancelled = true
    }
  }, [isCentralPusat, user])

  React.useEffect(() => {
    if (!profile || !user || !isCentral) {
      setLoading(false)
      return
    }

    // Tahap 4: selama kalender tertutup, JANGAN melakukan full GET.
    if (!calendarOpen) {
      setLoading(false)
      return
    }

    // Reuse: bila context (tahun, bulan, cabang) sudah pernah
    // dimuat, gunakan data yang ada — tanpa GET ulang.
    const loadedContext =
      loadedContextRef.current
    if (
      loadedContext !== null &&
      loadedContext.year === period.year &&
      loadedContext.month === period.month &&
      loadedContext.cabang === cabangFilter
    ) {
      setLoading(false)
      return
    }

    const authedUser = user
    let cancelled = false
    setLoading(true)
    setError("")

    async function loadData() {
      const seq = ++requestSeqRef.current
      try {
        const idToken =
          await authedUser.getIdToken()

        const params = new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
        })

        if (isCentralPusat && cabangFilter) {
          params.set("cabang", cabangFilter)
        }

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

        // Abaikan bila sudah ada request yang lebih baru.
        if (
          cancelled ||
          seq !== requestSeqRef.current
        ) {
          return
        }

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

        // Context dianggap loaded HANYA setelah full GET sukses.
        // Jika request gagal, context TIDAK ditandai loaded sehingga
        // buka kembali tetap melakukan GET (retry).
        loadedContextRef.current = {
          year: period.year,
          month: period.month,
          cabang: cabangFilter,
        }
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
  }, [profile, user, isCentral, isCentralPusat, cabangFilter, period.year, period.month, calendarOpen])

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

  // Tahap 4: buka kalender. Bila context (tahun/bulan/cabang) belum
  // dimuat atau berbeda dari yang terakhir dimuat, tampilkan loading
  // DAHULU agar data lama bulan/cabang lain tidak berkedip satu frame.
  // Full GET tetap dijalankan oleh effect (bukan handler ini).
  function handleOpenCalendar() {
    const loadedContext =
      loadedContextRef.current
    const sameContext =
      loadedContext !== null &&
      loadedContext.year === period.year &&
      loadedContext.month === period.month &&
      loadedContext.cabang === cabangFilter
    if (!sameContext) {
      setLoading(true)
    }
    setCalendarOpen(true)
  }

  // Tutup kalender: data PERTAHANKAN (tidak direset) agar buka
  // kembali dengan context yang sama tidak melakukan GET ulang.
  function handleCloseCalendar() {
    setCalendarOpen(false)
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

  // Tahap 4: selama kalender tertutup, jangan render konten kalender
  // (CalendarGrid, legenda, keterangan, PDF) dan jangan memuat data.
  if (!calendarOpen) {
    return (
      <div className="space-y-5">
        <PageHeader
          monthLabel={monthLabel}
          changeMonth={changeMonth}
        />

        {/* FILTER CABANG — HANYA CENTRAL PUSAT (dapat diubah saat tertutup) */}
        {isCentralPusat && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">
                Cabang
              </h3>
              <p className="text-xs text-muted-foreground">
                Pilih cabang untuk melihat jadwal liburnya.
              </p>
            </div>
            <div className="w-full sm:w-60">
              <SelectField
                value={cabangFilter}
                onChange={setCabangFilter}
                options={[
                  {
                    value: "",
                    label: "Pilih Cabang",
                  },
                  ...branchOptions.map(
                    (cabangId) => ({
                      value: cabangId,
                      label: cabangId,
                    }),
                  ),
                ]}
              />
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Jadwal Libur
              </h3>
              <p className="text-xs text-muted-foreground">
                Libur &amp; cuti karyawan per bulan.
              </p>
            </div>
            <Button
              onClick={handleOpenCalendar}
              disabled={isCentralPusat && !cabangFilter}
            >
              <Palmtree className="mr-2 size-4" />
              LIHAT JADWAL LIBUR
            </Button>
          </div>
        </div>
      </div>
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
  const operasional = buildOperasionalItems(data)

  // ==========================================================
  // SIMPAN SEBAGAI PDF (HANYA CENTRAL)
  //
  // Memakai data yang SUDAH dimuat halaman (tidak ada fetch,
  // query, maupun write Firestore tambahan). Operasional
  // memakai buildOperasionalItems(data) yang sudah ada.
  // ==========================================================

  async function handleDownloadPdf() {
    if (pdfLoading || !data) return

    const scopeLabel = isCentralPusat
      ? cabangFilter
        ? displayCabangLabel(cabangFilter)
        : "SEMUA CABANG"
      : displayCabangLabel(profile?.cabangId ?? "")
    if (!scopeLabel) return

    setPdfLoading(true)
    try {
      const monthToken =
        monthLabel.split(" ")[0] ?? monthLabel
      const filename = `JADWAL_LIBUR_${slugifyStoreName(scopeLabel).toUpperCase()}_${monthToken}_${period.year}.pdf`

      await generateJadwalLiburPdf({
        scopeLabel,
        year: period.year,
        month: period.month,
        monthLabel,
        stores,
        employeesByStoreId:
          data.employeesByStoreId,
        schedulesByStore:
          data.schedulesByStore,
        kegiatan: kegiatan.map((item) => ({
          id: item.id,
          teks: item.teks,
        })),
        operasional: operasional.map((item) => ({
          id: item.id,
          teks: item.teks,
        })),
        filename,
      })
    } finally {
      setPdfLoading(false)
    }
  }

  // ==========================================================
  // PENYIMPANAN / PENGHAPUSAN KETERANGAN
  // ==========================================================

  // Bangun item keterangan lokal dengan struktur yang sama seperti
  // hasil GET, agar state UI dapat langsung diperbarui tanpa
  // menunggu GET berat. Auto Cuti TIDAK dibuat di sini.
  function buildLocalKeterangan(
    payload: {
      id?: string
      jenis: KeteranganJenis
      teks: string
      tanggal?: string
    },
    id: string,
  ): JadwalLiburKeterangan {
    const tanggal =
      payload.jenis === "tanggal"
        ? payload.tanggal ?? ""
        : ""
    const bulan =
      payload.jenis === "tanggal"
        ? tanggal.slice(0, 7)
        : getBulanKey(period.year, period.month)
    const cabangId = String(
      (isCentralPusat
        ? cabangFilter
        : profile?.cabangId) ?? "",
    )
      .trim()
      .toUpperCase()

    return {
      id,
      jenis: payload.jenis,
      teks: payload.teks,
      bulan,
      tanggal,
      cabangId,
    }
  }

  // Tambah item baru atau ganti item lama (id sama) di state lokal.
  function upsertLocalKeterangan(
    item: JadwalLiburKeterangan,
  ) {
    setData((current) => {
      if (!current) return current
      const exists = current.keterangan.some(
        (k) => k.id === item.id,
      )
      return {
        ...current,
        keterangan: exists
          ? current.keterangan.map((k) =>
              k.id === item.id
                ? { ...k, ...item }
                : k,
            )
          : [...current.keterangan, item],
      }
    })
  }

  // Hapus item berdasarkan id di state lokal.
  function removeLocalKeterangan(id: string) {
    setData((current) =>
      current
        ? {
            ...current,
            keterangan: current.keterangan.filter(
              (k) => k.id !== id,
            ),
          }
        : current,
    )
  }

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
      // CENTRAL PUSAT: simpan keterangan sesuai filter cabang aktif.
      if (isCentralPusat && cabangFilter) {
        body.cabang = cabangFilter
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

      const savedId = result.id ?? payload.id

      if (!savedId) {
        throw new Error(
          "Keterangan tersimpan tetapi ID tidak diterima.",
        )
      }

      // Perbarui state lokal DULU agar UI langsung berubah,
      // baru tampilkan toast sukses (tanpa menunggu GET berat).
      upsertLocalKeterangan(
        buildLocalKeterangan(payload, savedId),
      )

      showToast(
        "success",
        "Keterangan tersimpan",
        payload.id
          ? "Keterangan berhasil diperbarui."
          : "Keterangan berhasil ditambahkan.",
      )

      // Rekonsiliasi latar; bukan syarat tampilnya perubahan.
      void refreshKeterangan()
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

  // Membuka dialog konfirmasi HAPUS (pengganti window.confirm).
  function handleDeleteKeterangan(
    item: JadwalLiburKeterangan,
  ) {
    if (!user) return
    setPendingDelete(item)
  }

  // Eksekusi delete existing (dipanggil saat user menekan HAPUS
  // pada dialog konfirmasi).
  async function performDeleteKeterangan(
    item: JadwalLiburKeterangan,
  ) {
    if (!user) return

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

      // Perbarui state lokal DULU agar item langsung hilang,
      // baru tampilkan toast sukses (tanpa menunggu GET berat).
      removeLocalKeterangan(item.id)

      showToast(
        "success",
        "Keterangan dihapus",
        "Keterangan berhasil dihapus.",
      )

      // Rekonsiliasi latar; bukan syarat hilangnya item.
      void refreshKeterangan()
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

    const seq = ++requestSeqRef.current

    try {
      const idToken = await user.getIdToken()
      const params = new URLSearchParams({
        year: String(period.year),
        month: String(period.month),
        fields: "keterangan",
      })

      if (isCentralPusat && cabangFilter) {
        params.set("cabang", cabangFilter)
      }

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
          "Gagal memuat ulang keterangan.",
        )
      }

      const result =
        (await response.json()) as {
          keterangan?: JadwalLiburKeterangan[]
        }

      // Abaikan response ini bila sudah ada request yang
      // lebih baru (mis. ganti bulan / filter cabang).
      if (seq !== requestSeqRef.current) return

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
      // Pertahankan state yang ada; beri feedback hanya bila
      // ini memang request terbaru.
      if (seq === requestSeqRef.current) {
        showToast(
          "error",
          "Gagal memuat ulang",
          "Perubahan tersimpan, tetapi data terbaru gagal dimuat.",
        )
      }
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
          onClose={handleCloseCalendar}
        />

        {isCentralPusat && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">
                Cabang
              </h3>
              <p className="text-xs text-muted-foreground">
                Pilih cabang untuk melihat dan mengelola jadwal liburnya.
              </p>
            </div>
            <div className="w-full sm:w-60">
              <SelectField
                value={cabangFilter}
                onChange={setCabangFilter}
                options={[
                  {
                    value: "",
                    label: "Pilih Cabang",
                  },
                  ...branchOptions.map(
                    (cabangId) => ({
                      value: cabangId,
                      label: cabangId,
                    }),
                  ),
                ]}
              />
            </div>
          </div>
        )}

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
        onDownload={handleDownloadPdf}
        pdfLoading={pdfLoading}
        onClose={handleCloseCalendar}
      />

      {/* FILTER CABANG — HANYA CENTRAL PUSAT */}
      {isCentralPusat && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Cabang
            </h3>
            <p className="text-xs text-muted-foreground">
              Pilih cabang untuk melihat dan mengelola jadwal liburnya.
              Keterangan baru akan disimpan pada cabang terpilih.
            </p>
          </div>
          <div className="w-full sm:w-60">
            <SelectField
              value={cabangFilter}
              onChange={setCabangFilter}
              options={[
                {
                  value: "",
                  label: "Pilih Cabang",
                },
                ...branchOptions.map(
                  (cabangId) => ({
                    value: cabangId,
                    label: cabangId,
                  }),
                ),
              ]}
            />
          </div>
        </div>
      )}

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

      {/* DIALOG KONFIRMASI HAPUS KETERANGAN (custom, bukan window.confirm) */}
      <Modal
        open={pendingDelete !== null}
        onClose={() =>
          setPendingDelete(null)
        }
        title="Hapus Keterangan?"
        description="Apakah Anda yakin ingin menghapus keterangan ini?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() =>
                setPendingDelete(null)
              }
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const item =
                  pendingDelete
                setPendingDelete(null)
                if (item) {
                  performDeleteKeterangan(
                    item,
                  )
                }
              }}
            >
              Hapus
            </Button>
          </>
        }
      />
    </div>
  )
}

// ============================================================
// HEADER JUDUL + NAVIGASI BULAN
// ============================================================

function PageHeader({
  monthLabel,
  changeMonth,
  onDownload,
  pdfLoading,
  onClose,
}: {
  monthLabel: string
  changeMonth: (offset: number) => void
  onDownload?: () => void
  pdfLoading?: boolean
  onClose?: () => void
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
        {onDownload && (
          <Button
            variant="outline"
            onClick={onDownload}
            disabled={pdfLoading}
          >
            <FileDown className="mr-2 size-4" />
            {pdfLoading
              ? "Menyiapkan..."
              : "Simpan sebagai PDF"}
          </Button>
        )}
        {onClose && (
          <Button
            variant="outline"
            onClick={onClose}
          >
            Tutup
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// LEGENDA WARNA TOKO
// ============================================================

export function StoreLegend({
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

export function CalendarGrid({
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

                {/* Action group per tanggal: [ + ] (Edit/Hapus ada per item) */}
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
                            className="flex items-center gap-1"
                          >
                            <div
                              title={k.teks}
                              className="flex min-h-4 min-w-0 flex-1 items-center justify-center whitespace-normal overflow-wrap-anywhere rounded-sm border border-white/90 bg-black px-1 py-0 text-center text-[0.6rem] font-medium leading-none text-white"
                            >
                              {k.teks}
                            </div>
                            {isCentral && (
                              <div className="flex shrink-0 items-center gap-1">
                                <ActionButton
                                  small
                                  title="Ubah keterangan"
                                  onClick={() => {
                                    setEditingKey(
                                      k.id,
                                    )
                                    setEditDraft(
                                      k.teks,
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
                                    onDelete(k)
                                  }
                                >
                                  <Trash2 className="size-3" />
                                </ActionButton>
                              </div>
                            )}
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

export function KeteranganSection({
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
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <span
                className="min-w-0 flex-1 whitespace-pre-line overflow-wrap-anywhere text-left text-sm text-foreground"
                title={item.teks}
              >
                {item.teks}
              </span>
              {isCentral && !item.auto && (
                <div className="flex shrink-0 items-center gap-1">
                  <ActionButton
                    title="Ubah"
                    onClick={() =>
                      startEdit(item)
                    }
                  >
                    <PenLine className="size-4" />
                  </ActionButton>
                  <ActionButton
                    danger
                    title="Hapus"
                    onClick={() =>
                      onDelete(item)
                    }
                  >
                    <Trash2 className="size-4" />
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
