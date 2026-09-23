// ============================================================
// PEMBUAT PDF JADWAL SHIFT — SATU SUMBER FORMAT PDF
//
// Murni PRESENTASI. Membaca data melalui resolver yang dikirim
// komponen pemanggil. TIDAK membaca/menulis Firestore dan TIDAK
// mengubah perhitungan apa pun (termasuk computeRekapRows).
//
// Dipakai oleh:
//   - components/pages/shift.tsx        → halaman JADWAL SHIFT
//   - components/pages/buat-jadwal.tsx  → halaman BUAT JADWAL SHIFT
// ============================================================

import type { jsPDF } from "jspdf"
import type { UserOptions as AutoTableUserOptions } from "jspdf-autotable"
import { getShiftStatusItem, STATUS_KHUSUS } from "@/lib/shift-status"
import type { RekapRow } from "@/lib/rekap-jumlah-masuk"

// ------------------------------------------------------------
// TIPE INPUT
// ------------------------------------------------------------

export type PdfEmployee = { id: string; name: string }
export type PdfStatusResolver = (employeeId: string, tanggal: string) => string | null | undefined
export type PdfActivityResolver = (row: 1 | 2, tanggal: string) => string

export type PdfRekapRow = Pick<
  RekapRow,
  "name" | "pagi" | "siang" | "libur" | "cuti" | "sakitIzin" | "total"
>

export type GenerateShiftSchedulePdfInput = {
  storeName: string
  monthLabel: string
  year: number
  month: number
  employees: PdfEmployee[]
  getStatus: PdfStatusResolver
  getActivity: PdfActivityResolver
  // Perilaku lama STATUS_KHUSUS dipertahankan per halaman pemanggil:
  //   false (default, shift.tsx) -> "-" dengan background netral
  //   true  (buat-jadwal.tsx)     -> "-" violet (sesuai perilaku HEAD)
  violetStatusKhusus?: boolean
  rekapTitle: string
  rekapRows: PdfRekapRow[]
  filename: string
}

// ------------------------------------------------------------
// KONSTANTA LAYOUT
// ------------------------------------------------------------

const PAGE_FORMAT = "a4"
const PAGE_WIDTH = 297
const PAGE_HEIGHT = 210
const MARGIN_X = 6
const MARGIN_TOP = 30
const MARGIN_BOTTOM = 6
const KARYAWAN_WIDTH = 50
const TABLE_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const GAP_AFTER_SHIFT = 2
const GAP_BETWEEN_BLOCKS = 10
const GAP_BEFORE_REKAP_TITLE = 12
const GAP_REKAP_TITLE_TO_TABLE = 6

// Ruang minimum yang dibutuhkan agar judul rekap + awal tabel rekap
// muat di halaman yang sama (untuk page-break rekap).
const REKAP_MIN_SPACE = GAP_REKAP_TITLE_TO_TABLE + 8

const ACTIVITY_ROW_HEIGHT = 6.5
const ACTIVITY_FONT_SIZE = 6.5

// ------------------------------------------------------------
// WARNA (RGB) — desain PDF baru
// ------------------------------------------------------------

type RGB = [number, number, number]

const COLOR_BLACK: RGB = [0, 0, 0]
const COLOR_WHITE: RGB = [255, 255, 255]

const HEADER_RED: RGB = [220, 38, 38]
const STATUS_GREEN: RGB = [34, 197, 94]
const STATUS_BLUE: RGB = [59, 130, 246]
const STATUS_RED: RGB = [239, 68, 68]
const STATUS_KHUSUS_VISUAL: RGB = [139, 92, 246]

const CELL_EMPTY_FILL: RGB = COLOR_WHITE
const CELL_EMPTY_TEXT: RGB = [110, 110, 110]
const NAME_COLUMN_FILL: RGB = COLOR_WHITE

const ACTIVITY_FILL: RGB = [254, 243, 199] // amber-100
const ACTIVITY_TEXT: RGB = [146, 64, 14] // amber-900
const ACTIVITY_EMPTY_TEXT: RGB = [150, 150, 150]
const LABEL_FILL: RGB = [248, 249, 250]

// ------------------------------------------------------------
// UTILITAS
// ------------------------------------------------------------

export function slugifyStoreName(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "toko"
}

