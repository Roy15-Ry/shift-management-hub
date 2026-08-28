"use client"

import * as React from "react"
import {
  Bell,
  Menu,
  UserRound,
  ChevronDown,
  LogOut,
  Sun,
  Moon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/components/app-context"
import { useAuth } from "@/components/auth-context"
import { PAGE_TITLES } from "@/components/nav-config"
import { getStore } from "@/lib/data"
import { auth, logoutUser } from "@/lib/auth"

export function Header({ onMenu }: { onMenu: () => void }) {
  const { page, setPage, revisi, pendingRevisiCount } = useApp()
  const { profile } = useAuth()

  const [notifOpen, setNotifOpen] = React.useState(false)
  const [darkMode, setDarkMode] = React.useState(false)
  const [accountOpen, setAccountOpen] = React.useState(false)
  const [unitName, setUnitName] =
    React.useState<string | null>(null)

  const notifRef = React.useRef<HTMLDivElement>(null)
  const accountRef = React.useRef<HTMLDivElement>(null)

  // ================================
  // DATA AKUN DARI FIRESTORE
  // ================================
  const accountRole =
    profile?.role || "central_pusat"

  const accountRoleLabel =
    accountRole === "central_pusat"
      ? "CENTRAL PUSAT"
      : accountRole === "central_cabang"
        ? "CENTRAL CABANG"
        : accountRole === "store"
          ? "STORE"
          : accountRole.toUpperCase()

  const fallbackAccountName =
    accountRole === "store"
      ? profile?.namaStore || "STORE"
      : accountRole === "central_cabang"
        ? profile?.cabangId || "CENTRAL CABANG"
        : "CENTRAL PUSAT"

  const accountName =
    unitName || fallbackAccountName

  const adminName =
    profile?.nama || "-"

  // ================================
  // IDENTITAS UNIT AKUN
  // ================================
  React.useEffect(() => {
    let cancelled = false

    async function loadUnitName() {
      if (
        !profile ||
        accountRole === "central_pusat"
      ) {
        setUnitName(null)
        return
      }

      const currentUser = auth.currentUser

      if (!currentUser) {
        setUnitName(null)
        return
      }

      setUnitName(null)

      try {
        const idToken =
          await currentUser.getIdToken()

        if (accountRole === "store") {
          const response = await fetch(
            "/api/admin/stores",
            {
              headers: {
                Authorization:
                  `Bearer ${idToken}`,
              },
            },
          )

          if (!response.ok) {
            throw new Error(
              "Gagal mengambil identitas Store.",
            )
          }

          const data = await response.json()
          const store = data.stores?.find(
            (item: {
              storeId?: string
              namaStore?: string
            }) =>
              item.storeId ===
              profile.storeId,
          )

          if (!cancelled) {
            setUnitName(
              store?.namaStore || null,
            )
          }

          return
        }

        if (
          accountRole === "central_cabang"
        ) {
          const response = await fetch(
            "/api/admin/branches",
            {
              headers: {
                Authorization:
                  `Bearer ${idToken}`,
              },
            },
          )

          if (!response.ok) {
            throw new Error(
              "Gagal mengambil identitas Cabang.",
            )
          }

          const data = await response.json()
          const branch = data.branches?.find(
            (item: {
              cabangId?: string
              nama?: string
            }) =>
              item.cabangId ===
              profile.cabangId,
          )

          if (!cancelled) {
            setUnitName(
              branch?.nama || null,
            )
          }
        }
      } catch (error) {
        console.error(
          "Gagal mengambil identitas unit akun:",
          error,
        )

        if (!cancelled) {
          setUnitName(null)
        }
      }
    }

    loadUnitName()

    return () => {
      cancelled = true
    }
  }, [
    accountRole,
    profile?.storeId,
    profile?.cabangId,
  ])

  // ================================
  // MEMBACA TEMA YANG TERSIMPAN
  // ================================
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

  // ================================
  // TOGGLE DARK MODE
  // ================================
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

  // ================================
  // MENUTUP DROPDOWN KETIKA KLIK DI LUAR
  // ================================
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as Node

      if (
        notifRef.current &&
        !notifRef.current.contains(target)
      ) {
        setNotifOpen(false)
      }

      if (
        accountRef.current &&
        !accountRef.current.contains(target)
      ) {
        setAccountOpen(false)
      }
    }

    document.addEventListener("mousedown", onClick)

    return () => {
      document.removeEventListener("mousedown", onClick)
    }
  }, [])

  // ================================
  // DATA NOTIFIKASI
  // ================================
  const pending = revisi
    .filter((r) => r.status !== "SELESAI")
    .slice(0, 5)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md transition-colors duration-300 md:px-6">

      {/* ================================
          MOBILE MENU
      ================================= */}
      <button
        type="button"
        onClick={onMenu}
        aria-label="Buka menu"
        className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* ================================
          PAGE TITLE
      ================================= */}
      <h1 className="text-base font-semibold tracking-tight md:text-lg">
        {PAGE_TITLES[page]}
      </h1>

      {/* ================================
          RIGHT HEADER
      ================================= */}
      <div className="ml-auto flex items-center gap-2 md:gap-3">

        {/* ================================
            NOTIFICATION
        ================================= */}
        <div
          className="relative"
          ref={notifRef}
        >
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v)
              setAccountOpen(false)
            }}
            aria-label="Notifikasi"
            aria-expanded={notifOpen}
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

              {/* Notification Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">
                  Notifikasi
                </p>

                <span className="rounded-md bg-status-sakit-bg px-2 py-0.5 text-xs font-medium text-status-sakit">
                  {pendingRevisiCount} perlu diproses
                </span>
              </div>

              {/* Notification List */}
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

              {/* View All */}
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

        {/* ================================
            DARK MODE
        ================================= */}
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
          className="flex size-9 items-center justify-center rounded-md text-foreground transition-all duration-300 hover:bg-muted"
        >
          {darkMode ? (
            <Sun className="size-5" />
          ) : (
            <Moon className="size-5" />
          )}
        </button>

        {/* ================================
            ACCOUNT MENU
        ================================= */}
        <div
          className="relative"
          ref={accountRef}
        >
          <button
            type="button"
            onClick={() => {
              setAccountOpen((v) => !v)
              setNotifOpen(false)
            }}
            aria-label="Menu akun"
            aria-expanded={accountOpen}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 transition-colors hover:bg-muted md:px-3"
          >
            {/* Avatar */}
            <div className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UserRound className="size-4" />
            </div>

            {/* Account Name */}
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-xs font-semibold">
                {accountRole === "central_pusat"
                  ? "CENTRAL"
                  : accountRoleLabel}
              </p>

              <p className="text-[0.7rem] text-muted-foreground">
                {accountRole === "central_pusat"
                  ? "Pusat Monitoring"
                  : accountRoleLabel}
              </p>
            </div>

            {/* Arrow */}
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200",
                accountOpen && "rotate-180",
              )}
            />
          </button>

          {/* ================================
              ACCOUNT DROPDOWN
          ================================= */}
          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">

              {/* Account Information */}
              <div className="border-b border-border px-4 py-4">

                {/* Nama Akun */}
                <div>
                  <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                    NAMA AKUN
                  </p>

                  <p className="text-sm font-semibold text-foreground">
                    {accountName}
                  </p>
                </div>

                {/* Jenis Akun */}
                <div className="mt-3">
                  <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                    JENIS AKUN
                  </p>

                  <p className="text-sm font-semibold text-foreground">
                    {accountRoleLabel}
                  </p>
                </div>

                {/* Nama Admin */}
                <div className="mt-3">
                  <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                    NAMA ADMIN
                  </p>

                  <p className="text-sm font-semibold text-foreground">
                    {adminName}
                  </p>
                </div>

              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    await logoutUser()
                    setAccountOpen(false)
                  } catch (error) {
                    console.error("Gagal logout:", error)
                  }
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-muted"
              >
                <LogOut className="size-4" />
                LOGOUT
              </button>

            </div>
          )}
        </div>

      </div>
    </header>
  )
}
