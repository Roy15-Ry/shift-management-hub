// ============================================================
// PEMBUAT PDF JADWAL LIBUR — 2 HALAMAN, F4 PORTRAIT (215×330mm)
//
// Murni PRESENTASI. Membaca data melalui input yang dikirim
// komponen pemanggil (components/pages/jadwal-libur.tsx).
// TIDAK membaca/menulis Firestore, TIDAK fetch API, TIDAK
// mengakses auth, TIDAK mengubah state halaman.
//
// Halaman 1 : judul + kalender 7 kolom + keterangan toko
// Halaman 2 : pernyataan perusahaan + KEGIATAN PERUSAHAAN
//             + OPERASIONAL (teks langsung, tanpa tabel)
//
// Memakai library yang sudah terpasang (jspdf) dengan pola
// dynamic import seperti lib/pdf-shift.ts.
// ============================================================

import type { jsPDF } from "jspdf"

// ------------------------------------------------------------
// TIPE INPUT
// ------------------------------------------------------------

export type PdfJadwalLiburStore = {
  id: string
  nama: string
}

export type PdfJadwalLiburEmployee = {
  id: string
  name: string
  storeId: string
}

export type PdfJadwalLiburSchedule = {
  storeId: string
  employeeId: string
  tanggal: string
  status: string
  cutiJenis?: string
}

export type PdfJadwalLiburTextItem = {
  id: string
  teks: string
}

export type GenerateJadwalLiburPdfInput = {
  // Label tampilan cakupan (mis. "CABANG BOGOR - BANTEN"
  // atau "SEMUA CABANG"). BUKAN cabangId teknis.
  scopeLabel: string
  year: number
  month: number
  // Bulan kapital penuh, mis. "SEPTEMBER 2026".
  monthLabel: string
  stores: PdfJadwalLiburStore[]
  employeesByStoreId: Record<string, PdfJadwalLiburEmployee[]>
  schedulesByStore: Record<string, PdfJadwalLiburSchedule[]>
  // Keterangan jenis "kegiatan" (teks apa adanya).
  kegiatan: PdfJadwalLiburTextItem[]
  // Hasil buildOperasionalItems(data) — manual + otomatis cuti.
  operasional: PdfJadwalLiburTextItem[]
  filename: string
}

// ------------------------------------------------------------
// KONSTANTA LAYOUT
// ------------------------------------------------------------

const PAGE_FORMAT: [number, number] = [215, 330]
const PAGE_WIDTH = 215
const PAGE_HEIGHT = 330
const MARGIN_X = 10
const MARGIN_TOP = 12
const MARGIN_BOTTOM = 14

// Halaman 1: margin atas header sekitar 1 cm.
const PAGE1_HEADER_TOP = 10

const CAL_LEFT = MARGIN_X
const CAL_WIDTH = PAGE_WIDTH - MARGIN_X * 2
const CAL_TOP = 37
const WEEKDAY_H = 7
const CELL_W = CAL_WIDTH / 7

// Kalender — semua data selalu ditampilkan, tanpa truncation.
// Nilai dasar; generator bisa mengecilkan secara proporsional
// (mis. font/padding) agar kalender + legend selalu muat di
// halaman 1 tanpa menghilangkan data.
const BASE_CONTENT_TOP = 5.5
const BASE_PILL_LINE_H = 3.4
const BASE_PILL_VPAD = 0.2
const BASE_PILL_GAP = 0.6
const BASE_MIN_ROW_H = 9
const BASE_NAME_FONT_SIZE = 6.5

let CONTENT_TOP = BASE_CONTENT_TOP
let PILL_LINE_H = BASE_PILL_LINE_H
let PILL_VPAD = BASE_PILL_VPAD
let PILL_GAP = BASE_PILL_GAP
let MIN_ROW_H = BASE_MIN_ROW_H
let NAME_FONT_SIZE = BASE_NAME_FONT_SIZE

// Batas bawah pengecilan (jangan ekstrem / tidak terbaca).
const MIN_CONTENT_TOP = 3.4
const MIN_PILL_LINE_H = 2.6
const MIN_PILL_GAP = 0.3
const MIN_MIN_ROW_H = 4.5
const MIN_NAME_FONT_SIZE = 5

const LEGEND_GAP = 6

const DAY_HEADERS = [
  "MINGGU",
  "SENIN",
  "SELASA",
  "RABU",
  "KAMIS",
  "JUMAT",
  "SABTU",
]

// ------------------------------------------------------------
// WARNA (RGB)
// ------------------------------------------------------------

