"use client"

import * as React from "react"
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
} from "firebase/firestore"

import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-context"

import type {
  Revisi,
  RevisiStatus,
} from "@/lib/data"

export type PageKey =
  | "dashboard"
  | "pengaturan"
  | "revisi"
  | "shift"
  | "shift-cabang"
  | "history"
  | "manajemen-akun"
  | "buat-jadwal"

type AppContextValue = {
  page: PageKey
  setPage: (p: PageKey) => void

  revisi: Revisi[]
  loadingRevisi: boolean

  refreshRevisi: () => Promise<void>
  advanceRevisi: (id: string) => Promise<void>

  pendingRevisiCount: number
}

const AppContext =
  React.createContext<AppContextValue | null>(null)

const NEXT_STATUS: Record<
  RevisiStatus,
  RevisiStatus
> = {
  BARU: "PROSES",
  PROSES: "SELESAI",
  SELESAI: "SELESAI",
}

export function AppProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile, loading: authLoading } =
    useAuth()

  const [page, setPage] =
    React.useState<PageKey>("dashboard")

  const [revisi, setRevisi] =
    React.useState<Revisi[]>([])

  const [loadingRevisi, setLoadingRevisi] =
    React.useState(true)

  const refreshRevisi =
    React.useCallback(async () => {
      if (authLoading) return

      if (!profile) {
        setRevisi([])
        setLoadingRevisi(false)
        return
      }

      setLoadingRevisi(true)

      try {
        const revisiRef =
          collection(
            db,
            "revisi",
          )

        let snapshot

        // ====================================================
        // STORE
        // Hanya mengambil revisi milik tokonya sendiri.
        // ====================================================

        if (
          profile.role === "store" &&
          profile.storeId
        ) {
          snapshot = await getDocs(
            query(
              revisiRef,
              where(
                "storeId",
                "==",
                profile.storeId,
              ),
            ),
          )
        }

        // ====================================================
        // CENTRAL CABANG
        // Query harus dibatasi cabang agar dapat dibuktikan
        // oleh Firestore Rules. Setiap dokumen revisi harus
        // menyimpan cabangId yang sesuai dengan Store-nya.
        // ====================================================

        else if (
          profile.role ===
            "central_cabang" &&
          profile.cabangId
        ) {
          snapshot =
            await getDocs(
              query(
                revisiRef,
                where(
                  "cabangId",
                  "==",
                  profile.cabangId,
                ),
              ),
            )
        }

        // ====================================================
        // CENTRAL PUSAT
        // Bisa melihat seluruh revisi.
        // ====================================================

        else {
          snapshot =
            await getDocs(
              revisiRef,
            )
        }

        const data =
          snapshot.docs.map(
            (item) =>
              ({
                id: item.id,
                ...item.data(),
              }) as Revisi,
          )

        setRevisi(data)
      } catch (error) {
        console.error(
          "Gagal mengambil data revisi:",
          error,
        )

        setRevisi([])
      } finally {
        setLoadingRevisi(false)
      }
    }, [
      profile,
      authLoading,
    ])

  React.useEffect(() => {
    refreshRevisi()
  }, [refreshRevisi])

  const advanceRevisi =
    React.useCallback(
      async (id: string) => {
        const current =
          revisi.find(
            (r) => r.id === id,
          )

        if (!current) return

        const nextStatus =
          NEXT_STATUS[
            current.status
          ]

        if (
          nextStatus ===
          current.status
        ) {
          return
        }

        try {
          await updateDoc(
            doc(
              db,
              "revisi",
              id,
            ),
            {
              status:
                nextStatus,
            },
          )

          setRevisi(
            (prev) =>
              prev.map(
                (r) =>
                  r.id === id
                    ? {
                        ...r,
                        status:
                          nextStatus,
                      }
                    : r,
              ),
          )
        } catch (error) {
          console.error(
            "Gagal memperbarui revisi:",
            error,
          )

          throw error
        }
      },
      [revisi],
    )

  const pendingRevisiCount =
    React.useMemo(
      () =>
        revisi.filter(
          (r) =>
            r.status !==
            "SELESAI",
        ).length,
      [revisi],
    )

  const value: AppContextValue = {
    page,
    setPage,

    revisi,
    loadingRevisi,

    refreshRevisi,
    advanceRevisi,

    pendingRevisiCount,
  }

  return (
    <AppContext.Provider
      value={value}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx =
    React.useContext(
      AppContext,
    )

  if (!ctx) {
    throw new Error(
      "useApp must be used within AppProvider",
    )
  }

  return ctx
}
