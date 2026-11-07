"use client"

import * as React from "react"
import {
  Clock,
  Save,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { Field, EmptyState, LoadingState, SelectField, DateField } from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"
import type { ParfumRealisasi } from "@/lib/parfum-types"
import { formatMl } from "@/lib/parfum-target"

type ItemWithAlloc = {
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

const CURRENT_DATE = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

export function ParfumRealizationModal({
  open,
  onClose,
  periode,
  storeId,
  items,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  periode: string
  storeId: string
  items: ItemWithAlloc[]
  onSuccess: () => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [form, setForm] = React.useState({
    tanggal: CURRENT_DATE(),
    itemId: "",
  })
  const [employeeInputs, setEmployeeInputs] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")
  const [selectedItem, setSelectedItem] = React.useState<ItemWithAlloc | null>(null)

  const [itemOptions, setItemOptions] = React.useState<{ itemId: string; namaItem: string }[]>([])

  React.useEffect(() => {
    setItemOptions(
      items.map((i) => ({
        itemId: i.itemId,
        namaItem: i.namaItem,
      })),
    )
  }, [items])

  React.useEffect(() => {
    if (form.itemId) {
      const item = items.find((i) => i.itemId === form.itemId)
      setSelectedItem(item ?? null)
      setEmployeeInputs({})
    } else {
      setSelectedItem(null)
      setEmployeeInputs({})
    }
  }, [form.itemId, items])

  const isItemLoading = items.length === 0

  function handleTanggalChange(v: string) {
    setForm((prev) => ({ ...prev, tanggal: v }))
  }

  function handleItemChange(v: string) {
    setForm((prev) => ({ ...prev, itemId: v }))
    setEmployeeInputs({})
  }

  function handleInputChange(employeeId: string, value: string) {
    setEmployeeInputs((prev) => ({ ...prev, [employeeId]: value }))
  }

  function validateForm(): string | null {
    const { tanggal, itemId } = form

    if (!tanggal || !itemId) {
      return "Tanggal dan Item wajib diisi."
    }

    const tanggalPeriode = tanggal.slice(0, 7)
    if (tanggalPeriode !== periode) {
      return "Input realisasi hanya diperbolehkan pada bulan berjalan."
    }

    if (!selectedItem) {
      return "Item tidak valid."
    }

    for (const k of selectedItem.karyawan) {
      const val = employeeInputs[k.employeeId]
      if (val === undefined || val === null || val === "") continue
      const num = Number(val)
      if (!Number.isFinite(num) || num < 0) {
        return `Jumlah untuk ${k.employeeName} harus berupa angka yang valid.`
      }
      if (num * 100 !== Math.round(num * 100)) {
        return `Jumlah untuk ${k.employeeName} maksimal 2 angka desimal.`
      }
    }

    return null
  }

  function isLengkap(): boolean {
    if (!selectedItem) return false
    if (selectedItem.karyawan.length === 0) return false
    return selectedItem.karyawan.every((k) => {
      const val = employeeInputs[k.employeeId]
      return val !== undefined && val !== null && val.trim() !== ""
    })
  }

  async function handleSave() {
    if (!user || !storeId) return

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      showToast("error", "Validasi gagal", validationError)
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const idToken = await user.getIdToken()

      const entries = selectedItem!.karyawan.map((k) => {
        const val = employeeInputs[k.employeeId]
        if (val === undefined || val === null || val.trim() === "") {
          return { employeeId: k.employeeId, jumlah: null }
        }
        return { employeeId: k.employeeId, jumlah: Math.round(Number(val) * 100) / 100 }
      })

      const res = await fetch("/api/parfum-target/realisasi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          tanggal: form.tanggal,
          itemId: form.itemId,
          satuan: "ML",
          lengkap: isLengkap(),
          entries,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json?.message ?? "Gagal menyimpan realisasi.")
      }

      showToast("success", "Realisasi tersimpan", json.message ?? "Realisasi parfum berhasil disimpan.")
      onSuccess()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan realisasi."
      setError(message)
      showToast("error", "Gagal menyimpan", message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  if (isItemLoading) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Input Realisasi Parfum"
        description="Memuat data item..."
      >
        <CardContent className="p-0">
          <LoadingState label="Memuat data item..." />
        </CardContent>
      </Modal>
    )
  }

  const lengkapStatus =
    selectedItem?.karyawan.length === 0
      ? "Tidak Ada Alokasi"
      : isLengkap()
        ? "Lengkap"
        : "Belum Lengkap"
  const lengkapBadge =
    selectedItem?.karyawan.length === 0
      ? "danger"
      : isLengkap()
        ? "success"
        : "default"

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Input Realisasi Parfum"
      description="Pilih item, lalu isi realisasi untuk setiap karyawan. Kosong = belum diinput, 0 = realisasi nol."
    >
      <CardContent className="p-0">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tanggal Laporan">
              <DateField
                value={form.tanggal}
                onChange={handleTanggalChange}
              />
            </Field>

            <Field label="Item">
              <SelectField
                value={form.itemId}
                onChange={handleItemChange}
                options={[
                  { value: "", label: "Pilih Item" },
                  ...itemOptions.map((i) => ({
                    value: i.itemId,
                    label: i.namaItem,
                  })),
                ]}
              />
            </Field>
          </div>

          {selectedItem && (
            <>
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-medium text-foreground mb-1">
                  Item: {selectedItem.namaItem} (ML)
                </p>
                <p className="text-xs text-muted-foreground">
                  Target total: {formatMl(selectedItem.targetTotal)} &middot;
                  Karyawan: {selectedItem.karyawan.length} &middot;
                  Status:{" "}
                  <Badge variant={lengkapBadge} className="text-[10px] px-2 py-0.5">
                    {lengkapStatus}
                  </Badge>
                </p>
              </div>

              <Field label="Realisasi per Karyawan (ML)">
                <div className="space-y-2">
                  {selectedItem.karyawan.map((k) => (
                    <div
                      key={k.employeeId}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-background"
                    >
                      <span className="flex-1 text-sm">{k.employeeName}</span>
                      <span className="text-xs text-muted-foreground w-16">
                        Target: {formatMl(k.targetIndividual)}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={employeeInputs[k.employeeId] ?? ""}
                        onChange={(e) => handleInputChange(k.employeeId, e.target.value)}
                        placeholder="0.00"
                        className="w-24 h-8 rounded-lg border border-input bg-background px-2 text-sm text-right outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                      />
                      <span className="text-[10px] text-muted-foreground">ML</span>
                    </div>
                  ))}
                </div>
                {selectedItem.karyawan.length === 0 && (
                  <EmptyState
                    title="Tidak ada karyawan"
                    description="Tidak ada karyawan dengan alokasi target untuk item ini. Buat target terlebih dahulu."
                    icon={Users}
                  />
                )}
              </Field>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </>
          )}

          {!selectedItem && form.itemId && (
            <EmptyState title="Item tidak ditemukan" description="Item yang dipilih tidak tersedia." icon={Clock} />
          )}
        </div>
      </CardContent>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Batal
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={submitting || !selectedItem || selectedItem.karyawan.length === 0}
        >
          <Save className="size-4" /> Simpan
        </Button>
      </div>
    </Modal>
  )
}
