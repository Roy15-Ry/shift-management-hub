import * as XLSX from "xlsx"

export type ExportTargetPenjualanRow = {
  Tanggal: string
  Toko: string
  Tim: string
  Jenis: string
  Keterangan: string
  Detail: string
  Nilai: number | string
}

export type ExportTargetPenjualanOptions = {
  rows: ExportTargetPenjualanRow[]
  periodeLabel: string
  storeName: string
  filename?: string
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function exportTargetPenjualanHistory(options: ExportTargetPenjualanOptions) {
  const { rows, periodeLabel, storeName } = options
  const wb = XLSX.utils.book_new()
  const wsData: any[] = []

  wsData.push(["HISTORY TARGET PENJUALAN"])
  wsData.push([`TOKO: ${storeName || "-"}`])
  wsData.push([`PERIODE: ${periodeLabel}`])
  wsData.push([])
  wsData.push(["Tanggal", "Toko", "Tim", "Jenis", "Keterangan", "Detail", "Nilai"])

  for (const r of rows) {
    const jenis = r.Jenis || "-"
    const nilai = typeof r.Nilai === "number" ? r.Nilai : Number(r.Nilai) || 0

    wsData.push([
      r.Tanggal,
      r.Toko || "-",
      r.Tim || "-",
      jenis,
      r.Keterangan || "-",
      r.Detail || "-",
      nilai,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 20 },
    { wch: 24 },
    { wch: 36 },
    { wch: 18 },
    { wch: 16 },
  ]

  try {
    const headerRowIndex = 4
    const colCount = 7
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c })
      if (ws[cellRef]) {
        ws[cellRef].s = ws[cellRef].s || {}
        ws[cellRef].s.font = ws[cellRef].s.font || { bold: true }
        ws[cellRef].s.font.bold = true
        ws[cellRef].s.fill = ws[cellRef].s.fill || {
          patternType: "solid",
          fgColor: { rgb: "F3F4F6" },
        }
      }
    }
  } catch (_) {
    // ignore
  }

  try {
    const dataStartRow = 5
    const lastRow = wsData.length - 1
    for (let r = dataStartRow; r <= lastRow; r++) {
      const jenisCell = ws[XLSX.utils.encode_cell({ r, c: 3 })]
      const jenisValue = jenisCell?.v || wsData[r][3] || ""
      const jenisStr = String(jenisValue)
      const nilaiCellRef = XLSX.utils.encode_cell({ r, c: 6 })
      if (ws[nilaiCellRef]) {
        const v = ws[nilaiCellRef].v
        if (typeof v === "number" && !isNaN(v)) {
          ws[nilaiCellRef].t = "n"
          if (jenisStr.includes("Additional Selling")) {
            ws[nilaiCellRef].z = "Rp #,##0"
          } else {
            ws[nilaiCellRef].z = "#,##0"
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }

  try {
    const dataStartRow = 5
    const lastRow = wsData.length - 1
    for (let r = dataStartRow; r <= lastRow; r++) {
      const ketRef = XLSX.utils.encode_cell({ r, c: 4 })
      if (ws[ketRef]) {
        ws[ketRef].s = ws[ketRef].s || {}
        ws[ketRef].s.alignment = ws[ketRef].s.alignment || { wrapText: true }
        ws[ketRef].s.alignment.wrapText = true
      }
    }
  } catch (_) {
    // ignore
  }

  try {
    const lastRow = wsData.length
    ws["!autofilter"] = { ref: `A5:G${lastRow}` }
    ws["!freeze"] = { ySplit: 1 }
  } catch (_) {
    // ignore
  }

  try {
    const range = XLSX.utils.decode_range(`A5:G${wsData.length}`)
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c })
        if (ws[ref]) {
          ws[ref].s = ws[ref].s || {}
          ws[ref].s.border = ws[ref].s.border || {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } },
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }

  XLSX.utils.book_append_sheet(wb, ws, "History Target Penjualan")
  const tokoSan = sanitizeFileName(storeName || "Toko")
  const periodeSan = sanitizeFileName(periodeLabel || "Periode")
  const defaultName = `${tokoSan} - Target Penjualan - ${periodeSan}.xlsx`
  XLSX.writeFile(wb, options.filename || defaultName)
}

export type ExportMonitoringErrorRow = {
  Tanggal: string
  Karyawan: string
  "Jenis Error": string
  Keterangan: string
  JenisError?: string
}

export type ExportMonitoringErrorOptions = {
  rows: ExportMonitoringErrorRow[]
  periodeLabel: string
  storeName: string
  filename?: string
}

export function exportMonitoringErrorHistory(options: ExportMonitoringErrorOptions) {
  const { rows, periodeLabel, storeName } = options
  const wb = XLSX.utils.book_new()
  const wsData: any[] = []

  wsData.push(["HISTORY MONITORING ERROR"])
  wsData.push([`TOKO: ${storeName || "-"}`])
  wsData.push([`PERIODE: ${periodeLabel}`])
  wsData.push([])
  wsData.push(["Tanggal", "Karyawan", "Jenis Error", "Keterangan"])

  for (const r of rows) {
    const jenis = (r as any)["Jenis Error"] ?? (r as any).JenisError ?? "-"
    wsData.push([
      r.Tanggal,
      r.Karyawan || "-",
      jenis || "-",
      r.Keterangan || "-",
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws["!cols"] = [
    { wch: 14 },
    { wch: 22 },
    { wch: 20 },
    { wch: 36 },
  ]

  try {
    const headerRowIndex = 4
    const colCount = 4
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: headerRowIndex, c })
      if (ws[cellRef]) {
        ws[cellRef].s = ws[cellRef].s || {}
        ws[cellRef].s.font = ws[cellRef].s.font || { bold: true }
        ws[cellRef].s.font.bold = true
        ws[cellRef].s.fill = ws[cellRef].s.fill || {
          patternType: "solid",
          fgColor: { rgb: "F3F4F6" },
        }
      }
    }
  } catch (_) {
    // ignore
  }

  try {
    const dataStartRow = 5
    const lastRow = wsData.length - 1
    for (let r = dataStartRow; r <= lastRow; r++) {
      const ketRef = XLSX.utils.encode_cell({ r, c: 3 })
      if (ws[ketRef]) {
        ws[ketRef].s = ws[ketRef].s || {}
        ws[ketRef].s.alignment = ws[ketRef].s.alignment || { wrapText: true }
        ws[ketRef].s.alignment.wrapText = true
      }
    }
  } catch (_) {
    // ignore
  }

  try {
    const lastRow = wsData.length
    ws["!autofilter"] = { ref: `A5:D${lastRow}` }
    ws["!freeze"] = { ySplit: 1 }
  } catch (_) {
    // ignore
  }

  try {
    const range = XLSX.utils.decode_range(`A5:D${wsData.length}`)
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const ref = XLSX.utils.encode_cell({ r, c })
        if (ws[ref]) {
          ws[ref].s = ws[ref].s || {}
          ws[ref].s.border = ws[ref].s.border || {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } },
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }

  XLSX.utils.book_append_sheet(wb, ws, "History Monitoring Error")
  const tokoSan = sanitizeFileName(storeName || "Toko")
  const periodeSan = sanitizeFileName(periodeLabel || "Periode")
  const defaultName = `${tokoSan} - Monitoring Error - ${periodeSan}.xlsx`
  XLSX.writeFile(wb, options.filename || defaultName)
}