function hexToRgb(hex: string): RGB {
  const value = hex.replace("#", "")
  const int = parseInt(value, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

const DAY_ABBR = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"]
function dayAbbr(year: number, month: number, day: number) {
  return DAY_ABBR[new Date(year, month, day).getDay()] ?? ""
}

function getDaysInMonth(year: number, month: number) {
  return Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1)
}

// Perkiraan lebar teks (mm) untuk kebutuhan wrap dari sebuah label
// kegiatan. Faktor 0,56 ≈ lebar rata-rata Helvetica BOLD (monospace ramping
// tidak dipakai; konten kegiatan digambar bold). Margin ada di textWidthMm.
function approximateTextWidth(text: string, fontSizePt: number) {
  return text.length * fontSizePt * 0.3528 * 0.56
}

function wrapTextLines(text: string, maxWidthMm: number, fontSizePt: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (approximateTextWidth(candidate, fontSizePt) <= maxWidthMm) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

// ------------------------------------------------------------
// VISUAL STATUS (label/arti TIDAK diubah; perilaku lama untuk
// STATUS_KHUSUS dan IZIN/SAKIT dipertahankan)
// ------------------------------------------------------------

type CellVisual = {
  fill: RGB
  text: RGB
  label: string
  bold: boolean
}

function statusVisual(status?: string | null, violetStatusKhusus?: boolean): CellVisual {
  if (!status) {
    return { fill: CELL_EMPTY_FILL, text: CELL_EMPTY_TEXT, label: "-", bold: false }
  }

  if (status === STATUS_KHUSUS) {
    // Perilaku lama dipertahankan per halaman pemanggil:
    //   shift.tsx     -> "-" dengan background netral (bukan violet)
    //   buat-jadwal   -> "-" violet
    if (violetStatusKhusus) {
      return { fill: STATUS_KHUSUS_VISUAL, text: COLOR_WHITE, label: "-", bold: false }
    }
    return { fill: CELL_EMPTY_FILL, text: CELL_EMPTY_TEXT, label: "-", bold: false }
  }

  const item = getShiftStatusItem(status)
  if (!item) {
    return { fill: CELL_EMPTY_FILL, text: CELL_EMPTY_TEXT, label: "-", bold: false }
  }

  switch (status) {
    case "shift_pagi":
      return { fill: STATUS_GREEN, text: COLOR_BLACK, label: item.label, bold: true }
    case "shift_siang":
      return { fill: STATUS_BLUE, text: COLOR_BLACK, label: item.label, bold: true }
    case "libur":
      return { fill: COLOR_BLACK, text: COLOR_WHITE, label: item.label, bold: true }
    case "cuti":
      return { fill: STATUS_RED, text: COLOR_BLACK, label: item.label, bold: true }
    case "izin":
    case "sakit":
      // Dipisah dari CUTI: gaya PDF lama (merah + teks putih, normal).
      return { fill: STATUS_RED, text: COLOR_WHITE, label: item.label, bold: false }
    default:
      return { fill: hexToRgb(item.hex), text: COLOR_WHITE, label: item.label, bold: true }
  }
}

// ------------------------------------------------------------
// HEADER PDF
// ------------------------------------------------------------

function drawHeader(doc: jsPDF, input: GenerateShiftSchedulePdfInput) {
  doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2])
  doc.setFont("helvetica", "bold")

  doc.setFontSize(16)
  doc.text("JADWAL SHIFT", 8, 14)

  // Setelah judul, kembalikan font ke NORMAL untuk metadata.
  doc.setFont("helvetica", "normal")

  doc.setFontSize(10)
  doc.text(`Toko: ${input.storeName}`, 8, 21)
  doc.text(`Periode: ${input.monthLabel}`, 8, 26)
  doc.text(`Jumlah Karyawan: ${input.employees.length}`, 8, 31)
}

// ------------------------------------------------------------
// BLOK JADWAL SHIFT (autoTable, kolom tanggal FULL FIXED WIDTH)
// ------------------------------------------------------------

type AutoTableImpl = (doc: jsPDF, options: AutoTableUserOptions) => void

