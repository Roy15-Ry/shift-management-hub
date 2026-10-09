"use client"

import * as React from "react"
import {
  AppProvider,
  useApp,
  type PageKey,
} from "@/components/app-context"
import { useAuth } from "@/components/auth-context"
import { REVISI_ABSENSI_ENABLED } from "@/components/nav-config"
import { logoutUser } from "@/lib/auth"
import { DesktopSidebar, MobileSidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { DashboardPage } from "@/components/pages/dashboard"
import { BuatJadwalPage } from "@/components/pages/buat-jadwal"
import { PengaturanPage } from "@/components/pages/pengaturan"
import { RevisiPage } from "@/components/pages/revisi"
import { ShiftPage, ShiftCabangPage } from "@/components/pages/shift"
import { HistoryPage } from "@/components/pages/history"
import { ManajemenAkunPage } from "@/components/pages/manajemen-akun"
import { JadwalLiburPage } from "@/components/pages/jadwal-libur"
import { AdditionalSellingPage } from "@/components/pages/additional-selling"
import { MonitoringErrorPage } from "@/components/pages/monitoring-error"

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
    "pengaturan",
    "additional-selling",
    "monitoring-error",
  ]

  if (
    role === "store" &&
    !storeAllowedPages.includes(page)
  ) {
    setPage("dashboard")
    return <DashboardPage />
  }

  /*
   * =====================================================
   * FEATURE LOCK — REVISI ABSENSI
   * =====================================================
   *
   * Page key "revisi" dapat dipulihkan dari localStorage
   * sehingga menu yang disembunyikan saja tidak cukup untuk
   * menutup akses halaman.
   *
   * Selama feature lock aktif, halaman Revisi tidak pernah
   * dirender dan user diarahkan ke DASHBOARD memakai
   * mekanisme navigasi yang sama dengan guard Store di atas.
   * Mengubah REVISI_ABSENSI_ENABLED menjadi true langsung
   * mengembalikan halaman ini tanpa perubahan lain.
   */

  if (
    !REVISI_ABSENSI_ENABLED &&
    page === "revisi"
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

    case "jadwal-libur":
      return <JadwalLiburPage />

    case "additional-selling":
      return <AdditionalSellingPage />

    case "monitoring-error":
      return <MonitoringErrorPage />

    default:
      return null
  }
}

function Shell() {
  const [mobileOpen, setMobileOpen] =
    React.useState(false)
  const {
    sidebarCollapsed,
    logoutModalOpen,
    closeLogoutModal,
  } = useApp()

  const [loggingOut, setLoggingOut] =
    React.useState(false)

  async function handleLogout() {
    if (loggingOut) {
      return
    }

    setLoggingOut(true)

    try {
      await logoutUser()
      closeLogoutModal()
    } catch (error) {
      console.error("Gagal logout:", error)
      setLoggingOut(false)
    }
  }

  return (
    <div className="flex min-h-svh bg-background">
      {!sidebarCollapsed && <DesktopSidebar />}

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

        <footer className="px-4 py-3 md:px-6">
          <p
            className="max-w-[1400px] text-xs text-muted-foreground"
          >
            © 2026 - Shift Management. All Rights Reserved.
          </p>
        </footer>
      </div>

      <Modal
        open={logoutModalOpen}
        onClose={closeLogoutModal}
        title="Logout"
        description="Anda akan keluar dari aplikasi. Apakah Anda yakin?"
        footer={
          <>
            <Button
              variant="outline"
              onClick={closeLogoutModal}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? "Logout..." : "Logout"}
            </Button>
          </>
        }
      />
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
