"use client"

import * as React from "react"
import {
  AlertTriangle,
  Clock,
  History,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { EmptyState, LoadingState } from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"
import type { ParfumRealisasi } from "@/lib/parfum-types"
import { formatMl } from "@/lib/parfum-target"

function formatTanggal(tanggal: string): string {
  const [year, month, day] = tanggal.split("-")
  return `${day}/${month}/${year}`
}

function formatPeriodeLabel(periode: string): string {
  const [year, month] = periode.split("-").map(Number)
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  )
}

export function ParfumHistoryModal({
  open,
  onClose,
  periode,
  storeId,
  realisasiList,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  periode: string
  storeId: string
  realisasiList: ParfumRealisasi[]
  onDelete?: () => void
}) {
  const { user, profile } = useAuth()
  const { showToast } = useToast()

  const role = (profile?.role ?? "").trim().toLowerCase()
  const isStore = role === "store"

  const [refreshKey, setRefreshKey] = React.useState(0)

  const [loading, setLoading] = React.useState(false)

  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)
  const [confirmDeleteData, setConfirmDeleteData] = React.useState<ParfumRealisasi | null>(null)

  // Flat list of realisasi, sorted by tanggal descending, filtered to jumlah > 0
  const flatRealisasi = React.useMemo(() => {
    return [...realisasiList]
      .filter((r) => typeof r.jumlah === "number" && r.jumlah > 0)
      .sort((a, b) => {
        const ta = String(a.tanggal ?? "")
        const tb = String(b.tanggal ?? "")
        if (ta !== tb) return tb.localeCompare(ta)
        const ca = String(a.createdAt ?? "")
        const cb = String(b.createdAt ?? "")
        return cb.localeCompare(ca)
      })
  }, [realisasiList, refreshKey])

  async function handleRefresh() {
    setLoading(true)
    setRefreshKey((prev) => prev + 1)
    setTimeout(() => setLoading(false), 500)
  }

  async function handleDelete(id: string) {
    if (!user || !storeId) return

    setDeletingId(id)

    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/parfum-target/realisasi", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json?.message ?? "Gagal menghapus realisasi.")
      }

      showToast("success", "Realisasi dihapus", json.message ?? "Realisasi berhasil dihapus.")
      setRefreshKey((prev) => prev + 1)
      onDelete?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menghapus realisasi."
      showToast("error", "Gagal menghapus", message)
    } finally {
      setDeletingId(null)
    }
  }

  if (!open) return null

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="History Target Penjualan Parfum"
      description={`Periode ${formatPeriodeLabel(periode)} · Toko ${storeId}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Tutup
          </Button>
        </div>
      }
    >
      <CardContent className="p-0">
        <div className="space-y-4">
          {/* Realisasi Harian */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-foreground">Realisasi Harian</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                disabled={loading}
              >
                {loading ? <LoadingState label="" /> : <RefreshCw className="size-4" />}
              </Button>
            </div>

            {flatRealisasi.length === 0 ? (
              <EmptyState
                title="Belum ada realisasi"
                description="Belum ada data realisasi parfum untuk periode ini."
                icon={Clock}
              />
            ) : (
              <div className="border border-border rounded-lg overflow-x-auto">
                <div className="max-h-[23rem] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="sticky top-0 z-20 border-b border-border/50">
                        <th className="px-3 py-2 text-muted-foreground font-normal w-[96px] bg-background">Tanggal</th>
                        <th className="px-3 py-2 text-muted-foreground font-normal bg-background">Karyawan</th>
                        <th className="px-3 py-2 text-muted-foreground font-normal bg-background">Item</th>
                        <th className="px-3 py-2 text-muted-foreground font-normal text-right w-[80px] bg-background">Nilai</th>
                        {isStore && (
                          <th className="px-3 py-2 text-muted-foreground font-normal text-right w-[56px] bg-background">Aksi</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {flatRealisasi.map((r) => (
                        <tr key={`${r.id}`} className="border-t border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground w-[96px]">
                            {formatTanggal(r.tanggal)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.employeeName}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {r.namaItem}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium w-[80px]">
                            {formatMl(typeof r.jumlah === "number" ? r.jumlah : 0)}
                          </td>
                          {isStore && (
                            <td className="px-3 py-2 text-right w-[56px]">
                              <Button
                                type="button"
                                variant="destructive"
                                size="icon-xs"
                                disabled={deletingId === r.id}
                                onClick={() => {
                                  setConfirmDeleteData(r)
                                  setConfirmDeleteId(r.id)
                                  setConfirmDeleteOpen(true)
                                }}
                                aria-label="Hapus realisasi"
                              >
                                {deletingId === r.id ? (
                                  <LoadingState label="" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Modal>

    {confirmDeleteOpen && confirmDeleteData && (
      <Modal
        open={confirmDeleteOpen}
        onClose={() => {
          setConfirmDeleteOpen(false)
          setConfirmDeleteData(null)
          setConfirmDeleteId(null)
        }}
        title="Konfirmasi Hapus Realisasi"
        description="Apakah Anda yakin ingin menghapus realisasi berikut?"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmDeleteOpen(false)
                setConfirmDeleteData(null)
                setConfirmDeleteId(null)
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingId === confirmDeleteId}
              onClick={() => {
                if (!confirmDeleteId) return
                setConfirmDeleteOpen(false)
                setConfirmDeleteData(null)
                setConfirmDeleteId(null)
                handleDelete(confirmDeleteId)
              }}
            >
              Ya, Hapus
            </Button>
          </div>
        }
      >
        <CardContent className="p-0">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 text-destructive" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">Konfirmasi Hapus Realisasi</h4>
                <p className="text-xs text-muted-foreground">
                  Apakah Anda yakin ingin menghapus realisasi berikut?
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="grid gap-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span className="text-foreground">{formatTanggal(confirmDeleteData.tanggal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Karyawan</span>
                  <span className="text-foreground">{confirmDeleteData.employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Item</span>
                  <span className="text-foreground">{confirmDeleteData.namaItem}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Jumlah</span>
                  <span className="text-foreground tabular-nums font-medium">
                    {formatMl(typeof confirmDeleteData.jumlah === "number" ? confirmDeleteData.jumlah : 0)}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/90 p-3">
              <p className="text-xs font-bold text-white">
                Data realisasi yang dihapus tidak dapat dipulihkan.
              </p>
            </div>
          </div>
        </CardContent>
      </Modal>)}
    </>
  )
}