function drawShiftBlock(
  doc: jsPDF,
  autoTable: AutoTableImpl,
  input: GenerateShiftSchedulePdfInput,
  blockDays: number[],
  startY: number,
): number {
  const dateWidth = (TABLE_WIDTH - KARYAWAN_WIDTH) / blockDays.length

  const columnStyles: NonNullable<AutoTableUserOptions["columnStyles"]> = {}
  columnStyles[0] = { cellWidth: KARYAWAN_WIDTH }
  blockDays.forEach((day, index) => {
    columnStyles[index + 1] = { cellWidth: dateWidth }
  })

  // Struktur head tetap 2 baris (tanpa rowSpan). Cell kolom pertama kedua
  // baris dikosongkan karena teks "Karyawan" digambar manual setelah
  // autoTable (agar tepat di tengah gabungan tinggi dua baris header).
  const head = [
    ["", ...blockDays.map(String)],
    ["", ...blockDays.map((day) => dayAbbr(input.year, input.month, day))],
  ]

  const body: string[][] = input.employees.map((employee) => {
    const row: string[] = [employee.name]
    blockDays.forEach((day) => {
      const tanggal = getDateKey(input.year, input.month, day)
      row.push(statusVisual(input.getStatus(employee.id, tanggal), input.violetStatusKhusus).label)
    })
    return row
  })

  autoTable(doc, {
    startY,
    head,
    body,
    theme: "grid",
    margin: { left: MARGIN_X, right: MARGIN_X, top: MARGIN_TOP, bottom: MARGIN_BOTTOM },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { left: 1, right: 1, top: 0.8, bottom: 0.8 },
      valign: "middle",
      lineColor: [150, 150, 150],
      lineWidth: 0.12,
    },
    tableLineColor: [100, 100, 100],
    tableLineWidth: 0.28,
    headStyles: {
      fillColor: HEADER_RED,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      valign: "middle",
      lineColor: HEADER_RED,
      lineWidth: 0.12,
    },
    bodyStyles: { textColor: [30, 30, 30], halign: "center", valign: "middle" },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index >= 1) {
        const employee = input.employees[data.row.index]
        const day = blockDays[data.column.index - 1]
        const tanggal = getDateKey(input.year, input.month, day)
        const visual = statusVisual(input.getStatus(employee.id, tanggal), input.violetStatusKhusus)
        data.cell.styles.fillColor = visual.fill
        data.cell.styles.textColor = visual.text
        data.cell.styles.fontStyle = visual.bold ? "bold" : "normal"
        data.cell.styles.halign = "center"
        data.cell.styles.lineColor = [180, 180, 180]
        data.cell.styles.lineWidth = 0.1
      } else if (data.section === "body" && data.column.index === 0) {
        data.cell.styles.fillColor = NAME_COLUMN_FILL
        data.cell.styles.textColor = COLOR_BLACK
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.halign = "left"
        data.cell.styles.lineColor = [180, 180, 180]
        data.cell.styles.lineWidth = 0.1
      }
    },
  })

  // Gambar manual teks "Karyawan" setelah autoTable selesai, agar berada
  // tepat di tengah gabungan tinggi dua baris header (baris 1 = nomor
  // tanggal, baris 2 = nama hari). Berlaku sama untuk kedua blok karena
  // drawShiftBlock dipakai oleh keduanya.
  const last = doc as unknown as {
    lastAutoTable: { finalY: number; head: { height: number }[] }
  }
  const headRows = last.lastAutoTable.head
  const centerY = startY + (headRows[0].height + headRows[1].height) / 2

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text("Karyawan", MARGIN_X + KARYAWAN_WIDTH / 2, centerY, {
    align: "center",
    baseline: "middle",
  })

  return last.lastAutoTable.finalY
}

// ------------------------------------------------------------
// BLOK JADWAL KEGIATAN (2 baris, grid mengikuti blok shift)
//
// Digambar manual agar:
//   - label "Jadwal Kegiatan" membentang 2 baris di kolom kiri
//   - tinggi tiap baris menyesuaikan jumlah baris teks (wrap, tanpa ellipsis)
//   - grid vertikal sejajar persis dengan kolom tanggal blok shift
// ------------------------------------------------------------

