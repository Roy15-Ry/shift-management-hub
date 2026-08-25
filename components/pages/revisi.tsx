"use client"

import * as React from "react"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  ClipboardCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { RevisiStatusBadge, StatusBadge } from "@/components/ui/badge"
import { EmptyState } from "@/components/controls"
import { useApp } from "@/components/app-context"
import { getStore, stores } from "@/lib/data"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"

function StoreList({ onSelect }: { onSelect: (id: string) => void }) {
  const { revisi } = useApp()
  const { profile } = useAuth()

  const accessibleStores =
    profile?.role === "store" && profile.storeId
      ? stores.filter(
          (s) =>
            s.id === profile.storeId ||
            s.kode === profile.storeId,
        )
      : stores

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Revisi Absensi</h2>
        <p className="text-sm text-muted-foreground">
          Pantau pekerjaan revisi absensi di setiap toko. Pilih toko untuk
          memproses pengajuan.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
       {accessibleStores.map((s) => {
          const items = revisi.filter((r) => r.storeId === s.id)
          const pending = items.filter((r) => r.status !== "SELESAI").length
          const hasAny = pending > 0

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "group flex items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md",
                hasAny ? "border-status-pagi/30" : "border-border",
              )}
            >
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-lg",
                  hasAny
                    ? "bg-status-pagi-bg text-status-pagi"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {hasAny ? (
                  <ClipboardCheck className="size-5" />
                ) : (
                  <CheckCircle2 className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{s.name}</p>
                {hasAny ? (
                  <p className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {pending} pengajuan
                    </span>
                    <RevisiStatusBadge status="PROSES" />
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tidak ada pengajuan
                  </p>
                )}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RevisiDetail({
  storeId,
  onBack,
}: {
  storeId: string
  onBack: () => void
}) {
  const { revisi, advanceRevisi } = useApp()
  const store = getStore(storeId)
  const items = revisi.filter((r) => r.storeId === storeId)
  const pending = items.filter((r) => r.status !== "SELESAI")

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Kembali ke daftar toko
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Revisi Absensi &middot; {store?.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pending.length > 0
              ? `${pending.length} pengajuan perlu diproses`
              : "Seluruh pengajuan telah selesai"}
          </p>
        </div>
      </div>

      {items.length === 0 || pending.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Tidak ada pengajuan"
          description={
            items.length === 0
              ? "Toko ini belum memiliki pengajuan revisi absensi."
              : "Semua revisi absensi toko ini sudah berstatus SELESAI."
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-xl border bg-card p-4 shadow-sm transition-opacity",
                r.status === "SELESAI"
                  ? "border-border opacity-60"
                  : "border-border",
              )}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="flex items-center gap-3 lg:w-56">
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {r.employeeName.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{r.employeeName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {r.id}
                    </p>
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Tanggal</p>
                    <p className="mt-0.5 text-sm font-medium">{r.tanggal}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Perubahan</p>
                    <p className="mt-1 flex items-center gap-1.5">
                      <StatusBadge status={r.shiftSebelumnya} withDot={false} />
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <StatusBadge status={r.statusBaru} withDot={false} />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Keterangan</p>
                    <p className="mt-0.5 text-sm">{r.keterangan}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pengajuan</p>
                    <p className="mt-0.5 text-sm">{r.tanggalPengajuan}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border pt-3 lg:w-52 lg:justify-end lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <RevisiStatusBadge status={r.status} />
                  {r.status === "BARU" && (
                    <Button size="sm" onClick={() => advanceRevisi(r.id)}>
                      <CircleDashed />
                      Proses
                    </Button>
                  )}
                  {r.status === "PROSES" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => advanceRevisi(r.id)}
                    >
                      <CheckCircle2 />
                      Selesai
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RevisiPage() {
  const [selected, setSelected] = React.useState<string | null>(null)
  const { profile } = useAuth()

  React.useEffect(() => {
    if (
      profile?.role === "store" &&
      profile.storeId
    ) {
      const store = stores.find(
        (s) =>
          s.id === profile.storeId ||
          s.kode === profile.storeId,
      )

      if (store) {
        setSelected(store.id)
      }
    }
  }, [profile])

  if (selected) {
    return (
      <RevisiDetail
        storeId={selected}
        onBack={() => {
          if (profile?.role !== "store") {
            setSelected(null)
          }
        }}
      />
    )
  }

  return <StoreList onSelect={setSelected} />
}