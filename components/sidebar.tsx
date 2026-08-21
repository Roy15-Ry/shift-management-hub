"use client"

import { CalendarClock, LogOut, UserRound, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/components/app-context"
import { NAV_ITEMS } from "@/components/nav-config"

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { page, setPage, pendingRevisiCount } = useApp()

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <CalendarClock className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-white">
            SHIFT MANAGEMENT
          </p>
          <p className="truncate text-xs text-sidebar-foreground/70">
            Monitoring Jadwal Shift
          </p>
        </div>
      </div>

      <div className="mx-5 mb-2 h-px bg-sidebar-border" />

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Menu utama">
        <p className="px-2 pb-1 pt-2 text-[0.7rem] font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Menu
        </p>
        {NAV_ITEMS.map((item) => {
          const active = page === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
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
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === "revisi" && pendingRevisiCount > 0 && (
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

      {/* Account */}
      <div className="mt-auto p-3">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
            <UserRound className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">CENTRAL</p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              Pusat Monitoring
            </p>
          </div>
          <button
            type="button"
            title="Logout"
            aria-label="Logout"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function DesktopSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-sidebar-border lg:block">
      <div className="fixed inset-y-0 left-0 w-64">
        <SidebarContent />
      </div>
    </aside>
  )
}

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
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-label="Menu navigasi"
        className={cn(
          "absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu"
          className="absolute right-3 top-4 z-10 flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  )
}
