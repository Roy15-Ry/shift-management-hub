"use client"

import * as React from "react"
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore"

import { db } from "@/lib/firebase"
import { useAuth } from "@/components/auth-context"

import type {
  Revisi,
  RevisiStatus,
} from "@/lib/data"

export type CreateRevisiPayload = {
  tanggal: string
  employeeId: string
  employeeName: string
  jenisRevisi: string
  jenisRevisiLainnya?: string
  keterangan: string
}

export type PageKey =
  | "dashboard"
  | "pengaturan"
  | "revisi"
  | "shift"
  | "shift-cabang"
  | "history"
  | "manajemen-akun"
  | "buat-jadwal"
  | "jadwal-libur"

type AppContextValue = {
  page: PageKey
  setPage: (p: PageKey) => void

  revisi: Revisi[]
  loadingRevisi: boolean

  refreshRevisi: () => Promise<void>
  advanceRevisi: (id: string) => Promise<void>

  advanceAllRevisi: (
    storeId: string,
    to: "PROSES" | "SELESAI",
  ) => Promise<number>
  isBatchProcessing: boolean

  createRevisi: (
    payload: CreateRevisiPayload,
  ) => Promise<void>

  isCreatingRevisi: boolean

  pendingRevisiCount: number

  sidebarCollapsed: boolean
  toggleSidebar: () => void
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

const PAGE_STORAGE_KEY =
  "shift-management-hub-page"

const VALID_PAGE_KEYS: PageKey[] = [
  "dashboard",
  "pengaturan",
  "revisi",
  "shift",
  "shift-cabang",
  "history",
  "manajemen-akun",
  "buat-jadwal",
  "jadwal-libur",
]

function getSavedPage(): PageKey {
  if (
    typeof window === "undefined"
  ) {
    return "dashboard"
  }

  const savedPage =
    window.localStorage.getItem(
      PAGE_STORAGE_KEY,
    )

  if (
    savedPage &&
    VALID_PAGE_KEYS.includes(
      savedPage as PageKey,
    )
  ) {
    return savedPage as PageKey
  }

  return "dashboard"
}

export function AppProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const {
    profile,
    loading: authLoading,
    user,
  } = useAuth()

  // ============================================================
  // HALAMAN AKTIF
  // ============================================================
  //
  // Halaman terakhir disimpan di localStorage.
  // Dengan demikian ketika browser di-refresh,
  // aplikasi tetap membuka halaman terakhir.
  //
  // ============================================================

  const [page, setPageState] =
    React.useState<PageKey>(
      getSavedPage,
    )

  const setPage =
    React.useCallback(
      (nextPage: PageKey) => {
        setPageState(nextPage)

        if (
          typeof window !== "undefined"
        ) {
          window.localStorage.setItem(
            PAGE_STORAGE_KEY,
            nextPage,
          )
        }
      },
      [],
    )

  // ============================================================
  // STATE REVISI
  // ============================================================

  const [revisi, setRevisi] =
    React.useState<Revisi[]>([])

  const [loadingRevisi, setLoadingRevisi] =
    React.useState(true)

  const [isCreatingRevisi, setIsCreatingRevisi] =
    React.useState(false)

  const [isBatchProcessing, setIsBatchProcessing] =
    React.useState(false)

  // ============================================================
  // SIDEBAR
  // ============================================================

  const [sidebarCollapsed, setSidebarCollapsed] =
    React.useState(false)

  const toggleSidebar =
    React.useCallback(
      () =>
        setSidebarCollapsed(
          (current) => !current,
        ),
      [],
    )

  // ============================================================
  // LOAD REVISI
  // ============================================================

  const refreshRevisi =
    React.useCallback(async () => {
      if (authLoading) {
        return
      }

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
          snapshot =
            await getDocs(
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

  // ============================================================
  // ADVANCE REVISI
  // ============================================================

  const advanceRevisi =
    React.useCallback(
      async (id: string) => {
        const current =
          revisi.find(
            (r) => r.id === id,
          )

        if (!current) {
          return
        }

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

        if (!user) {
          throw new Error(
            "Anda harus login terlebih dahulu.",
          )
        }

        try {
          const idToken =
            await user.getIdToken()

          const response =
            await fetch(
              "/api/revisi",
              {
                method: "PATCH",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  id,
                  status:
                    nextStatus,
                }),
              },
            )

          const result =
            (await response.json()) as {
              success?: boolean
              message?: string
            }

          if (
            !response.ok ||
            !result?.success
          ) {
            throw new Error(
              result?.message ??
              "Gagal memperbarui revisi.",
            )
          }

          setRevisi(
            (prev) =>
              prev.map(
                (item) =>
                  item.id === id
                    ? {
                      ...item,
                      status:
                        nextStatus,
                    }
                    : item,
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
      [revisi, user],
    )

  // ============================================================
  // CREATE REVISI
  // ============================================================

  const createRevisi =
    React.useCallback(
      async (
        payload: CreateRevisiPayload,
      ) => {
        if (!user) {
          throw new Error(
            "Anda harus login terlebih dahulu.",
          )
        }

        setIsCreatingRevisi(true)

        try {
          const idToken =
            await user.getIdToken()

          const response =
            await fetch(
              "/api/revisi",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify(
                  payload,
                ),
              },
            )

          const result =
            (await response.json()) as {
              success?: boolean
              message?: string
            }

          if (
            !response.ok ||
            !result?.success
          ) {
            throw new Error(
              result?.message ??
              "Pengajuan revisi gagal.",
            )
          }

          await refreshRevisi()
        } catch (error) {
          console.error(
            "Gagal membuat revisi:",
            error,
          )

          throw error
        } finally {
          setIsCreatingRevisi(false)
        }
      },
      [user, refreshRevisi],
    )

  // ============================================================
  // ADVANCE ALL REVISI
  // ============================================================

  const advanceAllRevisi =
    React.useCallback(
      async (
        storeId: string,
        to: "PROSES" | "SELESAI",
      ) => {
        if (!user) {
          throw new Error(
            "Anda harus login terlebih dahulu.",
          )
        }

        setIsBatchProcessing(true)

        try {
          const idToken =
            await user.getIdToken()

          const response =
            await fetch(
              "/api/revisi/batch",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                  to,
                  storeId,
                }),
              },
            )

          const result =
            (await response.json()) as {
              success?: boolean
              message?: string
              processed?: number
            }

          if (
            !response.ok ||
            !result?.success
          ) {
            throw new Error(
              result?.message ??
              "Aksi massal gagal.",
            )
          }

          await refreshRevisi()

          return (
            result?.processed ?? 0
          )
        } catch (error) {
          console.error(
            "Gagal memproses revisi massal:",
            error,
          )

          throw error
        } finally {
          setIsBatchProcessing(false)
        }
      },
      [user, refreshRevisi],
    )

  // ============================================================
  // PENDING REVISI
  // ============================================================

  const pendingRevisiCount =
    React.useMemo(
      () =>
        revisi.filter(
          (item) =>
            item.status !==
            "SELESAI",
        ).length,
      [revisi],
    )

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: AppContextValue = {
    page,
    setPage,

    revisi,
    loadingRevisi,

    refreshRevisi,
    advanceRevisi,

    advanceAllRevisi,
    isBatchProcessing,

    createRevisi,
    isCreatingRevisi,

    pendingRevisiCount,

    sidebarCollapsed,
    toggleSidebar,
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