type RGB = [number, number, number]

const COLOR_WHITE: RGB = [255, 255, 255]
const COLOR_BLACK: RGB = [0, 0, 0]

const RED: RGB = [220, 38, 38]
const NAVY: RGB = [30, 41, 59]
const GRAY_TEXT: RGB = [100, 116, 139]
const GRAY_BORDER: RGB = [203, 213, 225]

// Warna store untuk PDF — sejajar urutan STORE_COLORS pada
// components/pages/jadwal-libur.tsx (indeks toko -> warna).
// Murni visual PDF; tidak mengubah styling website.
const STORE_HEX_RGB: RGB[] = [
  [37, 99, 235], // bg-blue-600
  [220, 38, 38], // bg-red-600
  [5, 150, 105], // bg-emerald-600
  [147, 51, 234], // bg-purple-600
  [249, 115, 22], // bg-orange-500
  [13, 148, 136], // bg-teal-600
  [245, 158, 11], // bg-amber-500
  [219, 39, 119], // bg-pink-600
  [79, 70, 229], // bg-indigo-600
  [8, 145, 178], // bg-cyan-600
  [101, 163, 13], // bg-lime-600
  [192, 38, 211], // bg-fuchsia-600
  [2, 132, 199], // bg-sky-600
  [124, 58, 237], // bg-violet-600
  [202, 138, 4], // bg-yellow-600
  [225, 29, 72], // bg-rose-600
]

// ------------------------------------------------------------
// UTILITAS TEKS
// ------------------------------------------------------------

function getDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function computeWeeks(year: number, month: number): number[][] {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = getDaysInMonth(year, month)
  const weeks: number[][] = []
  let current: number[] = []
  for (let i = 0; i < firstWeekday; i++) current.push(0)
  for (let day = 1; day <= daysInMonth; day++) {
    if (current.length === 7) {
      weeks.push(current)
      current = []
    }
    current.push(day)
  }
  if (current.length > 0) {
    while (current.length < 7) current.push(0)
    weeks.push(current)
  }
  return weeks
}

// Perkiraan lebar teks (mm) untuk wrapping dalam cell.
function approximateTextWidth(text: string, fontSizePt: number) {
  return text.length * fontSizePt * 0.3528 * 0.55
}

// Pecah baris teks sesuai lebar maksimum (mm). TIDAK pernah
// memotong/menyingkat isi — memecah kata sebelum terlalu panjang,
// dan fallback paksa per-karakter hanya untuk kata tanpa spasi
// yang melebihi lebar pill.
function splitTextLines(text: string, maxWidthMm: number, fontSizePt: number): string[] {
  if (approximateTextWidth(text, fontSizePt) <= maxWidthMm) return [text]
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (approximateTextWidth(word, fontSizePt) <= maxWidthMm) {
      const candidate = current ? `${current} ${word}` : word
      if (approximateTextWidth(candidate, fontSizePt) <= maxWidthMm) {
        current = candidate
      } else {
        if (current) lines.push(current)
        current = word
      }
    } else {
      if (current) lines.push(current)
      current = ""
      let chunk = ""
      for (const char of word) {
        if (approximateTextWidth(chunk + char, fontSizePt) > maxWidthMm) {
          if (chunk) lines.push(chunk)
          chunk = char
        } else {
          chunk += char
        }
      }
      if (chunk) current = chunk
    }
  }
  if (current) lines.push(current)
  return lines
}

// ------------------------------------------------------------
// HEADER HALAMAN 1
// ------------------------------------------------------------

function drawTitleBlock(doc: jsPDF, input: GenerateJadwalLiburPdfInput) {
  // Tiga baris header dengan jarak vertikal konsisten (7mm),
  // mulai sekitar 10mm dari tepi atas halaman 1.
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(RED[0], RED[1], RED[2])
  doc.text("JADWAL LIBUR TIM TANIA PERFUME BULAN", PAGE_WIDTH / 2, PAGE1_HEADER_TOP + 8, {
    align: "center",
  })

  doc.setFontSize(18)
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
  doc.text(input.monthLabel, PAGE_WIDTH / 2, PAGE1_HEADER_TOP + 15, { align: "center" })

  doc.setFontSize(11)
  doc.text(input.scopeLabel, PAGE_WIDTH / 2, PAGE1_HEADER_TOP + 22, { align: "center" })
}

// ------------------------------------------------------------
// DATA KALENDER
// ------------------------------------------------------------

type DayPill = {
  text: string
  storeColor: RGB
}

