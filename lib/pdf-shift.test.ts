import { afterEach, describe, expect, it, vi } from "vitest"

const pdfFixture = vi.hoisted(() => ({
  tables: [] as string[][][],
  saved: "" as string,
}))

vi.mock("jspdf", () => ({
  jsPDF: class {
    lastAutoTable = { finalY: 0, head: [{ height: 5 }, { height: 5 }] }

    addPage() {}
    line() {}
    rect() {}
    save(filename: string) { pdfFixture.saved = filename }
    setDrawColor() {}
    setFillColor() {}
    setFont() {}
    setFontSize() {}
    setLineWidth() {}
    setTextColor() {}
    text() {}
    getFont() { return { fontName: "helvetica", fontStyle: "normal" } }
    getFontSize() { return 7 }
    getTextWidth(text: string) { return text.length }
  },
}))

vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: {
    lastAutoTable: { finalY: number; head: { height: number }[] }
  }, options: {
    body?: string[][]
    head?: unknown[]
    startY?: number
  }) => {
    pdfFixture.tables.push(options.body ?? [])
    doc.lastAutoTable = {
      finalY: (options.startY ?? 0) + 10,
      head: (options.head ?? []).map(() => ({ height: 5 })),
    }
  }),
}))

import { generateShiftSchedulePdf } from "@/lib/pdf-shift"

afterEach(() => {
  pdfFixture.tables.length = 0
  pdfFixture.saved = ""
})

describe("shift schedule PDF", () => {
  it("prints the keterangan for a LAINNYA status in the schedule cell", async () => {
    await generateShiftSchedulePdf({
      storeName: "Toko Uji",
      monthLabel: "JANUARI",
      year: 2026,
      month: 0,
      employees: [{ id: "EMP-1", name: "Karyawan Uji" }],
      getStatus: (_employeeId, tanggal) => tanggal === "2026-01-01"
        ? {
            status: "status_khusus",
            statusKhusus: "lainnya",
            keterangan: "Pelatihan khusus",
          }
        : undefined,
      getActivity: () => "",
      rekapTitle: "REKAP",
      rekapRows: [],
      filename: "uji.pdf",
    })

    expect(pdfFixture.tables[0][0][1]).toBe("Pelatihan khusus")
    expect(pdfFixture.saved).toBe("uji.pdf")
  })
})
