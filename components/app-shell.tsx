"use client"

import * as React from "react"
import {
  AppProvider,
  useApp,
  type PageKey,
} from "@/components/app-context"
import { useAuth } from "@/components/auth-context"
import { DesktopSidebar, MobileSidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { DashboardPage } from "@/components/pages/dashboard"
import { BuatJadwalPage } from "@/components/pages/buat-jadwal"
import { PengaturanPage } from "@/components/pages/pengaturan"
import { RevisiPage } from "@/components/pages/revisi"
import { ShiftPage, ShiftCabangPage } from "@/components/pages/shift"
import { HistoryPage } from "@/components/pages/history"
import { ManajemenAkunPage } from "@/components/pages/manajemen-akun"

function PageContent() {
  const { page, setPage } = useApp()
  const { profile } = useAuth()

  const role = profile?.role ?? ""

  /*
   * =====================================================
   * AKSES HALAMAN STORE
   * =====================================================
   *
   * STORE hanya boleh mengakses halaman berikut.
   *
   * Jika page berubah ke halaman Central secara paksa,
   * Store akan diarahkan kembali ke DASHBOARD.
   */
  const storeAllowedPages: PageKey[] = [
    "dashboard",
    "buat-jadwal",
    "revisi",
    "shift",
    "shift-cabang",
    "history",
  ]

  if (
    role === "store" &&
    !storeAllowedPages.includes(page)
  ) {
    setPage("dashboard")
    return <DashboardPage />
  }

  switch (page) {
    case "dashboard":
      return <DashboardPage />
    case "buat-jadwal":
      return <BuatJadwalPage />

    case "manajemen-akun":
      return <ManajemenAkunPage />

    case "pengaturan":
      return <PengaturanPage />

    case "revisi":
      return <RevisiPage />

    case "shift":
      return <ShiftPage />

    case "shift-cabang":
      return <ShiftCabangPage />

    case "history":
      return <HistoryPage />

    default:
      return null
  }
}

function Shell() {
  const [mobileOpen, setMobileOpen] =
    React.useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <DesktopSidebar />

      <MobileSidebar
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onMenu={() => setMobileOpen(true)}
        />

        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-[1400px]">
            <PageContent />
          </div>
        </main>
      </div>
    </div>
  )
}

export function AppShell() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
