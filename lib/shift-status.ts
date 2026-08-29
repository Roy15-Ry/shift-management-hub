// ============================================================
// SATU SUMBER UNTUK TAMPILAN STATUS SHIFT
//
// Digunakan oleh tabel jadwal (BUAT JADWAL SHIFT dan
// JADWAL SHIFT / SHIFT CABANG) agar label & warna konsisten.
//
// Hanya PRESENTASI. TIDAK mengubah value internal/shift status
// yang tersimpan di Firestore (shift_pagi, shift_siang, libur,
// cuti, izin, sakit).
// ============================================================

import type { ShiftStatus } from "@/lib/data"

export type ShiftStatusItem = {
  status: ShiftStatus
  // Kode pendek (internal/kompak, untuk tooltip/PDF/picker).
  code: string
  // Label user-facing lengkap.
  label: string
  // Judul lengkap (untuk keterangan/legenda).
  title: string
  // HEX wajib standar.
  hex: string
  // Kelas badge solid dengan warna standar.
  className: string
}

export const SHIFT_STATUS_ITEMS: ShiftStatusItem[] = [
  {
    status: "shift_pagi",
    code: "P",
    label: "PAGI",
    title: "SHIFT PAGI",
    hex: "#22C55E",
    className: "bg-green-500 text-white ring-green-500/30",
  },
  {
    status: "shift_siang",
    code: "S",
    label: "SIANG",
    title: "SHIFT SIANG",
    hex: "#3B82F6",
    className: "bg-blue-500 text-white ring-blue-500/30",
  },
  {
    status: "libur",
    code: "L",
    label: "LIBUR",
    title: "LIBUR",
    hex: "#EF4444",
    className: "bg-red-500 text-white ring-red-500/30",
  },
  {
    status: "cuti",
    code: "C",
    label: "CUTI",
    title: "CUTI",
    hex: "#8B5CF6",
    className: "bg-violet-500 text-white ring-violet-500/30",
  },
  {
    status: "izin",
    code: "I",
    label: "IZIN",
    title: "IZIN",
    hex: "#F59E0B",
    className: "bg-amber-500 text-white ring-amber-500/30",
  },
  {
    status: "sakit",
    code: "K",
    label: "SAKIT",
    title: "SAKIT",
    hex: "#06B6D4",
    className: "bg-cyan-500 text-white ring-cyan-500/30",
  },
]

export const SHIFT_STATUS_ORDER: ShiftStatus[] = [
  "shift_pagi",
  "shift_siang",
  "libur",
  "cuti",
  "izin",
  "sakit",
]

export function getShiftStatusItem(status?: string | null): ShiftStatusItem | undefined {
  return SHIFT_STATUS_ITEMS.find((item) => item.status === status)
}
