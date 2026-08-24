import {
  LayoutDashboard,
  Store,
  ClipboardList,
  CalendarDays,
  History,
  UsersRound,
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
 * MENU CENTRAL
 * =====================================================
 *
 * CENTRAL PUSAT dan CENTRAL CABANG menggunakan menu ini.
 */
export const CENTRAL_NAV_ITEMS: NavItem[] = [
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
]

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
export const STORE_NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    label: "DASHBOARD",
    icon: LayoutDashboard,
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
    key: "shift",
    label: "SHIFT CABANG",
    icon: CalendarDays,
  },
  {
    key: "history",
    label: "HISTORY",
    icon: History,
  },
]

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
  shift: "SHIFT CABANG",
  history: "HISTORY",
}