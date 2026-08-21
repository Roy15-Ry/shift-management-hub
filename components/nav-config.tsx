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
  {
    key: "dashboard",
    label: "DASHBOARD",
    icon: LayoutDashboard,
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

export const PAGE_TITLES: Record<PageKey, string> = {
  dashboard: "DASHBOARD",
  pengaturan: "PENGATURAN TOKO",
  revisi: "REVISI ABSENSI",
  shift: "SHIFT CABANG",
  history: "HISTORY",
}