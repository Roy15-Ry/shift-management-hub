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

  logoutModalOpen: boolean
  closeLogoutModal: () => void

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

/*
 * ============================================================
 * BROWSER HISTORY — MODAL-ENTRY DESIGN
 * ============================================================
 *
 * Aplikasi ini SPA berbasis state (React useState), bukan route.
 * Browser Back / Device Back ditangani dengan:
 *
 *   1. BOUNDARY — entry penanda "batas aplikasi".
 *      Diletakkan tepat di bawah Dashboard Sentinel.
 *      Back ke boundary → BUKAN langsung keluar, melainkan
 *      membuat MODAL ENTRY di atasnya.
 *
 *   2. DASHBOARD SENTINEL — entry yang menjamin selalu ada
 *      lapisan dashboard antara boundary dan halaman lain.
 *      Tidak pernah dihapus.
 *
 *   3. MODAL ENTRY — history entry nyata { modalVersion }.
 *      Back dari modal → konsumsi entry → kembali ke
 *      dashboard/sentinel. Batal → SATU go(-1) (tanpa pushState
 *      di tick yang sama) → MODAL → DASH.
 *
 *   4. PAGE entries — setiap setPage() = 1 pushState({page}).
 *
 * Stack siempreks:
 *   [EXTERNAL, BOUNDARY, DASH_SENTINEL, ...pages, MODAL?]
 *
 * pushState selalu menghapus forward entries (spesifikasi §6.10.21).
 * Ini digunakan untuk menjaga stack bersih.
 * ============================================================
 */

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

type HistoryState =
  | null
  | { boundary: true; modalVersion: 0 }
  | { page: PageKey }
  | { modalVersion: number; page: PageKey }

