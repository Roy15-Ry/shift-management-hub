"use client"

import * as React from "react"
import { Bell, Menu, UserRound, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/components/app-context"
import { PAGE_TITLES } from "@/components/nav-config"
import { getStore } from "@/lib/data"

export function Header({ onMenu }: { onMenu: () => void }) {
  const { page, setPage, revisi, pendingRevisiCount } = useApp()

  const [notifOpen, setNotifOpen] = React.useState(false)
  const [darkMode, setDarkMode] = React.useState(false)

  const notifRef = React.useRef<HTMLDivElement>(null)

  // Membaca tema yang tersimpan
  React.useEffect(() => {
    const savedTheme = localStorage.getItem("theme")

    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark")
      document.documentElement.classList.remove("light")
      setDarkMode(true)
    } else {
      document.documentElement.classList.remove("dark")
      document.documentElement.classList.add("light")
      setDarkMode(false)
    }
  }, [])

  // Mengubah mode normal dan malam
  function toggleDarkMode() {
    const html = document.documentElement

    if (darkMode) {
      html.classList.remove("dark")
      html.classList.add("light")

      localStorage.setItem("theme", "light")
      setDarkMode(false)
    } else {
      html.classList.add("dark")
      html.classList.remove("light")

      localStorage.setItem("theme", "dark")
      setDarkMode(true)
    }
  }

  // Menutup notifikasi ketika klik di luar
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        notifRef.current &&
        !notifRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false)
      }
    }

    document.addEventListener("mousedown", onClick)

    return () =>
      document.removeEventListener("mousedown", onClick)
  }, [])

  const pending = revisi
    .filter((r) => r.status !== "SELESAI")
    .slice(0, 5)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6">

      {/* Mobile Menu */}
      <button
        type="button"
        onClick={onMenu}
        aria-label="Buka menu"
        className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Page Title */}
      <h1 className="text-base font-semibold tracking-tight md:text-lg">
        {PAGE_TITLES[page]}
      </h1>

      <div className="ml-auto flex items-center gap-2 md:gap-3">

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifikasi"
            className="relative flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          >
            <Bell className="size-5" />

            {pendingRevisiCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-status-sakit text-[0.6rem] font-bold text-white ring-2 ring-background">
                {pendingRevisiCount > 9
                  ? "9+"
                  : pendingRevisiCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-lg">

              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">
                  Notifikasi
                </p>

                <span className="rounded-md bg-status-sakit-bg px-2 py-0.5 text-xs font-medium text-status-sakit">
                  {pendingRevisiCount} perlu diproses
                </span>
              </div>

              <div className="max-h-80 overflow-y-auto">
                {pending.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Tidak ada revisi yang perlu diproses.
                  </p>
                ) : (
                  pending.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-0"
                    >
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          r.status === "BARU"
                            ? "bg-status-siang"
                            : "bg-status-pagi",
                        )}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          Revisi Absensi &middot;{" "}
                          {getStore(r.storeId)?.name}
                        </p>

                        <p className="truncate text-xs text-muted-foreground">
                          {r.employeeName} — {r.keterangan} (
                          {r.status})
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPage("revisi")
                  setNotifOpen(false)
                }}
                className="w-full border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary transition-colors hover:bg-muted"
              >
                Lihat semua revisi
              </button>
            </div>
          )}
        </div>

        {/* Dark Mode */}
        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label={
            darkMode
              ? "Kembali ke mode normal"
              : "Aktifkan mode malam"
          }
          title={
            darkMode
              ? "Mode normal"
              : "Mode malam"
          }
          className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
        >
          {darkMode ? (
            <Sun className="size-5" />
          ) : (
            <Moon className="size-5" />
          )}
        </button>

        {/* Profile */}
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pl-1.5 pr-2 md:pr-3">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserRound className="size-4" />
          </div>

          <div className="hidden text-left leading-tight sm:block">
            <p className="text-xs font-semibold">
              CENTRAL
            </p>

            <p className="text-[0.7rem] text-muted-foreground">
              Pusat Monitoring
            </p>
          </div>
        </div>

      </div>
    </header>
  )
}