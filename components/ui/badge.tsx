import * as React from "react"
import { cn } from "@/lib/utils"
import type { ShiftStatus, RevisiStatus } from "@/lib/data"
import { STATUS_LABEL } from "@/lib/data"

const statusClasses: Record<ShiftStatus, string> = {
  shift_pagi: "bg-status-pagi-bg text-status-pagi",
  shift_siang: "bg-status-siang-bg text-status-siang",
  libur: "bg-status-libur-bg text-status-libur",
  cuti: "bg-status-cuti-bg text-status-cuti",
  izin: "bg-status-izin-bg text-status-izin",
  sakit: "bg-status-sakit-bg text-status-sakit",
}

const statusDot: Record<ShiftStatus, string> = {
  shift_pagi: "bg-status-pagi",
  shift_siang: "bg-status-siang",
  libur: "bg-status-libur",
  cuti: "bg-status-cuti",
  izin: "bg-status-izin",
  sakit: "bg-status-sakit",
}

export function StatusBadge({
  status,
  withDot = true,
  className,
}: {
  status: ShiftStatus
  withDot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
        statusClasses[status],
        className,
      )}
    >
      {withDot && (
        <span className={cn("size-1.5 rounded-full", statusDot[status])} />
      )}
      {STATUS_LABEL[status]}
    </span>
  )
}

export function StatusDot({ status }: { status: ShiftStatus }) {
  return <span className={cn("size-2.5 rounded-full", statusDot[status])} />
}

const revisiClasses: Record<RevisiStatus, string> = {
  BARU: "bg-status-siang-bg text-status-siang ring-1 ring-inset ring-status-siang/25",
  PROSES: "bg-status-pagi-bg text-status-pagi ring-1 ring-inset ring-status-pagi/25",
  SELESAI: "bg-status-cuti-bg text-status-cuti ring-1 ring-inset ring-status-cuti/25",
}

export function RevisiStatusBadge({
  status,
  className,
}: {
  status: RevisiStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide",
        revisiClasses[status],
        className,
      )}
    >
      {status}
    </span>
  )
}

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "outline" | "muted" | "success" | "danger"
}) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    outline: "border border-border text-foreground",
    muted: "bg-muted text-muted-foreground",
    success: "bg-status-cuti-bg text-status-cuti",
    danger: "bg-status-sakit-bg text-status-sakit",
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