function isValidPageKey(
  v: unknown,
): v is PageKey {
  return (
    typeof v === "string" &&
    VALID_PAGE_KEYS.includes(v as PageKey)
  )
}

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

  if (isValidPageKey(savedPage)) {
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

  const [logoutModalOpen, setLogoutModalOpen] =
    React.useState(false)

  const modalOpenRef =
    React.useRef(false)
  const modalVersionRef =
    React.useRef(0)
  const mountedRef =
    React.useRef(false)

  // ============================================================
  // COMMIT PAGE — memperbarui state + localStorage TANPA history
  // ============================================================
  const commitPage =
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
  // SETUP BOUNDARY — satu kali, saat AppProvider mount
  // ============================================================
  //
  // Mount stack:
  //   [external..., BOUNDARY, DASH_SENTINEL]
  //   atau
  //   [external..., BOUNDARY, DASH_SENTINEL, SAVED_PAGE]
  //
  // DASH_SENTINEL selalu tepat di atas BOUNDARY.
  // Jika saved != dashboard, saved di atas sentinel.
  // ============================================================
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (mountedRef.current) {
      return
    }
    mountedRef.current = true

    const saved = getSavedPage()

    window.history.replaceState(
      { boundary: true, modalVersion: 0 },
      "",
      "/",
    )
    window.history.pushState(
      { page: "dashboard" },
      "",
      "/",
    )

    if (saved !== "dashboard") {
      window.history.pushState(
        { page: saved },
        "",
        "/",
      )
    }
  }, [])

  // ============================================================
  // POPSTATE — SATU listener untuk Back / Forward
  // ============================================================
  //
  // Empat branch:
  //   A. boundary → buat modal entry + buka modal
  //   B. modal entry (modalVersion) → tutup modal
  //   C. page valid → navigate internal, tutup modal
  //   D. fallback (external/null) → pushState dashboard
  // ============================================================
  React.useEffect(() => {
    function onPopState(
      event: PopStateEvent,
    ) {
      const state =
        event.state as HistoryState

      // ──────────────────────────────────────
      // Branch A: boundary + fresh → buka modal
      // (check SEBELUM modal/page, karena boundary
      //  state juga memiliki "modalVersion")
      // ──────────────────────────────────────
      if (
        state &&
        typeof state === "object" &&
        "boundary" in state &&
        state.boundary === true
      ) {
        if (modalOpenRef.current) {
          return
        }

        modalOpenRef.current = true
        setLogoutModalOpen(true)

        // BOUNDARY → DASH → MODAL (urutan wajib).
        // pushState pertama menaruh DASH tepat di atas BOUNDARY,
        // pushState kedua menaruh MODAL tepat di atas DASH.
        // Dengan begitu MODAL selalu memiliki Dashboard di bawahnya
        // sehingga Back dari MODAL tidak pernah menembus EXTERNAL.
        window.history.pushState(
          { page: "dashboard" },
          "",
          "/",
        )
        window.history.pushState(
          {
            modalVersion:
              modalVersionRef.current,
            page: page,
          },
          "",
          "/",
        )
        return
      }

      // ──────────────────────────────────────
      // Branch B: modal entry → tutup modal
      // ──────────────────────────────────────
      if (
        state &&
        typeof state === "object" &&
        "modalVersion" in state &&
        typeof state.modalVersion === "number"
      ) {
        const entryVersion =
          state.modalVersion

        if (
          entryVersion !==
          modalVersionRef.current
        ) {
          return
        }

        if (modalOpenRef.current) {
          modalOpenRef.current = false
          setLogoutModalOpen(false)
        }

        if (
          "page" in state &&
          isValidPageKey(state.page)
        ) {
          commitPage(state.page)
        }
        return
      }

      // ──────────────────────────────────────
      // Branch C: page valid → internal nav
      // ──────────────────────────────────────
      if (
        state &&
        typeof state === "object" &&
        "page" in state &&
        isValidPageKey(state.page)
      ) {
        if (modalOpenRef.current) {
          modalOpenRef.current = false
          setLogoutModalOpen(false)
        }
        commitPage(state.page)
        return
      }

      // ──────────────────────────────────────
      // Branch D: fallback → push dashboard
      // ──────────────────────────────────────
      modalOpenRef.current = false
      setLogoutModalOpen(false)
      window.history.pushState(
        { page: "dashboard" },
        "",
        "/",
      )
      commitPage("dashboard")
    }

    window.addEventListener(
      "popstate",
      onPopState,
    )

    return () => {
      window.removeEventListener(
        "popstate",
        onPopState,
      )
    }
  }, [commitPage, page])

  // ============================================================
  // CLOSE MODAL — aksi Batal
  // ============================================================
  //
  // Desain final (deterministik): gunakan SATU history.go(-1)
  // saja, TANPA pushState di tick yang sama.
  //
  // Stack saat modal terbuka: [BOUNDARY, DASH, MODAL], current=MODAL.
  // go(-1) → MODAL → DASH. popstate memicu Branch C → tutup modal.
  // Hasil: current = DASH, dengan BOUNDARY tepat di bawahnya.
  // Back berikutnya dari DASH → BOUNDARY → Branch A → modal lagi.
  //
  // modalVersionRef++ meng-invalidate entry modal bekas di forward,
  // sehingga Forward (Branch B/Branch K) tidak menghidupkan modal.
  // ============================================================
  const closeLogoutModal =
    React.useCallback(() => {
      modalVersionRef.current += 1
      modalOpenRef.current = false
      setLogoutModalOpen(false)

      commitPage("dashboard")

      window.history.go(-1)
    }, [commitPage])

  // ============================================================
  // SET PAGE — navigasi normal oleh user (1 pushState)
  // ============================================================
  const setPage =
    React.useCallback(
      (nextPage: PageKey) => {
        if (modalOpenRef.current) {
          modalOpenRef.current = false
          setLogoutModalOpen(false)
        }

        commitPage(nextPage)

        window.history.pushState(
          { page: nextPage },
          "",
          "/",
        )
      },
      [commitPage],
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

    logoutModalOpen,
    closeLogoutModal,

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