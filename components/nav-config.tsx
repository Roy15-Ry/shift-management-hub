import {
  LayoutDashboard,
  Store,
  ClipboardList,
  CalendarDays,
  History,
  Palmtree,
  UsersRound,
  TrendingUp,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import type { PageKey } from "@/components/app-context"

export type NavItem = {
  key: PageKey
  label: string
  icon: LucideIcon
}

/*
 * =====================================================
 * FEATURE LOCK — REVISI ABSENSI
 * =====================================================
 *
 * Satu-satunya konfigurasi status fitur Revisi Absensi.
 *
 *   false -> "REVISI ABSENSI" disembunyikan dari navigasi.
 *   true  -> menu kembali tampil tanpa perubahan kode lain.
 *
 * Halaman, API, collection Firestore, rules, dan data lama
 * tetap utuh. Fitur hanya dinonaktifkan dari penggunaan UI
 * sehingga dapat diaktifkan kembali kapan saja dengan
 * mengubah nilai ini menjadi true.
 */

export const REVISI_ABSENSI_ENABLED = false

/*
 * Menyaring item menu Revisi Absensi hanya ketika feature
 * lock aktif. Item lain apa pun tidak tersentuh.
 */

function hideLockedNavItems(items: NavItem[]): NavItem[] {
  return REVISI_ABSENSI_ENABLED
    ? items
    : items.filter((item) => item.key !== "revisi")
}

/*
 * =====================================================
 * MENU CENTRAL
 * =====================================================
 *
 * CENTRAL PUSAT dan CENTRAL CABANG menggunakan menu ini.
 */
export const CENTRAL_NAV_ITEMS: NavItem[] = hideLockedNavItems([
  {
    key: "dashboard",
    label: "DASHBOARD",
    icon: LayoutDashboard,
  },
  {
    key: "manajemen-akun",
    label: "MANAJEMEN AKUN",
    icon: UsersRound,
  },
  {
    key: "pengaturan",
    label: "PENGATURAN TOKO",
    icon: Store,
  },
  {
    key: "revisi",
    label: "REVISI ABSENSI",
    icon: ClipboardList,
  },
  {
    key: "shift",
    label: "SHIFT CABANG",
    icon: CalendarDays,
  },
  {
    key: "history",
    label: "HISTORY",
    icon: History,
  },
  {
    key: "jadwal-libur",
    label: "JADWAL LIBUR",
    icon: Palmtree,
  },
])

/*
 * =====================================================
 * MENU STORE
 * =====================================================
 *
 * STORE tidak boleh melihat menu Central.
 *
 * Untuk sementara Store hanya mendapatkan menu
 * yang memang diperuntukkan untuk Store.
 */
export const STORE_NAV_ITEMS: NavItem[] = hideLockedNavItems([
  {
    key: "dashboard",
    label: "DASHBOARD",
    icon: LayoutDashboard,
  },
  {
    key: "shift",
    label: "JADWAL SHIFT",
    icon: CalendarDays,
  },
  {
    key: "buat-jadwal",
    label: "BUAT JADWAL SHIFT",
    icon: CalendarDays,
  },
  {
    key: "revisi",
    label: "REVISI ABSENSI",
    icon: ClipboardList,
  },
  {
    key: "shift-cabang",
    label: "SHIFT CABANG",
    icon: CalendarDays,
  },
  {
    key: "history",
    label: "HISTORY",
    icon: History,
  },
])

/*
 * =====================================================
 * PROGRAM KERJA — GRUP MENU (NESTED)
 * =====================================================
 *
 * Grup menu bersarang "PROGRAM KERJA". Saat ini berisi satu
 * submenu TARGET PENJUALAN. Grup ditambahkan secara minimal
 * HANYA untuk kebutuhan fitur ini; item menu existing lain
 * (CENTRAL_NAV_ITEMS / STORE_NAV_ITEMS) tidak diubah.
 *
 * Sidebar merender grup ini setelah menu utama per role dan
 * menampilkan submenu hanya ketika grup diklik (collapse).
 */
export const PROGRAM_KERJA_GROUP: {
  label: string
  items: NavItem[]
} = {
  label: "PROGRAM KERJA",
  items: [
    {
      key: "additional-selling",
      label: "TARGET PENJUALAN",
      icon: TrendingUp,
    },
    {
      key: "monitoring-error",
      label: "MONITORING ERROR",
      icon: ShieldAlert,
    },
  ],
}

/*
 * =====================================================
 * JUDUL HALAMAN
 * =====================================================
 */
export const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: "DASHBOARD",
  "buat-jadwal": "BUAT JADWAL SHIFT",
  "manajemen-akun": "MANAJEMEN AKUN",
  pengaturan: "PENGATURAN TOKO",
  revisi: "REVISI ABSENSI",
  shift: "JADWAL SHIFT",
  "shift-cabang": "SHIFT CABANG",
  history: "HISTORY",
  "jadwal-libur": "JADWAL LIBUR",
  "additional-selling": "TARGET PENJUALAN",
  "monitoring-error": "MONITORING ERROR",
}