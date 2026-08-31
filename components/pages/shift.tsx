"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, FileDown, RotateCcw } from "lucide-react"
import { Segmented, DateField, Field, SelectField } from "@/components/controls"
import type { UserOptions as AutoTableUserOptions } from "jspdf-autotable"
import { formatTanggal } from "@/lib/data"
import {
  SHIFT_STATUS_ITEMS,
  getShiftStatusItem,
} from "@/lib/shift-status"
import { cn } from "@/lib/utils"

import { useAuth } from "@/components/auth-context"
import { EmptyState, LoadingState } from "@/components/controls"
import { Button } from "@/components/ui/button"
import {
  getFirestoreEmployees,
  getFirestoreMonthlySchedules,
  getFirestoreStores,
  type FirestoreEmployee,
  type FirestoreSchedule,
  type FirestoreStore,
} from "@/lib/firestore-data"
import { computeRekapRows, type RekapRow } from "@/lib/rekap-jumlah-masuk"
import { RekapJumlahMasukTable } from "@/components/rekap-jumlah-masuk"

// ============================================================
// KODE WARNA & STATUS (dipakai Central maupun Store)
//
// Warna/label bersumber dari lib/shift-status agar konsisten.
// ============================================================

const monthFormatter = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" })
const weekdayFormatter = new Intl.DateTimeFormat("id-ID", { weekday: "short" })

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// Normalisasi tanggal ke format terpakai project "YYYY-MM-DD" (string),
// agar pembandingan tanggal pada filter HARIAN selalu konsisten meski
// nilai asal mungkin berupa string ISO (ada komponen waktu) atau objek Date.
function normalizeDateKey(value: unknown): string {
  if (!value) return ""
  let source: string
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, "0")
    const d = String(value.getDate()).padStart(2, "0")
    source = `${y}-${m}-${d}`
  } else {
    source = String(value).trim()
  }
  return `${source.slice(0, 4)}-${source.slice(5, 7)}-${source.slice(8, 10)}`
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)
}

function getStoreShiftOption(status?: string | null) {
  return getShiftStatusItem(status)
}

function slugifyStoreName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "toko"
}

const monthNameFormatter = new Intl.DateTimeFormat("id-ID", { month: "long" })

