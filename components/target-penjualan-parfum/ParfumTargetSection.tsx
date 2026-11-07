"use client"

import * as React from "react"
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  Clock,
  History,
  Plus,
  Store,
  Target,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { EmptyState, LoadingState } from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"

import { ParfumCreateTargetModal } from "./ParfumCreateTargetModal"
import { ParfumRealizationModal } from "./ParfumRealizationModal"
import { ParfumHistoryModal } from "./ParfumHistoryModal"
import { ParfumItemCard } from "./ParfumItemCard"
import type { ParfumTarget, ParfumRealisasi, ParfumAllocation } from "@/lib/parfum-types"
import { formatMl } from "@/lib/parfum-target"

const CURRENT_PERIODE = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export function ParfumTargetSection() {
  const { profile, user } = useAuth()
  const { showToast } = useToast()

  const role = (profile?.role ?? "").trim().toLowerCase()
  const isStore = role === "store"
  const isCentral = role === "central_pusat" || role === "central_cabang"

  const [periode, setPeriode] = React.useState(CURRENT_PERIODE())
  const [storeId, setStoreId] = React.useState(isStore ? (profile?.storeId ?? "") : "")
  const [centralStoreOptions, setCentralStoreOptions] = React.useState<{ storeId: string; namaStore: string }[]>([])
  const [centralStoresLoading, setCentralStoresLoading] = React.useState(false)

  const [targets, setTargets] = React.useState<ParfumTarget[]>([])
  const [allocations, setAllocations] = React.useState<ParfumAllocation[]>([])
  const [realisasiList, setRealisasiList] = React.useState<ParfumRealisasi[]>([])

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const [refreshKey, setRefreshKey] = React.useState(0)

  const [createTargetOpen, setCreateTargetOpen] = React.useState(false)
  const [realizationOpen, setRealizationOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<{ itemId: string; namaItem: string; periode: string } | null>(null)

  // ----------------------------------------------------------
  // MUAT DATA
  // ----------------------------------------------------------

  let cancelled = false

  React.useEffect(() => {
    if (!storeId) {
      setLoading(false)
      return
    }

    cancelled = false
    setLoading(true)
    setError("")

    const base = `/api/parfum-target`

    async function loadAll() {
      try {
        const idToken = await user?.getIdToken()

        const [tRes, aRes, rRes] = await Promise.all([
          fetch(`${base}/target?periode=${encodeURIComponent(periode)}&storeId=${encodeURIComponent(storeId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          }),
          fetch(`${base}/allocation?periode=${encodeURIComponent(periode)}&storeId=${encodeURIComponent(storeId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          }),
          fetch(`${base}/realisasi?periode=${encodeURIComponent(periode)}&storeId=${encodeURIComponent(storeId)}`, {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          }),
        ])

        if (cancelled) return

        const tJson = (await tRes.json()) as { success?: boolean; targets?: ParfumTarget[] }
        const aJson = (await aRes.json()) as { success?: boolean; allocations?: ParfumAllocation[] }
        const rJson = (await rRes.json()) as { success?: boolean; realisasi?: ParfumRealisasi[] }

        if (!cancelled) {
          setTargets(tJson.success ? (tJson.targets ?? []) : [])
          setAllocations(aJson.success ? (aJson.allocations ?? []) : [])
          setRealisasiList(rJson.success ? (rJson.realisasi ?? []) : [])
          setLoading(false)
          setError("")
        }
      } catch (err) {
        if (!cancelled) {
          setError("Gagal memuat data target parfum.")
          setLoading(false)
          console.error(err)
        }
      }
    }

    loadAll()

    return () => {
      cancelled = true
    }
  }, [periode, storeId, user, refreshKey])

  // ----------------------------------------------------------
  // MUAT DAFTAR TOKO UNTUK CENTRAL
  // ----------------------------------------------------------

  React.useEffect(() => {
    if (!isCentral) return

    let cancelled = false
    setCentralStoresLoading(true)

    async function loadStores() {
      try {
        const idToken = await user?.getIdToken()
        const res = await fetch("/api/admin/stores", {
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        })

        if (cancelled) return

        const json = (await res.json()) as { success?: boolean; stores?: { storeId: string; namaStore: string; cabangId: string | null }[] }

        if (!cancelled && json.success && json.stores) {
          setCentralStoreOptions(
            json.stores
              .map((s) => ({
                storeId: s.storeId,
                namaStore: s.namaStore || s.storeId,
              }))
              .sort((a, b) => a.namaStore.localeCompare(b.namaStore, "id", { sensitivity: "base" })),
          )
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setCentralStoresLoading(false)
      }
    }

    loadStores()
    return () => { cancelled = true }
  }, [isCentral, user])

  // ----------------------------------------------------------
  // HITUNG REKAP PER ITEM
  // ----------------------------------------------------------

  type ItemRecap = {
    itemId: string
    namaItem: string
    satuan: "ML"
    targetTotal: number
    totalRealisasi: number
    progress: number
    karyawan: {
      employeeId: string
      employeeName: string
      targetIndividual: number
      realisasi: number
      progress: number
    }[]
  }

  const itemRecaps = React.useMemo((): ItemRecap[] => {
    const byItem = new Map<string, ItemRecap>()

    for (const t of targets) {
      if (!t.itemId) continue
      byItem.set(t.itemId, {
        itemId: t.itemId,
        namaItem: t.namaItem,
        satuan: "ML" as const,
        targetTotal: typeof t.targetTotal === "number" ? t.targetTotal : 0,
        totalRealisasi: 0,
        progress: 0,
        karyawan: [],
      })
    }

    // Hitung total realisasi per item dari realisasiList langsung
    // (tidak hanya melalui allocations) agar data tetap muncul
    // meskipun allocation query kosong.
    const realisasiByItem = new Map<string, number>()
    const realisasiByItemEmp = new Map<string, number>()
    for (const r of realisasiList) {
      if (!r.itemId || !r.employeeId) continue
      const jumlah = typeof r.jumlah === "number" ? r.jumlah : 0
      realisasiByItem.set(
        r.itemId,
        (realisasiByItem.get(r.itemId) ?? 0) + jumlah,
      )
      realisasiByItemEmp.set(
        `${r.itemId}|${r.employeeId}`,
        (realisasiByItemEmp.get(`${r.itemId}|${r.employeeId}`) ?? 0) + jumlah,
      )
    }

    // Terapkan total realisasi ke setiap item
    for (const item of byItem.values()) {
      item.totalRealisasi = realisasiByItem.get(item.itemId) ?? 0
    }

    // Tambahkan karyawan dari allocations, dengan realisasi yang sudah dihitung
    for (const a of allocations) {
      if (!a.itemId) continue
      const item = byItem.get(a.itemId)
      if (!item) continue

      const targetInd = typeof a.targetIndividual === "number" ? a.targetIndividual : 0
      const realisasi = realisasiByItemEmp.get(`${a.itemId}|${a.employeeId}`) ?? 0
      const progress = targetInd > 0 ? Math.round((realisasi / targetInd) * 100) : 0

      item.karyawan.push({
        employeeId: a.employeeId,
        employeeName: a.employeeName,
        targetIndividual: targetInd,
        realisasi,
        progress,
      })
    }

    // Jika ada karyawan yang punya realisasi tapi tidak ada allocation,
    // tambahkan sebagai karyawan tambahan (edge case).
    for (const r of realisasiList) {
      if (!r.itemId || !r.employeeId) continue
      const item = byItem.get(r.itemId)
      if (!item) continue
      const alreadyInAlloc = item.karyawan.some((k) => k.employeeId === r.employeeId)
      if (alreadyInAlloc) continue

      const jumlah = typeof r.jumlah === "number" ? r.jumlah : 0
      item.karyawan.push({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        targetIndividual: 0,
        realisasi: jumlah,
        progress: 0,
      })
    }

    for (const item of byItem.values()) {
      item.karyawan.sort((a, b) => a.employeeName.localeCompare(b.employeeName, "id", { sensitivity: "base" }))
    }

    for (const item of byItem.values()) {
      item.progress = item.targetTotal > 0 ? Math.round((item.totalRealisasi / item.targetTotal) * 100) : 0
    }

    return Array.from(byItem.values()).sort((a, b) => a.namaItem.localeCompare(b.namaItem, "id", { sensitivity: "base" }))
  }, [targets, allocations, realisasiList])

  const totalTarget = itemRecaps.reduce((sum, i) => sum + i.targetTotal, 0)
  const totalRealisasi = itemRecaps.reduce((sum, i) => sum + i.totalRealisasi, 0)
  const totalProgress = totalTarget > 0 ? Math.round((totalRealisasi / totalTarget) * 100) : 0

  // ----------------------------------------------------------
  // HANDLER
  // ----------------------------------------------------------

  function handleCreateTarget() {
    setCreateTargetOpen(true)
  }

  function handleInputRealisasi() {
    setRealizationOpen(true)
  }

  function handleHistory() {
    setHistoryOpen(true)
  }

  async function handleDeleteTarget(itemId: string, namaItem: string) {
    if (!user || !storeId) return

    setDeleteTarget({ itemId, namaItem, periode })
    setDeleteOpen(true)
  }

  async function handleConfirmDelete() {
    if (!user || !storeId || !deleteTarget) return

    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/parfum-target/target", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          periode,
          itemId: deleteTarget.itemId,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json?.message ?? "Gagal menghapus target.")
      }

      setDeleteOpen(false)
      setDeleteTarget(null)
      showToast("success", "Target dihapus", json.message ?? "Target parfum berhasil dihapus.")
      setRefreshKey((prev) => prev + 1)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menghapus target."
      showToast("error", "Gagal menghapus", message)
    }
  }

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Target Penjualan Parfum</h1>
        </div>
        <LoadingState label="Memuat data target parfum..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-5 text-destructive" />
          <h1 className="text-xl font-semibold tracking-tight">Target Penjualan Parfum</h1>
        </div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }

  if (!storeId) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Target className="size-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Target Penjualan Parfum</h1>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {isCentral ? "Silakan pilih toko untuk melihat target parfum." : "Tidak ada data toko untuk akun Anda."}
          </p>
          {isCentral && (
                <div className="mt-4 flex flex-col items-center justify-center gap-4">
                  {centralStoresLoading ? (
                    <LoadingState label="Memuat daftar toko..." />
                  ) : (
                    <div className="w-full max-w-7xl">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {centralStoreOptions.map((s) => (
                          <div
                            key={s.storeId}
                            role="button"
                            tabIndex={0}
                            onClick={() => setStoreId(s.storeId)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setStoreId(s.storeId)
                              }
                            }}
                            className="w-full min-h-[112px] rounded-xl border border-red-500/50 bg-red-50 p-3 text-left hover:border-red-500/50 hover:bg-red-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-red-500/30 dark:bg-red-900/20 dark:hover:border-red-500/50 dark:hover:bg-red-900/30"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/50 bg-red-100 dark:border-red-500/30 dark:bg-red-900/50">
                                  <Store className="size-4 text-red-600 dark:text-red-400" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-semibold text-foreground dark:text-white">
                                    {s.namaStore}
                                  </h3>
                                  <p className="text-xs text-muted-foreground dark:text-red-300">
                                    {s.storeId}
                                  </p>
                                </div>
                              </div>
                              <ArrowRight className="size-3 text-red-500 dark:text-red-500/50" />
                            </div>
                            <div className="mt-4 border-t border-red-500/40 pt-2 flex justify-end dark:border-red-500/20">
                              <span className="text-xs text-red-600 dark:text-red-300">
                                Lihat Dashboard Toko
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Garis pemisah antara program existing dan Target Penjualan Parfum */}
      <div className="relative my-6">
        <div className="border-t border-blue-500/40 shadow-[0_0_8px_-1px_rgba(59,130,248,0.35)]" />
      </div>

      {/* HEADER */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                <Target className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Target Penjualan Parfum</h1>
                <p className="text-xs text-muted-foreground">
                  Multi-Item · Periode {periode}
                </p>
              </div>
            </div>
            {isCentral && storeId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStoreId("")}
                className="ring-1 ring-inset ring-red-500/20 shadow-[0_0_16px_-6px] shadow-red-500/30 hover:ring-red-500/50 hover:shadow-red-500/50"
              >
                <ChevronLeft className="size-4 mr-1" /> Kembali ke Daftar Toko
              </Button>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {isStore && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateTarget}
                  className="ring-1 ring-inset ring-primary/20 shadow-[0_0_16px_-6px] shadow-primary/30 hover:ring-primary/50 hover:shadow-primary/50"
                >
                  <Plus className="size-4" /> Buat Target
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleInputRealisasi}
                  className="ring-1 ring-inset ring-primary/20 shadow-[0_0_16px_-6px] shadow-primary/30 hover:ring-primary/50 hover:shadow-primary/50"
                >
                  <Clock className="size-4" /> Input Realisasi
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleHistory}
                  className="ring-1 ring-inset ring-primary/20 shadow-[0_0_16px_-6px] shadow-primary/30 hover:ring-primary/50 hover:shadow-primary/50"
                >
                  <History className="size-4" /> History
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* STATS */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="bg-card rounded-xl border border-red-500/40 p-3 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)] transition-all duration-200 hover:border-red-500/70 hover:shadow-[0_0_16px_-4px_rgba(239,68,68,0.55)]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Item Aktif</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{itemRecaps.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-red-500/40 p-3 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)] transition-all duration-200 hover:border-red-500/70 hover:shadow-[0_0_16px_-4px_rgba(239,68,68,0.55)]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Target</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMl(totalTarget)}</p>
        </div>
        <div className="bg-card rounded-xl border border-red-500/40 p-3 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)] transition-all duration-200 hover:border-red-500/70 hover:shadow-[0_0_16px_-4px_rgba(239,68,68,0.55)]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Total Realisasi</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatMl(totalRealisasi)}</p>
        </div>
        <div className="bg-card rounded-xl border border-red-500/40 p-3 shadow-[0_0_12px_-2px_rgba(239,68,68,0.35)] transition-all duration-200 hover:border-red-500/70 hover:shadow-[0_0_16px_-4px_rgba(239,68,68,0.55)]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Progress</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{totalProgress}%</p>
        </div>
      </div>

      {/* ITEM CARDS */}
      <div className="space-y-3">
        {itemRecaps.length === 0 ? (
          <EmptyState
            title="Belum ada target parfum"
            description="Klik tombol Buat Target untuk membuat target item baru."
            icon={Target}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {itemRecaps.map((item) => (
              <ParfumItemCard
                key={item.itemId}
                item={item}
                isStore={isStore}
                onDelete={handleDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      <ParfumCreateTargetModal
        open={createTargetOpen}
        onClose={() => setCreateTargetOpen(false)}
        periode={periode}
        storeId={storeId}
        onSuccess={() => {
          setCreateTargetOpen(false)
          setError("")
          setRefreshKey((prev) => prev + 1)
        }}
      />

      <ParfumRealizationModal
        open={realizationOpen}
        onClose={() => setRealizationOpen(false)}
        periode={periode}
        storeId={storeId}
        items={itemRecaps}
        onSuccess={() => {
          setRealizationOpen(false)
          setError("")
          setRefreshKey((prev) => prev + 1)
        }}
      />

      <ParfumHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        periode={periode}
        storeId={storeId}
        realisasiList={realisasiList}
        onDelete={() => setRefreshKey((prev) => prev + 1)}
      />

      {/* Dialog Konfirmasi Hapus Target */}
      {deleteOpen && deleteTarget && (
        <Modal
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          title="Hapus Target Parfum?"
          description={`Produk: ${deleteTarget.namaItem}\nPeriode: ${periode}\nItem akan dikeluarkan dari konfigurasi aktif. Histori target dan realisasi lama tetap tersimpan.`}
        >
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Hapus Target
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