function buildDayEntries(
  input: GenerateJadwalLiburPdfInput,
): Map<string, DayPill[]> {
  const employeeName = new Map<string, string>()
  for (const employees of Object.values(input.employeesByStoreId ?? {})) {
    for (const employee of employees) {
      if (!employeeName.has(employee.id)) {
        employeeName.set(employee.id, employee.name)
      }
    }
  }

  const entries = new Map<string, DayPill[]>()

  input.stores.forEach((store, index) => {
    const storeColor = STORE_HEX_RGB[index % STORE_HEX_RGB.length]
    const schedules = input.schedulesByStore[store.id] ?? []
    for (const schedule of schedules) {
      const status = (schedule.status ?? "").trim().toLowerCase()
      if (status !== "libur" && status !== "cuti") continue

      const nama = employeeName.get(schedule.employeeId) ?? "-"
      // CUTI ditandai ©; LIBUR hanya nama. Teks status/jenis
      // cuti TIDAK ditampilkan di kalender halaman 1.
      const text = status === "cuti" ? `${nama} ©` : nama

      const tanggal = schedule.tanggal ?? ""
      const list = entries.get(tanggal) ?? []
      list.push({ text, storeColor })
      entries.set(tanggal, list)
    }
  })

  return entries
}

// ------------------------------------------------------------
// KALENDER HALAMAN 1
// ------------------------------------------------------------

function pillHeight(lines: string[]): number {
  return lines.length * PILL_LINE_H + PILL_VPAD
}

function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  lines: string[],
  color: RGB,
): number {
  const height = pillHeight(lines)
  doc.setFillColor(color[0], color[1], color[2])
  doc.roundedRect(x, y, width, height, 0.8, 0.8, "F")

  // Font nama: HITAM, BOLD, CENTER per baris. Warna store hanya
  // untuk background pill — teks tidak pernah memakai warna store.
  doc.setFont("helvetica", "bold")
  doc.setFontSize(NAME_FONT_SIZE)
  doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2])

  // SELURUH BLOK TEKS di-center secara vertikal di dalam pill
  // (bukan per baris). Hitung dulu tinggi visual blok (ascent
  // baris pertama + descent baris terakhir + jarak antarbaris),
  // lalu letakkan startY sehingga margin atas/bawah seimbang.
  const ascentMm = NAME_FONT_SIZE * 0.3528 * 0.718
  const descentMm = NAME_FONT_SIZE * 0.3528 * 0.207
  const blockHeight =
    (lines.length - 1) * PILL_LINE_H + ascentMm + descentMm
  const blockTop = y + (height - blockHeight) / 2
  const firstBaseline = blockTop + ascentMm

  lines.forEach((line, index) => {
    doc.text(
      line,
      x + width / 2,
      firstBaseline + index * PILL_LINE_H,
      { align: "center" },
    )
  })

  return height
}

// Tinggi tiap baris mengikuti hari tersibuk pada minggu itu
// sehingga SEMUA nama selalu muat (tidak pernah terpotong).
function computeRowHeights(
  input: GenerateJadwalLiburPdfInput,
  entries: Map<string, DayPill[]>,
  maxTextWidth: number,
): number[] {
  const weeks = computeWeeks(input.year, input.month)
  return weeks.map((week) => {
    let maxContent = MIN_ROW_H
    week.forEach((day) => {
      if (day === 0) return
      const pills = entries.get(getDateKey(input.year, input.month, day)) ?? []
      if (pills.length === 0) return
      let content = CONTENT_TOP
      for (const pill of pills) {
        const lines = splitTextLines(pill.text, maxTextWidth, NAME_FONT_SIZE)
        content += pillHeight(lines) + PILL_GAP
      }
      content -= PILL_GAP
      if (content > maxContent) maxContent = content
    })
    return Math.round(maxContent * 2) / 2
  })
}

