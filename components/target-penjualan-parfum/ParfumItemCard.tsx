"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatMl } from "@/lib/parfum-target"

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

export function ParfumItemCard({
  item,
  isStore,
  onDelete,
}: {
  item: ItemRecap
  isStore?: boolean
  onDelete?: (itemId: string, namaItem: string, periode: string) => void
}) {
  const isOver100 = item.progress >= 100

  return (
    <Card className="overflow-hidden border border-blue-500/40 shadow-[0_0_12px_-2px_rgba(59,130,248,0.35)] transition-all duration-200 hover:border-blue-500/70 hover:shadow-[0_0_16px_-4px_rgba(59,130,248,0.55)] shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-semibold">
            {item.namaItem}
          </CardTitle>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="outline" className="text-xs px-2 py-1">
              ML
            </Badge>
            <Badge variant="outline" className="text-xs px-2 py-1">
              Target: {formatMl(item.targetTotal)}
            </Badge>
          </div>
        </div>
        {isStore && onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="icon-xs"
            onClick={() => onDelete(item.itemId, item.namaItem, "")}
            aria-label="Hapus target"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-3">
        <div className="space-y-2">
          {/* Total Realisasi */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Realisasi</span>
            <span className="font-medium tabular-nums">
              {formatMl(item.totalRealisasi)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Pencapaian</span>
              <span className="font-semibold">
                {item.progress}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/70">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: Math.min(item.progress, 100) + "%" }}
              />
            </div>
            {item.progress > 100 && (
              <span className="text-xs text-primary font-medium">Melebihi 100%</span>
            )}
          </div>

          {/* Karyawan table */}
          {item.karyawan.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                Rincian per Karyawan
              </p>
              <div className="overflow-x-auto border-b border-border pb-1">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-muted-foreground font-normal">Karyawan</th>
                      <th className="px-2 py-1 text-muted-foreground font-normal text-right">Target</th>
                      <th className="px-2 py-1 text-muted-foreground font-normal text-right">Realisasi</th>
                      <th className="px-2 py-1 text-muted-foreground font-normal text-right">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.karyawan.map((k) => (
                      <tr key={k.employeeId} className="border-t border-border/50">
                        <td className="px-2 py-1.5">
                          {k.employeeName}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatMl(k.targetIndividual)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatMl(k.realisasi)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <span className={cn("font-semibold", k.progress >= 100 ? "text-primary" : "text-muted-foreground")}>
                            {k.progress}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