function StoreJadwalShift() {
  const { profile } = useAuth()
  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [store, setStore] = React.useState<FirestoreStore | null>(null)
  const [employees, setEmployees] = React.useState<FirestoreEmployee[]>([])
  const [schedules, setSchedules] = React.useState<FirestoreSchedule[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const storeId = profile?.storeId
  const cabangId = profile?.cabangId
  const days = React.useMemo(() => getDaysInMonth(period.year, period.month), [period])

  React.useEffect(() => {
    if (!storeId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")

    Promise.all([
      getFirestoreStores("store", storeId, cabangId),
      getFirestoreEmployees(storeId),
      getFirestoreMonthlySchedules(storeId, period.year, period.month),
    ])
      .then(([stores, storeEmployees, monthlySchedules]) => {
        if (cancelled) return
        setStore(stores[0] ?? null)
        setEmployees(storeEmployees.filter((employee) => employee.aktif !== false))
        setSchedules(monthlySchedules)
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("Failed to load jadwal shift data:", loadError)
        setError("Data jadwal belum dapat dimuat. Silakan coba lagi.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cabangId, period.month, period.year, storeId])

  const scheduleByCell = React.useMemo(() => {
    return new Map(schedules.map((schedule) => [`${schedule.employeeId}:${schedule.tanggal}`, schedule.status]))
  }, [schedules])

  const rekapRows = React.useMemo<RekapRow[]>(() => {
    return computeRekapRows(
      employees,
      period.year,
      period.month,
      (employeeId, tanggal) => scheduleByCell.get(`${employeeId}:${tanggal}`),
      getDateKey,
    )
  }, [employees, period.month, period.year, scheduleByCell])

  const rekapTitle = `JUMLAH MASUK BULAN ${monthNameFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()} ${period.year}`

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const date = new Date(current.year, current.month + offset, 1)
      return { year: date.getFullYear(), month: date.getMonth() }
    })
  }

  if (loading) {
    return <LoadingState label="Memuat jadwal shift..." />
  }

  if (error) {
    return <EmptyState title="Jadwal belum dapat dimuat" description={error} />
  }

  const monthLabel = monthFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()
  const monthNameIndo = monthNameFormatter.format(new Date(period.year, period.month, 1))
  const storeDisplayName = store?.nama ?? "-"

  async function handleDownloadPdf() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ])

    const filename = `JADWAL_SHIFT_${slugifyStoreName(storeDisplayName)}_${monthNameIndo.toUpperCase()}_${period.year}.pdf`

    // Ubah HEX status (sama dengan WEB, dari lib/shift-status) ke RGB.
    function hexToRgb(hex: string): [number, number, number] {
      const value = hex.replace("#", "")
      const int = parseInt(value, 16)
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    })

    // Header PDF — tanpa "SHIFT MANAGEMENT HUB".
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("JADWAL SHIFT", 8, 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(`Toko: ${storeDisplayName}`, 8, 21)
    doc.text(`Periode: ${monthLabel}`, 8, 26)
    doc.text(`Jumlah Karyawan: ${employees.length}`, 8, 31)

    // Singkatan hari (dinamis, berdasar kalender bulan terpilih).
    const DAY_ABBR = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"]
    const dayAbbr = (day: number) => DAY_ABBR[new Date(period.year, period.month, day).getDay()] ?? ""

    // Render SEGMEN tanggal (kolom Karyawan + kolom-kolom tanggal tsb)
    // sebagai satu tabel ber-badge berwarna. Mengembalikan Y terakhir tabel.
    function drawShiftBlock(startY: number, blockDays: number[]): number {
      // Baris header 1: angka tanggal. Baris header 2: singkatan hari.
      const head = [
        ["Karyawan", ...blockDays.map(String)],
        ["", ...blockDays.map(dayAbbr)],
      ]

      // Kolom pertama berisi NAMA karyawan saja; tanggal memakai nama status lengkap.
      const body: string[][] = employees.map((employee) => {
        const row: string[] = [employee.name]
        blockDays.forEach((day) => {
          const tanggal = getDateKey(period.year, period.month, day)
          const option = getStoreShiftOption(scheduleByCell.get(`${employee.id}:${tanggal}`))
          row.push(option?.label ?? "-")
        })
        return row
      })

      // Status per sel (untuk pewarnaan badge) — indeks kolom: 0 = Karyawan, 1..n = tanggal.
      const statusesByCell: (string | undefined)[][] = employees.map((employee) => {
        const cells: (string | undefined)[] = [undefined]
        blockDays.forEach((day) => {
          const tanggal = getDateKey(period.year, period.month, day)
          const option = getStoreShiftOption(scheduleByCell.get(`${employee.id}:${tanggal}`))
          cells.push(option?.status)
        })
        return cells
      })

      const options: AutoTableUserOptions = {
        startY,
        head,
        body,
        theme: "grid",
        margin: { left: 6, right: 6, top: 30, bottom: 6 },
        styles: {
          fontSize: 7,
          cellPadding: { left: 1.4, right: 1.4, top: 1.1, bottom: 1.1 },
          valign: "middle",
          lineColor: [150, 150, 150],
          lineWidth: 0.25,
        },
        tableLineColor: [110, 110, 110],
        tableLineWidth: 0.5,
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
          valign: "middle",
          lineColor: [37, 99, 235],
          lineWidth: 0.3,
        },
        bodyStyles: { textColor: [30, 30, 30], halign: "center", valign: "middle" },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: "bold", halign: "left" },
        },
        didParseCell: (data) => {
          // Kolom tanggal: render status sebagai badge berwarna.
          if (data.section === "body" && data.column.index >= 1) {
            const shiftStatus = statusesByCell[data.row.index]?.[data.column.index]
            const item = shiftStatus ? getShiftStatusItem(shiftStatus) : undefined
            if (item) {
              data.cell.styles.fillColor = hexToRgb(item.hex)
              data.cell.styles.textColor = 255
              data.cell.styles.halign = "center"
              // Garis putih tipis agar tiap badge terpisah jelas (kolom & baris).
              data.cell.styles.lineColor = [255, 255, 255]
              data.cell.styles.lineWidth = 0.4
            } else {
              data.cell.styles.fillColor = [245, 247, 250]
              data.cell.styles.textColor = [30, 30, 30]
              data.cell.styles.halign = "center"
              data.cell.styles.lineColor = [150, 150, 150]
              data.cell.styles.lineWidth = 0.25
            }
          } else if (data.section === "body" && data.column.index === 0) {
            data.cell.styles.fillColor = [245, 247, 250]
            data.cell.styles.lineWidth = 0.25
          }
        },
      }

      autoTable(doc, options)
      return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    }

    // BAGIAN BAWAH PDF — REKAP JUMLAH MASUK BULANAN
    function drawRekapPdf(startY: number) {
      // Judul rekap (menggunakan label bulan lokal, sama seperti web).
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text(rekapTitle, 8, startY + 3)

      const heads = ["NAMA", "PAGI", "SIANG", "LIBUR", "CUTI", "SAKIT / IZIN", "TOTAL"]
      const body = rekapRows.map((row) => [
        row.name,
        String(row.pagi),
        String(row.siang),
        String(row.libur),
        String(row.cuti),
        String(row.sakitIzin),
        String(row.total),
      ])

      autoTable(doc, {
        startY: startY + 6,
        head: [heads],
        body,
        theme: "grid",
        margin: { left: 6, right: 6, top: 30, bottom: 6 },
        styles: {
          fontSize: 8,
          cellPadding: { left: 1.6, right: 1.6, top: 1.4, bottom: 1.4 },
          valign: "middle",
          lineColor: [150, 150, 150],
          lineWidth: 0.25,
        },
        tableLineColor: [110, 110, 110],
        tableLineWidth: 0.4,
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 8,
          halign: "center",
          valign: "middle",
          lineColor: [37, 99, 235],
          lineWidth: 0.3,
        },
        bodyStyles: { textColor: [30, 30, 30], halign: "center", valign: "middle" },
        columnStyles: {
          0: { cellWidth: 50, fontStyle: "bold", halign: "left" },
        },
        didParseCell: (data) => {
          // Hanya beri warna halus pada kolom angka rekap.
          if (data.section === "body" && data.column.index >= 1) {
            data.cell.styles.fillColor = [247, 248, 250]
          } else if (data.section === "body" && data.column.index === 0) {
            data.cell.styles.fillColor = [245, 247, 250]
          }
        },
      } as AutoTableUserOptions)
    }

    // Render BLOK jadwal, lalu rekap di bagian bawah PDF.
    const block1EndY = drawShiftBlock(34, days.slice(0, 15))
    const block2EndY = drawShiftBlock(block1EndY + 8, days.slice(15))

    drawRekapPdf(block2EndY + 10)

    doc.save(filename)
  }

  if (loading) {
    return <LoadingState label="Memuat jadwal shift..." />
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">JADWAL SHIFT</h1>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>
                Toko: <span className="font-medium text-foreground">{storeDisplayName}</span>
              </p>
              <p>
                Periode: <span className="font-medium text-foreground">{monthLabel}</span>
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-sm">
            Karyawan: <span className="font-semibold text-foreground">{employees.length}</span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-1 sm:w-fit">
            <Button variant="ghost" size="icon" aria-label="Bulan sebelumnya" onClick={() => changeMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <p className="min-w-44 text-center text-sm font-semibold">{monthLabel}</p>
            <Button variant="ghost" size="icon" aria-label="Bulan berikutnya" onClick={() => changeMonth(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={handleDownloadPdf}>
            <FileDown className="mr-2 size-4" />
            Simpan sebagai PDF
          </Button>
        </div>

        <div className="mt-5 rounded-lg border border-border">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead className="bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-20 min-w-[9rem] border-b border-r border-border bg-muted/60 px-1.5 py-2 text-left align-middle font-semibold sm:px-2 md:min-w-[12rem] md:py-2.5">
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
                    <td className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-border bg-card px-1.5 py-1.5 align-middle sm:px-2 md:min-w-[12rem]">
                      <p className="truncate text-[0.7rem] font-semibold text-foreground md:text-xs md:font-semibold">
                        {employee.name}
                      </p>
                    </td>
                    {days.map((day) => {
                      const tanggal = getDateKey(period.year, period.month, day)
                      const status = scheduleByCell.get(`${employee.id}:${tanggal}`)
                      const option = getStoreShiftOption(status)
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
        </div>

        {employees.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            KETERANGAN STATUS
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {SHIFT_STATUS_ITEMS.map((option) => (
              <span key={option.status} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex h-7 min-w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-1.5 text-[0.68rem] font-bold ring-1",
                    option.className,
                  )}
                >
                  {option.label}
                </span>
                <span className="text-muted-foreground">{option.title}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <RekapJumlahMasukTable title={rekapTitle} rows={rekapRows} />
    </div>
  )
}

// ============================================================
// TAMPILAN SHIFT CABANG
//
// Digunakan oleh akun STORE, CENTRAL CABANG, dan CENTRAL
// PUSAT untuk MELIHAT jadwal shift seluruh toko dalam
// cakupannya (READ-ONLY). Tidak ada aksi tulis/edit.
//
// Cakupan data:
//   STORE / CENTRAL CABANG -> hanya toko pada cabangId akun
//   CENTRAL PUSAT          -> seluruh cabang & toko
//
// Warna/label bersumber dari lib/shift-status agar konsisten.
// ============================================================

function getLocalDateISO(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {SHIFT_STATUS_ITEMS.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <span
            className={cn(
              "flex h-7 min-w-9 items-center justify-center whitespace-nowrap rounded-md px-1.5 text-[0.68rem] font-bold ring-1",
              item.className,
            )}
          >
            {item.label}
          </span>
          <span className="text-xs text-muted-foreground">
            {item.title}
          </span>
        </div>
      ))}
    </div>
  )
}

// Tabel jadwal bulanan satu toko (mengikuti visual JADWAL SHIFT).
function StoreMonthlyTable({
  store,
  index,
  employees,
  schedules,
  period,
}: {
  store: FirestoreStore
  index: number
  employees: FirestoreEmployee[]
  schedules: FirestoreSchedule[]
  period: { year: number; month: number }
}) {
  const days = getDaysInMonth(period.year, period.month)

  const scheduleByCell = React.useMemo(() => {
    return new Map(schedules.map((s) => [`${s.employeeId}:${s.tanggal}`, s.status]))
  }, [schedules])

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
              <th className="sticky left-0 z-20 min-w-[9rem] border-b border-r border-border bg-muted/60 px-1.5 py-2 text-left align-middle font-semibold sm:px-2 md:min-w-[12rem] md:py-2.5">
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
                <td className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-border bg-card px-1.5 py-1.5 align-middle sm:px-2 md:min-w-[12rem]">
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
        <p className="px-4 py-3 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
      )}
    </div>
  )
}

// Tabel jadwal harian satu toko (berdasarkan tanggal terpilih).
function StoreDailyTable({
  store,
  index,
  employees,
  schedules,
  tanggal,
}: {
  store: FirestoreStore
  index: number
  employees: FirestoreEmployee[]
  schedules: FirestoreSchedule[]
  tanggal: string
}) {
  const scheduleByEmployee = React.useMemo(() => {
    const key = normalizeDateKey(tanggal)
    return new Map(
      schedules
        .filter((s) => normalizeDateKey(s.tanggal) === key)
        .map((s) => [s.employeeId, s.status] as [string, string]),
    )
  }, [schedules, tanggal])

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
              <th className="min-w-9 border-b border-r border-border px-0.5 py-1 text-center align-middle font-semibold last:border-r-0 md:min-w-28">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const status = scheduleByEmployee.get(employee.id)
              const option = getShiftStatusItem(status)
              return (
                <tr key={employee.id}>
                  <td className="min-w-[9rem] border-b border-r border-border bg-card px-1.5 py-1.5 align-middle sm:px-2 md:min-w-[12rem]">
                    <p className="truncate text-[0.7rem] font-semibold text-foreground md:text-xs md:font-semibold">
                      {employee.name}
                    </p>
                  </td>
                  <td className="border-b border-r border-border p-0.5 text-center last:border-r-0">
                    <span
                      title={option?.title ?? "Belum dijadwalkan"}
                      className={cn(
                        "flex h-6 items-center justify-center truncate rounded px-1 text-[0.6rem] font-bold ring-1 md:mx-auto md:h-7 md:min-w-16 md:px-1.5 md:text-[0.68rem] md:whitespace-nowrap",
                        option ? option.className : "bg-background text-muted-foreground ring-border",
                      )}
                    >
                      {option?.label ?? "-"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {employees.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground">Belum ada karyawan aktif pada toko ini.</p>
      )}
    </div>
  )
}

export function ShiftCabangPage() {
  const { profile, user } = useAuth()
  const role = profile?.role?.trim().toLowerCase()

  const isCentralPusat = role === "central_pusat"

  const [mode, setMode] = React.useState<"bulanan" | "harian">("bulanan")
  const initialModeRef = React.useRef(mode)
  const [period, setPeriod] = React.useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [date, setDate] = React.useState<string>(() => getLocalDateISO())
  const [storeFilter, setStoreFilter] = React.useState("all")
  const [cabangFilter, setCabangFilter] = React.useState("all")

  const [stores, setStores] = React.useState<FirestoreStore[]>([])
  const [employeesByStoreId, setEmployeesByStoreId] = React.useState<Record<string, FirestoreEmployee[]>>({})
  const [schedulesByStore, setSchedulesByStore] = React.useState<Record<string, FirestoreSchedule[]>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    // Butuh user (untuk ID token) + profile agar mengirim token yang sah.
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

        // Data dimuat melalui server (Admin SDK) sehingga scope role
        // (STORE/CENTRAL CABANG -> cabang akun; CENTRAL PUSAT -> semua)
        // dipaksakan di sisi server, bukan bergantung pada Firestore
        // Rules klien. Hanya GET/read.
        const params = new URLSearchParams({
          year: String(period.year),
          month: String(period.month),
        })

        const response = await fetch(
          `/api/shift-cabang?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
            cache: "no-store",
          },
        )

        if (!response.ok) {
          throw new Error("Data shift cabang tidak dapat dimuat.")
        }

        const data = await response.json()

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
      } catch (loadError) {
        console.error("Gagal memuat data Shift Cabang:", loadError)
        if (!cancelled) setError("Data jadwal belum dapat dimuat. Silakan coba lagi.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [profile, user, period.year, period.month])

  const branchOptions = React.useMemo(() => {
    return Array.from(new Set(stores.map((s) => s.cabangId).filter(Boolean)))
  }, [stores])

  const visibleStores = React.useMemo(() => {
    return stores
      .filter((s) => {
        if (isCentralPusat && cabangFilter !== "all" && s.cabangId !== cabangFilter) return false
        if (storeFilter !== "all" && s.id !== storeFilter) return false
        return true
      })
      .sort((a, b) => a.nama.localeCompare(b.nama, "id", { sensitivity: "base" }))
  }, [stores, isCentralPusat, cabangFilter, storeFilter])

  function changeMonth(offset: number) {
    setPeriod((current) => {
      const d = new Date(current.year, current.month + offset, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function changeDate(next: string) {
    const normalized = normalizeDateKey(next)
    setDate(normalized)
    if (normalized) {
      setMode("harian")
      const [y, m] = normalized.split("-").map(Number)
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        setPeriod({ year: y, month: m - 1 })
      }
    }
  }

  const monthLabel = monthFormatter.format(new Date(period.year, period.month, 1)).toUpperCase()

  if (loading) {
    return <LoadingState label="Memuat jadwal shift cabang..." />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Shift Cabang</h2>
          <p className="text-sm text-muted-foreground">
            Lihat jadwal shift seluruh toko
          </p>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "bulanan", label: "Bulanan" },
            { value: "harian", label: "Harian" },
          ]}
        />
      </div>

      {/* FILTER */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            isCentralPusat ? "lg:grid-cols-3" : "lg:grid-cols-2",
          )}
        >
          {isCentralPusat && (
            <Field label="Cabang">
              <SelectField
                value={cabangFilter}
                onChange={setCabangFilter}
                options={[
                  { value: "all", label: "Semua Cabang" },
                  ...branchOptions.map((b) => ({ value: b, label: b })),
                ]}
              />
            </Field>
          )}

          <Field label="Toko">
            <SelectField
              value={storeFilter}
              onChange={setStoreFilter}
              options={[
                { value: "all", label: "Semua Toko" },
                ...stores.map((s) => ({ value: s.id, label: s.nama })),
              ]}
            />
          </Field>

          <Field label="Hari / Tanggal">
            <DateField value={date} onChange={changeDate} />
          </Field>
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStoreFilter("all")
              setCabangFilter("all")
              setDate(getLocalDateISO())
              setMode(initialModeRef.current)
            }}
          >
            <RotateCcw className="mr-1.5 size-3.5" />
            Reset Filter
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* LEGENDA */}
      <Legend />

      {visibleStores.length === 0 ? (
        <EmptyState
          title="Tidak ada toko"
          description={isCentralPusat ? "Belum ada data toko." : "Belum ada toko aktif pada cabang ini."}
        />
      ) : mode === "bulanan" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Bulan sebelumnya" onClick={() => changeMonth(-1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <p className="min-w-40 text-center text-sm font-semibold">{monthLabel}</p>
              <Button variant="ghost" size="icon" aria-label="Bulan berikutnya" onClick={() => changeMonth(1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">
              {visibleStores.length} toko ditampilkan
            </span>
          </div>

          {visibleStores.map((store, index) => (
            <StoreMonthlyTable
              key={store.id}
              store={store}
              index={index + 1}
              employees={employeesByStoreId[store.id] ?? []}
              schedules={schedulesByStore[store.id] ?? []}
              period={period}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Jadwal tanggal <span className="font-medium text-foreground">{formatTanggal(date)}</span> · {visibleStores.length} toko
          </p>
          {visibleStores.map((store, index) => (
            <StoreDailyTable
              key={store.id}
              store={store}
              index={index + 1}
              employees={employeesByStoreId[store.id] ?? []}
              schedules={schedulesByStore[store.id] ?? []}
              tanggal={date}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ShiftPage() {
  const { profile } = useAuth()
  const role = profile?.role?.trim().toLowerCase()
  const isStore = role === "store"

  if (isStore) {
    return <StoreJadwalShift />
  }

  return <ShiftCabangPage />
}