function drawCalendar(
  doc: jsPDF,
  input: GenerateJadwalLiburPdfInput,
  startY: number,
  entries: Map<string, DayPill[]>,
): number {
  const weeks = computeWeeks(input.year, input.month)
  const maxTextWidth = CELL_W - 4
  const rowHeights = computeRowHeights(input, entries, maxTextWidth)

  const rowsTop = startY + WEEKDAY_H
  const tableBottom = rowsTop + rowHeights.reduce((a, b) => a + b, 0)

  // Baris nama hari.
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2])
  doc.rect(CAL_LEFT, startY, CAL_WIDTH, WEEKDAY_H, "F")
  DAY_HEADERS.forEach((day, index) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.5)
    doc.setTextColor(COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2])
    doc.text(day, CAL_LEFT + CELL_W * index + CELL_W / 2, startY + WEEKDAY_H / 2, {
      align: "center",
      baseline: "middle",
    })
  })

  // Bingkai luar kalender + grid (struktur kalender, bukan dekorasi).
  doc.setDrawColor(GRAY_BORDER[0], GRAY_BORDER[1], GRAY_BORDER[2])
  doc.setLineWidth(0.2)
  doc.rect(CAL_LEFT, startY, CAL_WIDTH, WEEKDAY_H + rowHeights.reduce((a, b) => a + b, 0))
  for (let col = 1; col < 7; col++) {
    const x = CAL_LEFT + CELL_W * col
    doc.line(x, rowsTop, x, tableBottom)
  }
  let rowStart = rowsTop
  rowHeights.forEach((rowH) => {
    const y = rowStart + rowH
    doc.line(CAL_LEFT, y, CAL_LEFT + CAL_WIDTH, y)
    rowStart = y
  })

  let y = rowsTop
  weeks.forEach((week, rowIdx) => {
    week.forEach((day, colIdx) => {
      if (day === 0) return
      const cellX = CAL_LEFT + CELL_W * colIdx
      const cellY = y
      const pills = entries.get(getDateKey(input.year, input.month, day)) ?? []

      // Nomor tanggal.
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7)
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
      doc.text(String(day), cellX + 1.5, cellY + 3)

      // Pill karyawan — SEMUA nama ditampilkan, tanpa batas.
      let py = cellY + CONTENT_TOP
      for (const pill of pills) {
        const lines = splitTextLines(pill.text, maxTextWidth, NAME_FONT_SIZE)
        py += drawPill(doc, cellX + 1, py, CELL_W - 2, lines, pill.storeColor)
        py += PILL_GAP
      }
    })
    y += rowHeights[rowIdx]
  })

  return tableBottom
}

// ------------------------------------------------------------
// KETERANGAN TOKO (LEGENDA)
// ------------------------------------------------------------

function drawLegend(doc: jsPDF, stores: PdfJadwalLiburStore[], startY: number): number {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
  doc.text("KETERANGAN TOKO", CAL_LEFT, startY)

  let y = startY + 4
  let x = CAL_LEFT
  const rowH = 4.5

  stores.forEach((store, index) => {
    const color = STORE_HEX_RGB[index % STORE_HEX_RGB.length]
    const itemWidth = 4 + 1.5 + approximateTextWidth(store.nama, 7) + 6
    if (x + itemWidth > CAL_LEFT + CAL_WIDTH) {
      y += rowH
      x = CAL_LEFT
    }
    doc.setFillColor(color[0], color[1], color[2])
    doc.circle(x + 1.5, y - 1.2, 1.3, "F")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2])
    doc.text(store.nama, x + 5, y)
    x += itemWidth
  })

  return y + rowH
}

// Estimasi tinggi (mm) yang dipakai drawLegend untuk daftar store,
// dipakai generator agar kalender + legend selalu muat di halaman 1.
function estimateLegendHeight(stores: PdfJadwalLiburStore[]): number {
  if (stores.length === 0) return 8.5
  let x = 0
  let rows = 1
  stores.forEach((store) => {
    const itemWidth = 4 + 1.5 + approximateTextWidth(store.nama, 7) + 6
    if (x + itemWidth > CAL_WIDTH) {
      x = 0
      rows++
    }
    x += itemWidth
  })
  return 4 + rows * 4.5
}

// ------------------------------------------------------------
// SECTION HALAMAN 2 (header merah rounded + teks langsung)
// ------------------------------------------------------------

function drawSection(
  doc: jsPDF,
  title: string,
  items: PdfJadwalLiburTextItem[],
  startY: number,
  emptyText: string,
): number {
  if (startY + 12 > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage()
    startY = MARGIN_TOP + 2
  }

  const headerH = 8
  doc.setFillColor(RED[0], RED[1], RED[2])
  doc.roundedRect(CAL_LEFT, startY, CAL_WIDTH, headerH, 1.6, 1.6, "F")
  doc.setTextColor(COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2])
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(title, PAGE_WIDTH / 2, startY + headerH / 2, {
    align: "center",
    baseline: "middle",
  })

  let y = startY + headerH + 4

  if (items.length === 0) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7.5)
    doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2])
    doc.text(emptyText, CAL_LEFT + 2, y)
    return y + 5
  }

  // Data langsung berupa teks — tanpa NO, ISIAN, cell, border,
  // garis horizontal, maupun tabel.
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(COLOR_BLACK[0], COLOR_BLACK[1], COLOR_BLACK[2])

  for (const item of items) {
    const lines = splitTextLines(item.teks, CAL_WIDTH - 4, 9)
    for (const line of lines) {
      if (y > PAGE_HEIGHT - MARGIN_BOTTOM) {
        doc.addPage()
        y = MARGIN_TOP + 2
      }
      doc.text(line, CAL_LEFT + 2, y)
      y += 6
    }
  }

  return y
}

