"use client"

import * as React from "react"
import {
  initialRevisi,
  type Revisi,
  type RevisiStatus,
} from "@/lib/data"

export type PageKey =
  | "dashboard"
  | "pengaturan"
  | "revisi"
  | "shift"
  | "history"
  | "manajemen-akun"
  | "buat-jadwal"

type AppContextValue = {
  page: PageKey
  setPage: (p: PageKey) => void
  revisi: Revisi[]
  advanceRevisi: (id: string) => void
  pendingRevisiCount: number
}

const AppContext = React.createContext<AppContextValue | null>(null)

const NEXT_STATUS: Record<RevisiStatus, RevisiStatus> = {
  BARU: "PROSES",
  PROSES: "SELESAI",
  SELESAI: "SELESAI",
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = React.useState<PageKey>("dashboard")
  const [revisi, setRevisi] = React.useState<Revisi[]>(initialRevisi)

  const advanceRevisi = React.useCallback((id: string) => {
    setRevisi((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: NEXT_STATUS[r.status] } : r,
      ),
    )
  }, [])

  const pendingRevisiCount = React.useMemo(
    () => revisi.filter((r) => r.status !== "SELESAI").length,
    [revisi],
  )

  const value: AppContextValue = {
    page,
    setPage,
    revisi,
    advanceRevisi,
    pendingRevisiCount,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = React.useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
