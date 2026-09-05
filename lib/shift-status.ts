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
    hex: "#EF4444",
    className: "bg-red-500 text-white ring-red-500/30",
  },
  {
    status: "izin",
    code: "I",
    label: "IZIN",
    title: "IZIN",
    hex: "#EF4444",
    className: "bg-red-500 text-white ring-red-500/30",
  },
  {
    status: "sakit",
    code: "K",
    label: "SAKIT",
    title: "SAKIT",
    hex: "#EF4444",
    className: "bg-red-500 text-white ring-red-500/30",
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

// ============================================================
// STATUS KHUSUS ("-")
//
// BUKAN status utama baru. Nilai field "status" tetap
// "status_khusus", sedangkan jenisnya disimpan pada field
// "statusKhusus" (backup_toko_lain, kegiatan_lain, dll).
// Data lama (6 status) maupun konsep satu nilai status khusus
// dengan banyak sub-jenis tetap didukung.
// ============================================================

// Nilai field "status" untuk status khusus.
export const STATUS_KHUSUS = "status_khusus"

// Jenis status khusus (nilai field "statusKhusus").
export type StatusKhusus =
  | "backup_toko_lain"
  | "kegiatan_lain"
  | "tugas_admin"
  | "training"
  | "inventaris_stock_opname"
  | "rapat_meeting"
  | "event_kegiatan_perusahaan"
  | "dinas_tugas_luar"
  | "lainnya"

export type StatusKhususItem = {
  // Nilai field "statusKhusus".
  value: StatusKhusus
  // Label user-facing lengkap.
  label: string
  // Deskripsi untuk tooltip/keterangan.
  description: string
}

export const STATUS_KHUSUS_ITEMS: StatusKhususItem[] = [
  {
    value: "backup_toko_lain",
    label: "BACK UP TOKO LAIN",
    description: "Ditugaskan membantu operasional di toko lain",
  },
  {
    value: "kegiatan_lain",
    label: "KEGIATAN LAIN",
    description: "Kegiatan perusahaan, pelatihan, meeting, dll.",
  },
  {
    value: "tugas_admin",
    label: "TUGAS ADMIN",
    description: "Tugas administratif / non-operasional",
  },
  {
    value: "training",
    label: "TRAINING",
    description: "Kegiatan training atau pelatihan",
  },
  {
    value: "inventaris_stock_opname",
    label: "INVENTARIS / STOCK OPNAME",
    description: "Kegiatan inventaris atau pengecekan stok",
  },
  {
    value: "rapat_meeting",
    label: "RAPAT / MEETING",
    description: "Meeting internal/cabang/perusahaan",
  },
  {
    value: "event_kegiatan_perusahaan",
    label: "EVENT / KEGIATAN PERUSAHAAN",
    description: "Event atau kegiatan perusahaan",
  },
  {
    value: "dinas_tugas_luar",
    label: "DINAS / TUGAS LUAR",
    description: "Ditugaskan ke lokasi di luar toko",
  },
  {
    value: "lainnya",
    label: "LAINNYA",
    description: "Keterangan diisi manual",
  },
]

export function getStatusKhususItem(value?: string | null): StatusKhususItem | undefined {
  return STATUS_KHUSUS_ITEMS.find((item) => item.value === value)
}