// ------------------------------------------------------------
// GENERATOR UTAMA
// ------------------------------------------------------------

// Kembalikan ukuran layout kalender ke nilai dasar sebelum
// dipakai generator (aman jika generator dipanggil berkali-kali).
function resetLayout() {
  CONTENT_TOP = BASE_CONTENT_TOP
  PILL_LINE_H = BASE_PILL_LINE_H
  PILL_VPAD = BASE_PILL_VPAD
  PILL_GAP = BASE_PILL_GAP
  MIN_ROW_H = BASE_MIN_ROW_H
  NAME_FONT_SIZE = BASE_NAME_FONT_SIZE
}

export async function generateJadwalLiburPdf(
  input: GenerateJadwalLiburPdfInput,
): Promise<void> {
  resetLayout()

  const { jsPDF } = await import("jspdf")

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: PAGE_FORMAT })

  // ====================================================
  // HALAMAN 1 — JUDUL + KALENDER + KETERANGAN TOKO
  // ====================================================

  drawTitleBlock(doc, input)

  // Fit kalender + legend ke area halaman 1. Jika data padat,
  // layout dikompaksi secara proporsional (font/padding/gap)
  // sampai semua data + "KETERANGAN TOKO" Muat. Data tidak
  // pernah dibuang/dipotong.
  const entries = buildDayEntries(input)
  const maxTextWidth = CELL_W - 4
  const page1Budget =
    PAGE_HEIGHT - MARGIN_BOTTOM - CAL_TOP

  for (let iter = 0; iter < 4; iter++) {
    const calHeight =
      WEEKDAY_H +
      computeRowHeights(input, entries, maxTextWidth).reduce((a, b) => a + b, 0)
    const legendHeight = estimateLegendHeight(input.stores)
    const total = calHeight + LEGEND_GAP + legendHeight

    if (total <= page1Budget) break

    if (iter === 3) {
      CONTENT_TOP = MIN_CONTENT_TOP
      PILL_LINE_H = MIN_PILL_LINE_H
      PILL_GAP = MIN_PILL_GAP
      MIN_ROW_H = MIN_MIN_ROW_H
      NAME_FONT_SIZE = MIN_NAME_FONT_SIZE
      break
    }

    const factor = page1Budget / total
    CONTENT_TOP = Math.max(MIN_CONTENT_TOP, CONTENT_TOP * factor)
    PILL_LINE_H = Math.max(MIN_PILL_LINE_H, PILL_LINE_H * factor)
    PILL_GAP = Math.max(MIN_PILL_GAP, PILL_GAP * factor)
    MIN_ROW_H = Math.max(MIN_MIN_ROW_H, MIN_ROW_H * factor)
    NAME_FONT_SIZE = Math.max(MIN_NAME_FONT_SIZE, NAME_FONT_SIZE * factor)
  }

  const calBottom = drawCalendar(doc, input, CAL_TOP, entries)
  drawLegend(doc, input.stores, calBottom + LEGEND_GAP)

  // ====================================================
  // HALAMAN 2 — PERNYATAAN + KEGIATAN + OPERASIONAL
  // ====================================================

  doc.addPage()

  let y = MARGIN_TOP + 6
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
  doc.text("JADWAL LIBUR SUDAH DITETAPKAN OLEH PERUSAHAAN", PAGE_WIDTH / 2, y, {
    align: "center",
  })
  y += 7
  doc.text("DENGAN ADIL DAN MEMENUHI HAK SEMUA TIM", PAGE_WIDTH / 2, y, {
    align: "center",
  })
  y += 6

  y = drawSection(doc, "KEGIATAN PERUSAHAAN", input.kegiatan, y, "Tidak ada kegiatan perusahaan.")
  y += 12

  drawSection(doc, `OPERASIONAL ${input.monthLabel}`, input.operasional, y, "Belum ada operasional.")

  doc.save(input.filename)
}