function drawActivityBlock(
  doc: jsPDF,
  input: GenerateShiftSchedulePdfInput,
  blockDays: number[],
  startY: number,
): number {
  const dateWidth = (TABLE_WIDTH - KARYAWAN_WIDTH) / blockDays.length
  const left = MARGIN_X
  const right = left + KARYAWAN_WIDTH + blockDays.length * dateWidth
  const fontSize = ACTIVITY_FONT_SIZE
  const fontSizeMm = fontSize * 0.3528
  // Tinggi satu baris teks (pt -> mm) dengan leading aman.
  const lineHeight = fontSizeMm * 1.25
  // Jarak baseline dari puncak baris teks (ascent Helvetica ±0,905 em),
  // dipakai agar SELURUH glyph berada di dalam baris (tidak keluar/touching).
  const ascentMm = fontSizeMm * 0.905
  // Padding vertikal aman untuk baris multi-baris, agar glyph baris
  // terakhir tidak menempel/menembus garis cell.
  const PAD_Y = 1.5
  const textWidthMm = dateWidth - 1.8

  const rawRows: string[][] = [1, 2].map((row) =>
    blockDays.map((day) => {
      const tanggal = getDateKey(input.year, input.month, day)
      return (input.getActivity(row as 1 | 2, tanggal) ?? "").trim()
    }),
  )

  // Bungkus teks per cell sesuai lebar kolom (perilaku WEB: teks panjang
  // turun ke baris berikutnya — TANPA ellipsis/pemotongan karakter).
  const lineSets: string[][][] = rawRows.map((row) =>
    row.map((teks) => {
      if (!teks) return ["-"]
      const lines = wrapTextLines(teks, textWidthMm, fontSize)
      return lines.length > 0 ? lines : ["-"]
    }),
  )

  // Tinggi baris: 1 baris -> tinggi normal (seperti sebelumnya);
  // multi-baris -> jumlah baris x lineHeight + padding atas/bawah aman.
  const rowHeights = lineSets.map((row) => {
    const maxLines = Math.max(...row.map((lines) => lines.length))
    if (maxLines <= 1) return ACTIVITY_ROW_HEIGHT
    return maxLines * lineHeight + PAD_Y * 2
  })
  const totalHeight = rowHeights[0] + rowHeights[1]

  // Aman dari page-break: jika ruang sisa tidak cukup, pindah halaman.
  if (startY + totalHeight > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage()
    startY = MARGIN_TOP
  }

  // 1) latar + teks setiap sel kegiatan
  let rowStart = startY
  for (let r = 0; r < 2; r++) {
    const rowHeight = rowHeights[r]
    for (let c = 0; c < blockDays.length; c++) {
      const x = left + KARYAWAN_WIDTH + c * dateWidth
      const y = rowStart
      const teks = rawRows[r][c]
      const hasContent = teks.length > 0
      const lines = lineSets[r][c]

      const fill = hasContent ? ACTIVITY_FILL : COLOR_WHITE
      doc.setFillColor(fill[0], fill[1], fill[2])
      doc.rect(x, y, dateWidth, rowHeight, "F")

      doc.setFont("helvetica", hasContent ? "bold" : "normal")
      doc.setFontSize(fontSize)
      const color = hasContent ? ACTIVITY_TEXT : ACTIVITY_EMPTY_TEXT
      doc.setTextColor(color[0], color[1], color[2])

      const blockTop = y + (rowHeight - lines.length * lineHeight) / 2
      lines.forEach((line, lineIndex) => {
        const baseline = blockTop + lineIndex * lineHeight + ascentMm
        doc.text(line, x + dateWidth / 2, baseline, { align: "center" })
      })
    }
    rowStart += rowHeight
  }

  // 2) label "Jadwal Kegiatan" membentang kedua baris (tinggi menyesuaikan)
  doc.setFillColor(LABEL_FILL[0], LABEL_FILL[1], LABEL_FILL[2])
  doc.rect(left, startY, KARYAWAN_WIDTH, totalHeight, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(fontSize + 0.5)
  doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2])
  doc.text("Jadwal Kegiatan", left + 2, startY + totalHeight / 2, { baseline: "middle" })

  // 3) grid presisi (garis tipis, sejajar dari header sampai kegiatan)
  doc.setDrawColor(130, 130, 130)
  doc.setLineWidth(0.18)
  doc.line(left, startY, right, startY)
  // Baris tengah hanya melintasi area kolom tanggal (jangan menembus
  // label "Jadwal Kegiatan" yang membentang 2 baris di kolom kiri).
  doc.line(left + KARYAWAN_WIDTH, startY + rowHeights[0], right, startY + rowHeights[0])
  doc.line(left, startY + totalHeight, right, startY + totalHeight)
  const verticalXs: number[] = [left]
  for (let c = 0; c <= blockDays.length; c++) {
    verticalXs.push(left + KARYAWAN_WIDTH + c * dateWidth)
  }
  for (const x of verticalXs) {
    doc.line(x, startY, x, startY + totalHeight)
  }

  return startY + totalHeight
}

