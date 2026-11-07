"use client"

import * as React from "react"
import {
  Plus,
  Trash2,
  Save,
  Users,
  Target as TargetIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { Field, EmptyState, LoadingState } from "@/components/controls"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth-context"
import type { ParfumTarget } from "@/lib/parfum-types"
import { validateML, allocateML, formatMl } from "@/lib/parfum-target"

const MAX_ITEMS = 20

type DraftItem = {
  id: string
  namaItem: string
  targetTotal: string
  error: string | null
}

export function ParfumCreateTargetModal({
  open,
  onClose,
  periode,
  storeId,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  periode: string
  storeId: string
  onSuccess: () => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [drafts, setDrafts] = React.useState<DraftItem[]>([])
  const [employees, setEmployees] = React.useState<{ id: string; name: string }[]>([])
  const [employeeLoading, setEmployeeLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [generalError, setGeneralError] = React.useState("")

  React.useEffect(() => {
    if (!storeId) {
      setEmployeeLoading(false)
      return
    }

    let cancelled = false
    setEmployeeLoading(true)

    async function loadEmployees() {
      try {
        const idToken = await user?.getIdToken()
        const res = await fetch(
          `/api/admin/employees?storeId=${encodeURIComponent(storeId)}`,
          {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          },
        )
        if (cancelled) return
        const json = (await res.json()) as {
          success?: boolean
          employees?: { id?: string; name?: string; aktif?: boolean }[]
        }
        if (!cancelled && json.success && json.employees) {
          const active = json.employees
            .filter((e) => e.aktif === true)
            .map((e) => ({ id: e.id ?? "", name: e.name ?? "-" }))
            .sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }))
          setEmployees(active)
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setEmployeeLoading(false)
      }
    }

    loadEmployees()
    return () => { cancelled = true }
  }, [storeId, periode, user])

  React.useEffect(() => {
    if (open && drafts.length === 0) {
      setDrafts([{ id: Date.now().toString(), namaItem: "", targetTotal: "", error: null }])
      setGeneralError("")
    }
  }, [open, drafts.length])

  function addDraft() {
    if (drafts.length >= MAX_ITEMS) {
      setGeneralError(`Maksimal ${MAX_ITEMS} item aktif per toko per bulan.`)
      return
    }
    setDrafts([
      ...drafts,
      { id: Date.now().toString(), namaItem: "", targetTotal: "", error: null },
    ])
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }

  function updateDraft(id: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  function handleTargetChange(id: string, value: string) {
    const draft = drafts.find((d) => d.id === id)
    if (!draft) return

    let parsed: number | null = null
    let error: string | null = null

    if (value.trim() !== "") {
      parsed = validateML(value)
      if (parsed === null) error = "ML maksimal 2 angka desimal."
    }

    updateDraft(id, { targetTotal: value, error })
  }

  function PreviewAllocation({
    draft,
    employeeList,
  }: {
    draft: DraftItem
    employeeList: { id: string; name: string }[]
  }) {
    if (!draft.targetTotal || draft.targetTotal.trim() === "") return null
    const num = validateML(draft.targetTotal)
    if (num === null || employeeList.length <= 0) return null
    const result = allocateML(num, employeeList.length)
    const totalAlloc = result.reduce((a, b) => a + b, 0)

    return (
      <div className="mt-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Preview alokasi per karyawan</span>
          <span className="font-medium tabular-nums">{formatMl(totalAlloc)}</span>
        </div>
        <div className="grid gap-1 sm:grid-cols-4 text-xs">
          {result.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border/50 bg-muted/30">
              <span className="text-muted-foreground">{employeeList[i]?.name ?? `Karyawan ${i + 1}`}</span>
              <span className="font-medium tabular-nums">{formatMl(v)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  async function handleSave() {
    if (!user || !storeId) return

    setGeneralError("")

    let hasError = false
    const validItems: {
      itemId: string
      namaItem: string
      satuan: "ML"
      targetTotal: number
    }[] = []

    const seenNames = new Set<string>()

    for (const d of drafts) {
      if (!d.namaItem.trim()) {
        hasError = true
        updateDraft(d.id, { error: "Nama item wajib diisi." })
        continue
      }
      const upper = d.namaItem.trim().toUpperCase()
      if (seenNames.has(upper)) {
        hasError = true
        updateDraft(d.id, { error: "Nama item duplikasi." })
        continue
      }
      seenNames.add(upper)

      if (!d.targetTotal || d.targetTotal.trim() === "") {
        hasError = true
        updateDraft(d.id, { error: "Target total wajib diisi." })
        continue
      }
      if (d.error) {
        hasError = true
        continue
      }

      const num = validateML(d.targetTotal)
      if (num === null) {
        hasError = true
        updateDraft(d.id, { error: "Nilai ML tidak valid." })
        continue
      }

      validItems.push({
        itemId: d.id,
        namaItem: d.namaItem.trim(),
        satuan: "ML",
        targetTotal: num,
      })
    }

    if (hasError || validItems.length === 0) {
      showToast("error", "Validasi gagal", "Periksa kembali semua item sebelum disimpan.")
      return
    }

    setSaving(true)

    try {
      const idToken = await user.getIdToken()
      const res = await fetch("/api/parfum-target/target", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ periode, items: validItems }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json?.message ?? "Gagal menyimpan target.")
      }

      showToast("success", "Target tersimpan", json.message ?? "Target parfum berhasil disimpan.")
      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan target."
      setGeneralError(message)
      showToast("error", "Gagal menyimpan", message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buat Target Parfum"
      description="Masukkan item dan target total (satuan ML otomatis). Target akan dibagi otomatis kepada karyawan aktif."
    >
      {employeeLoading ? (
        <LoadingState label="Memuat data karyawan..." />
      ) : (
        <CardContent className="p-0">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Periode: <span className="font-medium">{periode}</span> &middot; Satuan: <span className="font-medium">ML</span> &middot; Karyawan aktif: <span className="font-medium">{employees.length}</span> &middot; Jumlah item: <span className="font-medium">{drafts.length}</span> / {MAX_ITEMS}
            </p>

            {drafts.map((draft) => (
              <Card key={draft.id} className="border border-border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <Field label="Nama Item">
                      <input
                        type="text"
                        value={draft.namaItem}
                        onChange={(e) => updateDraft(draft.id, { namaItem: e.target.value, error: null })}
                        placeholder="Contoh: Parfum Harum"
                        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
                      />
                    </Field>
                    <span className="text-xs font-medium text-muted-foreground px-2 py-1.5 rounded-lg border border-border bg-background">
                      ML
                    </span>
                  </div>

                  <Field label="Target Total Toko (ML)">
                    <input
                      type="text"
                      value={draft.targetTotal}
                      onChange={(e) => handleTargetChange(draft.id, e.target.value)}
                      placeholder="Contoh: 100.00"
                      className={cn(
                        "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25",
                        draft.error ? "border-destructive" : "",
                      )}
                    />
                    {draft.error && (
                      <p className="text-xs text-destructive mt-1">{draft.error}</p>
                    )}
                  </Field>

                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeDraft(draft.id)}
                    className="mt-2 sm:mt-0"
                  >
                    <Trash2 className="size-4" /> Hapus
                  </Button>
                </div>

                <PreviewAllocation draft={draft} employeeList={employees} />
              </Card>
            ))}

            <Button type="button" onClick={addDraft} disabled={drafts.length >= MAX_ITEMS}>
              <Plus className="size-4" /> Tambah Item
            </Button>

            {generalError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {generalError}
              </div>
            )}
          </div>
        </CardContent>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Batal
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || drafts.length === 0}>
          <Save className="size-4" /> Simpan Target
        </Button>
      </div>
    </Modal>
  )
}
