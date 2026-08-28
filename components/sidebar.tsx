"use client"

import { CalendarClock, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/components/app-context"
import { useAuth } from "@/components/auth-context"
import {
  CENTRAL_NAV_ITEMS,
  STORE_NAV_ITEMS,
} from "@/components/nav-config"

function SidebarContent({
  onNavigate,
}: {
  onNavigate?: () => void
}) {
  const {
    page,
    setPage,
    pendingRevisiCount,
  } = useApp()

  const { profile, loading } = useAuth()

  /*
   * =====================================================
   * ROLE AKUN
   * =====================================================
   */
  const role = profile?.role ?? ""

  /*
   * =====================================================
   * TENTUKAN MENU BERDASARKAN ROLE
   * =====================================================
   *
   * STORE  -> STORE_NAV_ITEMS
   * CENTRAL -> CENTRAL_NAV_ITEMS
   */
  const navItems =
  loading
    ? []
    : role === "store"
      ? STORE_NAV_ITEMS
      : CENTRAL_NAV_ITEMS

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <CalendarClock className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-tight text-white">
            SHIFT MANAGEMENT HUB
          </p>

          <p className="truncate text-xs text-sidebar-foreground/70">
            Monitoring Jadwal Shift
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 mb-2 h-px bg-sidebar-border" />

      {/* Navigation */}
      <nav
        className="flex-1 space-y-1 px-3 py-2"
        aria-label="Menu utama"
      >
        <p className="px-2 pb-1 pt-2 text-[0.7rem] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Menu
        </p>

        {navItems.map((item) => {
          const active = page === item.key
          const Icon = item.icon

          return (
            <button
              key={item.key}
              type="button"
              aria-current={
                active
                  ? "page"
                  : undefined
              }
              onClick={() => {
                setPage(item.key)
                onNavigate?.()
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0" />

              <span className="flex-1 text-left">
                {item.label}
              </span>

              {/* Badge Revisi */}
              {item.key === "revisi" &&
                pendingRevisiCount > 0 && (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[0.7rem] font-semibold",
                      active
                        ? "bg-white/25 text-white"
                        : "bg-status-sakit text-white",
                    )}
                  >
                    {pendingRevisiCount}
                  </span>
                )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

/*
 * =====================================================
 * DESKTOP SIDEBAR
 * =====================================================
 */
export function DesktopSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:block">
      <div className="fixed inset-y-0 left-0 w-64">
        <SidebarContent />
      </div>
    </aside>
  )
}

/*
 * =====================================================
 * MOBILE SIDEBAR
 * =====================================================
 */
export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 lg:hidden",
        open
          ? "pointer-events-auto"
          : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      {/* Overlay */}
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity",
          open
            ? "opacity-100"
            : "opacity-0",
        )}
      />

      {/* Mobile Sidebar */}
      <div
        role="dialog"
        aria-label="Menu navigasi"
        className={cn(
          "absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl transition-transform duration-300",
          open
            ? "translate-x-0"
            : "-translate-x-full",
        )}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu"
          className="absolute right-3 top-4 z-10 flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>

        <SidebarContent
          onNavigate={onClose}
        />
      </div>
    </div>
  )
}