// ------------------------------------------------------------
// REKAP JUMLAH MASUK (compact, pojok kiri bawah)
// ------------------------------------------------------------

function drawRekap(
  doc: jsPDF,
  autoTable: AutoTableImpl,
  input: GenerateShiftSchedulePdfInput,
  startY: number,
) {
  // Page-break rekap: jika ruang tersisa tidak cukup untuk judul +
  // awal tabel, pindahkan keduanya bersama-sama ke halaman baru,
  // agar judul tidak sendirian di dasar halaman.
  if (startY + REKAP_MIN_SPACE > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage()
    startY = MARGIN_TOP
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2])
  doc.text(input.rekapTitle, MARGIN_X, startY)

  const namaWidth = 40
  const nilaiWidth = 14

  const columnStyles: NonNullable<AutoTableUserOptions["columnStyles"]> = {}
  columnStyles[0] = { cellWidth: namaWidth }
  for (let i = 1; i <= 6; i++) {
    columnStyles[i] = { cellWidth: nilaiWidth }
  }

  const heads = ["NAMA", "PAGI", "SIANG", "LIBUR", "CUTI", "SAKIT / IZIN", "TOTAL"]
  const body = input.rekapRows.map((row) => [
    row.name,
    String(row.pagi),
    String(row.siang),
    String(row.libur),
    String(row.cuti),
    String(row.sakitIzin),
    String(row.total),
  ])

  autoTable(doc, {
    startY: startY + GAP_REKAP_TITLE_TO_TABLE,
    head: [heads],
    body,
    theme: "grid",
    // Border luar tabel memakai LEBAR NUMERIK EKSPLISIT = total lebar kolom
    // (40 + 6*14 = 124mm). Bukan "wrap": wrappedWidth membesar karena teks
    // head seperti "SAKIT / IZIN" lebih lebar dari cellWidth-nya sehingga
    // border ikut melebar ke kanan.
    tableWidth: namaWidth + nilaiWidth * 6,
    margin: { left: MARGIN_X, right: MARGIN_X, top: MARGIN_TOP, bottom: MARGIN_BOTTOM },
    styles: {
      font: "helvetica",
      fontSize: 7,
      cellPadding: { left: 1.2, right: 1.2, top: 0.8, bottom: 0.8 },
      valign: "middle",
      lineColor: [160, 160, 160],
      lineWidth: 0.1,
    },
    tableLineColor: [110, 110, 110],
    tableLineWidth: 0.2,
    headStyles: {
      fillColor: HEADER_RED,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      valign: "middle",
      lineColor: HEADER_RED,
      lineWidth: 0.1,
    },
    bodyStyles: { textColor: [30, 30, 30], halign: "center", valign: "middle" },
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "body") {
        data.cell.styles.lineWidth = 0.1
        data.cell.styles.lineColor = [180, 180, 180]
        if (data.column.index === 0) {
          data.cell.styles.fillColor = COLOR_WHITE
          data.cell.styles.textColor = COLOR_BLACK
          data.cell.styles.fontStyle = "bold"
          data.cell.styles.halign = "left"
        } else {
          data.cell.styles.fillColor = COLOR_WHITE
          data.cell.styles.textColor = COLOR_BLACK
          data.cell.styles.fontStyle = "bold"
        }
      }
    },
  })
}

// ------------------------------------------------------------
// GENERATOR UTAMA
// ------------------------------------------------------------

export async function generateShiftSchedulePdf(
  input: GenerateShiftSchedulePdfInput,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])

  const autoTableImpl: AutoTableImpl = autoTable

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: PAGE_FORMAT })

  drawHeader(doc, input)

  const days = getDaysInMonth(input.year, input.month)
  const blocks = [days.slice(0, 15), days.slice(15)]

  let y = 34
  blocks.forEach((block, index) => {
    if (index > 0) y += GAP_BETWEEN_BLOCKS
    const endShift = drawShiftBlock(doc, autoTableImpl, input, block, y)
    y = drawActivityBlock(doc, input, block, endShift + GAP_AFTER_SHIFT)
  })

  drawRekap(doc, autoTableImpl, input, y + GAP_BEFORE_REKAP_TITLE)

  doc.save(input.filename)
}