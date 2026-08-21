"use client"

import * as React from "react"
import { AppProvider, useApp } from "@/components/app-context"
import { DesktopSidebar, MobileSidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { DashboardPage } from "@/components/pages/dashboard"
import { PengaturanPage } from "@/components/pages/pengaturan"
import { RevisiPage } from "@/components/pages/revisi"
import { ShiftPage } from "@/components/pages/shift"
import { HistoryPage } from "@/components/pages/history"

function PageContent() {
  const { page } = useApp()
  switch (page) {
    case "dashboard":
      return <DashboardPage />
    case "pengaturan":
      return <PengaturanPage />
    case "revisi":
      return <RevisiPage />
    case "shift":
      return <ShiftPage />
    case "history":
      return <HistoryPage />
    default:
      return null
  }
}

function Shell() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="flex min-h-svh bg-background">
      <DesktopSidebar />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setMobileOpen(true)} />
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
