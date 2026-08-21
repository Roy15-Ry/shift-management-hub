import {
  LayoutDashboard,
  Store,
  ClipboardList,
  CalendarDays,
  History,
  type LucideIcon,
} from "lucide-react"
import type { PageKey } from "@/components/app-context"

export type NavItem = {
  key: PageKey
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pengaturan", label: "Pengaturan Toko", icon: Store },
  { key: "revisi", label: "Revisi Absensi", icon: ClipboardList },
  { key: "shift", label: "Shift Cabang", icon: CalendarDays },
  { key: "history", label: "History", icon: History },
]

export const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: "DASHBOARD",
  pengaturan: "PENGATURAN TOKO",
  revisi: "REVISI ABSENSI",
  shift: "SHIFT CABANG",
  history: "HISTORY",
}