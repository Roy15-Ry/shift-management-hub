"use client"

import * as React from "react"
import { MessageSquarePlus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { EmptyState, Field, LoadingState } from "@/components/controls"
import { cn } from "@/lib/utils"

// ============================================================
// CATATAN — MONITORING ERROR
// ============================================================
//
// Komponen ini HANYA untuk domain Monitoring Error.
//
// ISOLASI TOTAL (tidak boleh dilanggar):
//   - Endpoint  : /api/monitoring-error/notes dan
//                 /api/monitoring-error/notes/[noteId]
//   - Collection: monitoring_error_notes (dipakai server)
//   - localStorage: monitoring-error-notes-seen:*
//
// Komponen ini TIDAK meng-import, TIDAK memanggil, dan TIDAK
// membaca apa pun dari domain Target Penjualan. Tidak ada import
// dari additional-selling-notes.tsx, tidak ada fetch ke
// /api/additional-selling/notes, dan tidak ada key localStorage
// additional-selling-notes-seen. Pola ini identik, datanya tidak
// pernah bercampur. collections kedua domain dipisah secara
// fisik di server, jadi tidak mungkin ada kebocoran lintas
// domain lewat API.
//
// CATATAN BUKAN HALAMAN. Monitoring Error tetap memakai struktur
// halaman yang sekarang: Sidebar, tab, chart, KPI, aggregate,
// detail toko, dan navigasi periode tidak berubah. Catatan hanya
// satu tombol di baris navigasi yang sudah ada.
//
// ISI CATATAN
//   - Central (Pusat / Cabang): tambah, ubah, hapus.
//   - Store: BACA SAJA. Tanpa form, tanpa tombol tulis.
//
// PERIODE
//   Mengikuti periode Monitoring Error yang sedang aktif (props
//   "periode"). Ganti periode = ganti daftar. Tidak ada selector
//   periode terpisah untuk Catatan.
//
// SCOPE TOKO
//   Toko aktif ditentukan oleh parent dan hanya diteruskan apa
//   adanya. Saat belum ada toko (Central masih di rekap atau belum
//   memilih cabang), "storeId" kosong: tombol disembunyikan dan
//   TIDAK ada request sama sekali. Otoritas akses tetap di
//   server; storeId dari client hanya untuk display dan fetch.
//
// STATE / CACHE
//   - Tidak ada realtime listener, tidak ada polling, tidak ada
//     onSnapshot.
//   - Satu GET list untuk (toko, periode). Tidak ada request per
//     catatan.
//   - Fetch dilakukan sekali per pasangan (toko, periode) lalu
//     disimpan di state. Pindah toko, cabang, atau periode
//     mengosongkan daftar sehingga data tidak pernah bercampur.
//   - Setelah POST/PATCH/DELETE hanya daftar Catatan yang dimuat
//     ulang. Dashboard, aggregate, KPI, chart, dan History tidak
//     pernah disentuh.
// ============================================================

const NOTES_API = "/api/monitoring-error/notes"

// Batas isi harus sama dengan batas server (ISI_MAX = 2000). Di
// client ini hanya batas ergonomis; penolakan sesungguhnya tetap
// di server.
const ISI_MAX = 2000
const ISI_MAX_HINT = `Catatan maksimal ${ISI_MAX} karakter.`

// Ambang karakter sebelum isi dipotong sebagai preview. Pemotongan
// hanya terjadi di sisi UI; isi penuh tetap dikirim dan disimpan
// server.
const PREVIEW_MAX = 140

// Aksen merah cabai milik halaman Monitoring Error.
//
// Nilai heks ini sengaja disalin apa adanya dari blok navigasi
// Monitoring Error (lihat backButtonClass di
// components/pages/monitoring-error.tsx) BUKAN di-import dari sana:
// halaman itu melokalkan aksennya sendiri dengan alasan yang sama.
//
//   - globals.css TIDAK disentuh
//   - token global TIDAK ditambah / diubah
//   - tidak memakai varian "dark:" karena aplikasi bisa juga
//     gelap lewat prefers-color-scheme tanpa kelas .dark
const CATATAN_BUTTON_CLASS = cn(
  "gap-1.5",
  "ring-1 ring-inset ring-[#EF3340]/30",
  "shadow-[0_0_16px_-8px] shadow-[#FF3B4D]/45",
  "transition-all duration-200",
  "hover:ring-[#EF3340]/60",
)

type NoteRow = {
  id: string
  storeId: string
  periode: string
  isi: string
  sumber: "pusat" | "cabang" | null
  dibuatOlehUid: string
  dibuatOlehNama: string
  createdAt: string | null
  updatedAt: string | null
}

type NotesGetResponse = {
  success?: boolean
  periode?: string
  storeId?: string
  count?: number
  notes?: NoteRow[]
  message?: string
}

type NotesMutateResponse = {
  success?: boolean
  id?: string
  message?: string
}

const noteDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

const textareaBase =
  "min-h-28 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"

function formatNoteDate(iso: string | null): string {
  if (!iso) return "-"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "-"
  return noteDateFormatter.format(date)
}

function sumberLabel(sumber: NoteRow["sumber"]): string {
  if (sumber === "pusat") return "Pusat"
  if (sumber === "cabang") return "Cabang"
  return "-"
}

// ----------------------------------------------------------
// PENYIMPANAN LOCAL — KHUSUS MONITORING ERROR
// ----------------------------------------------------------
//
// Menyimpan waktu catatan terbaru yang SUDAH DILIHAT, agar
// indikator "catatan baru" tidak bergantung pada data tambahan
// dari server. Tidak ada write ke Firestore, tidak ada field baru
// di dokumen monitoring_errors, tidak ada collection read-state,
// dan tidak ada touch ke users.
//
// Key WAJIB berawalan "monitoring-error-notes-seen" dan memuat
// (toko, periode) sehingga catatan domain lain tidak pernah ikut
// terhitung dan catatan periode berbeda tidak pernah tercampur.
function seenKey(storeId: string, periode: string) {
  return `monitoring-error-notes-seen:${storeId}:${periode}`
}

function readSeen(storeId: string, periode: string): string {
  if (typeof window === "undefined") return ""
  if (!storeId || !periode) return ""
  try {
    return window.localStorage.getItem(seenKey(storeId, periode)) ?? ""
  } catch {
    // Mode privat / storage diblokir: indikator dimatikan, daftar
    // catatan tetap berfungsi normal.
    return ""
  }
}

function writeSeen(
  storeId: string,
  periode: string,
  value: string,
) {
  if (typeof window === "undefined") return
  if (!storeId || !periode || !value) return
  try {
    window.localStorage.setItem(seenKey(storeId, periode), value)
  } catch {
    // Kegagalan menulis tidak boleh menghalangi flujo Catatan.
  }
}

export function MonitoringErrorNotes({
  storeId,
  periode,
  periodeLabel,
  storeLabel,
  isStore,
  canWrite,
  getIdToken,
  showToast,
}: {
  storeId: string
  periode: string
  periodeLabel: string
  storeLabel: string
  isStore: boolean
  canWrite: boolean
  getIdToken: () => Promise<string>
  showToast: (
    kind: "success" | "error",
    title: string,
    description?: string,
  ) => void
}) {
  // Pertahanan lapis pertama. Guard sesungguhnya ada di server.
  const writable = canWrite && !isStore

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const [open, setOpen] = React.useState(false)
  const [notes, setNotes] = React.useState<NoteRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const [formMode, setFormMode] = React.useState<"add" | "edit" | null>(
    null,
  )
  const [editingId, setEditingId] = React.useState("")
  const [draft, setDraft] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const [detailNote, setDetailNote] = React.useState<NoteRow | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<NoteRow | null>(
    null,
  )
  const [deleting, setDeleting] = React.useState(false)

  const [seenAt, setSeenAt] = React.useState("")

  // Getter token disimpan di ref supaya identitasnya yang berubah
  // setiap render parent TIDAK membuat effect fetch diulang (yang
  // akan membatalkan request yang sedang berjalan).
  const getIdTokenRef = React.useRef(getIdToken)
  React.useEffect(() => {
    getIdTokenRef.current = getIdToken
  })

  // Kunci cache memuat toko + periode.
  const scopeKey = React.useMemo(
    () => [storeId || "-", periode || "-"].join("::"),
    [storeId, periode],
  )

  const loadedKeyRef = React.useRef("")
  const requestSeqRef = React.useRef(0)
  const [refreshKey, setRefreshKey] = React.useState(0)

  // ----------------------------------------------------------
  // RESET SCOPE — toko / periode berubah -> daftar kosong
  // ----------------------------------------------------------
  //
  // Dipicu juga saat pindah cabang karena "storeId" yang dioper
  // parent ikut berubah (atau menjadi kosong). Catatan toko
  // sebelumnya tidak pernah boleh terlihat di toko berikutnya.

  React.useEffect(() => {
    requestSeqRef.current++
    setNotes([])
    setError("")
    loadedKeyRef.current = ""
    setDetailNote(null)
    setPendingDelete(null)
    setFormMode(null)
    setEditingId("")
    setDraft("")
    setSeenAt(readSeen(storeId, periode))
  }, [storeId, periode])

  // ----------------------------------------------------------
  // LOAD CATATAN
  // ----------------------------------------------------------
  //
  // Central memuat HANYA saat modal dibuka (tidak ada kebutuhan
  // badge). Store memuat saat halaman siap supaya indikator
  // "catatan baru" akurat tanpa harus membuka modal dulu.
  // Keduanya TIDAK pernah melakukan request tanpa toko, sehingga
  // aggregate Central tidak pernah memicu fetch Catatan.

  React.useEffect(() => {
    if (!storeId || !periode) {
      setNotes([])
      setError("")
      loadedKeyRef.current = ""
      return
    }

    // Tanpa toko terpilih tidak ada request sama sekali.
    if (!isStore && !open) {
      setNotes([])
      setError("")
      loadedKeyRef.current = ""
      return
    }

    // Sudah dimuat untuk scope ini: jangan fetch ulang.
    if (loadedKeyRef.current === scopeKey) {
      return
    }

    loadedKeyRef.current = scopeKey

    let cancelled = false
    const seq = ++requestSeqRef.current

    async function loadNotes() {
      setLoading(true)
      setError("")

      try {
        const idToken = await getIdTokenRef.current()

        const params = new URLSearchParams({ periode })
        params.set("storeId", storeId)

        const response = await fetch(
          `${NOTES_API}?${params.toString()}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${idToken}` },
            cache: "no-store",
          },
        )

        const result = (await response.json()) as NotesGetResponse

        if (cancelled || seq !== requestSeqRef.current) return

        if (!response.ok || !result.success) {
          throw new Error(result?.message ?? "Catatan gagal dimuat.")
        }

        // Server sudah mengurutkan createdAt DESC. Tidak ada
        // pengurutan kedua di sisi client.
        setNotes(Array.isArray(result.notes) ? result.notes : [])
      } catch (loadError) {
        console.error("Gagal memuat catatan Monitoring Error:", loadError)
        if (!cancelled && seq === requestSeqRef.current) {
          setError("Catatan belum dapat dimuat. Silakan coba lagi.")
        }
      } finally {
        if (!cancelled && seq === requestSeqRef.current) {
          setLoading(false)
        }
      }
    }

    loadNotes()

    return () => {
      cancelled = true
    }
  }, [storeId, periode, isStore, open, scopeKey, refreshKey])

  // ----------------------------------------------------------
  // INDICATOR CATATAN BARU (khusus Store)
  // ----------------------------------------------------------
  //
  // Dibandingkan terhadap waktu catatan terbaru yang SUDAH
  // dilihat. createdAt dihitung dengan membandingkan seluruh
  // daftar, bukan hanya elemen pertama, karena createdAt bisa
  // null pada dokumen yang timestamp-nya belum ter_resolve.

  const newestCreatedAt = React.useMemo(
    () =>
      notes.reduce<string>(
        (newest, note) =>
          (note.createdAt ?? "") > newest ? (note.createdAt ?? "") : newest,
        "",
      ),
    [notes],
  )

  // Belum ada penanda berarti Store BELUM PERNAH membuka Catatan
  // pada (toko, periode) ini, jadi semua catatan yang ada memang
  // belum dilihat dan badge HARUS muncul. Penanda hanya boleh
  // dibuat saat modal benar-benar dibuka (efek di bawah), bukan
  // saat halaman dimuat.
  //
  // Syarat "notes.length > 0" mencegah badge muncul ketika belum
  // ada catatan sama sekali.
  const hasUnread =
    isStore &&
    notes.length > 0 &&
    (seenAt.length === 0 || newestCreatedAt > seenAt)

  // Modal dibuka -> semua catatan yang terlihat dianggap sudah
  // dilihat.
  React.useEffect(() => {
    if (!isStore || !open) return
    if (!storeId || !periode) return
    if (!newestCreatedAt) return

    writeSeen(storeId, periode, newestCreatedAt)
    setSeenAt(newestCreatedAt)
  }, [isStore, open, storeId, periode, newestCreatedAt])

  // ----------------------------------------------------------
  // AKSI
  // ----------------------------------------------------------

  function closeAll() {
    setOpen(false)
    setFormMode(null)
    setEditingId("")
    setDraft("")
    setDetailNote(null)
    setPendingDelete(null)
  }

  // Hanya daftar Catatan yang dimuat ulang. Tidak menyentuh
  // dashboard, aggregate, KPI, chart, atau History.
  function refresh() {
    loadedKeyRef.current = ""
    setRefreshKey((current) => current + 1)
  }

  function openAddForm() {
    if (!writable) return
    setEditingId("")
    setDraft("")
    setDetailNote(null)
    setFormMode("add")
  }

  function openEditForm(note: NoteRow) {
    if (!writable) return
    setEditingId(note.id)
    setDraft(note.isi)
    setDetailNote(null)
    setFormMode("edit")
  }

  async function submitForm() {
    if (!writable) return
    if (!storeId || !periode) return

    const isi = draft.trim()

    if (!isi) {
      showToast("error", "Catatan wajib diisi")
      return
    }

    if (isi.length > ISI_MAX) {
      showToast("error", "Catatan terlalu panjang", ISI_MAX_HINT)
      return
    }

    const isEdit = formMode === "edit"

    if (isEdit && !editingId) {
      showToast("error", "Catatan tidak ditemukan")
      return
    }

    setSaving(true)

    try {
      const idToken = await getIdTokenRef.current()

      const response = await fetch(
        isEdit ? `${NOTES_API}/${editingId}` : NOTES_API,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          // Server menentukan storeId, periode, sumber, dan
          // identitas pembuat dari akun. Client hanya mengirim
          // isi, plus toko + periode saat membuat catatan baru.
          body: JSON.stringify(
            isEdit ? { isi } : { storeId, periode, isi },
          ),
        },
      )

      const result = (await response.json()) as NotesMutateResponse

      if (!response.ok || !result.success) {
        throw new Error(result?.message ?? "Catatan gagal disimpan.")
      }

      setFormMode(null)
      setEditingId("")
      setDraft("")

      showToast(
        "success",
        isEdit ? "Catatan diperbarui" : "Catatan disimpan",
        result.message,
      )

      refresh()
    } catch (saveError) {
      console.error("Gagal menyimpan catatan Monitoring Error:", saveError)
      showToast(
        "error",
        "Gagal menyimpan",
        saveError instanceof Error ? saveError.message : undefined,
      )
    } finally {
      setSaving(false)
    }
  }

  async function performDelete() {
    if (!writable) return
    if (!pendingDelete) return

    setDeleting(true)

    try {
      const idToken = await getIdTokenRef.current()

      const response = await fetch(
        `${NOTES_API}/${pendingDelete.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${idToken}` },
        },
      )

      const result = (await response.json()) as NotesMutateResponse

      if (!response.ok || !result.success) {
        throw new Error(result?.message ?? "Catatan gagal dihapus.")
      }

      setPendingDelete(null)

      showToast("success", "Catatan dihapus", result.message)

      refresh()
    } catch (deleteError) {
      console.error("Gagal menghapus catatan Monitoring Error:", deleteError)
      showToast(
        "error",
        "Gagal menghapus",
        deleteError instanceof Error ? deleteError.message : undefined,
      )
    } finally {
      setDeleting(false)
    }
  }

  // ----------------------------------------------------------
  // TOMBOL
  // ----------------------------------------------------------
  //
  // Central: tombol "Tambahkan Catatan" hanya muncul ketika sudah
  // membuka detail toko (storeId tidak kosong).
  // Store  : tombol "Catatan" + indikator merah catatan baru.

  if (!storeId) {
    return null
  }

  return (
    <>
      <Button
        type="button"
        variant={writable ? "default" : "outline"}
        size="sm"
        onClick={() => {
          setFormMode(null)
          setDetailNote(null)
          setPendingDelete(null)
          setOpen(true)
        }}
        className={cn(
          "relative",
          writable ? "bg-[#EF3340] text-white hover:bg-[#EF3340]/90" : "",
          CATATAN_BUTTON_CLASS,
        )}
      >
        <MessageSquarePlus className="size-4" />
        {writable ? "Tambahkan Catatan" : "Catatan"}

        {hasUnread && (
          <span
            aria-label="Ada catatan baru"
            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-destructive text-xs font-bold leading-none text-destructive-foreground ring-2 ring-card"
          >
            !
          </span>
        )}
      </Button>

      {/* ============================================ */}
      {/* MODAL: DAFTAR CATATAN                       */}
      {/* ============================================ */}

      <Modal
        open={open && formMode === null && !detailNote && !pendingDelete}
        onClose={closeAll}
        title="Catatan Monitoring Error"
        description={`${storeLabel} · ${periodeLabel}`}
        footer={
          writable ? (
            <Button
              type="button"
              onClick={openAddForm}
              disabled={loading || saving}
              className="gap-1.5"
            >
              <MessageSquarePlus className="size-4" />
              Tambahkan Catatan
            </Button>
          ) : undefined
        }
      >
        {loading && <LoadingState label="Memuat catatan..." />}

        {!loading && error && (
          <EmptyState
            title={error}
            description="Silakan tutup dan buka kembali catatan."
          />
        )}

        {!loading && !error && notes.length === 0 && (
          <EmptyState
            title="Belum ada catatan untuk periode ini."
            description="Catatan dari Pusat atau Cabang akan tampil di sini."
          />
        )}

        {!loading && !error && notes.length > 0 && (
          // Seluruh daftar memakai scroll internal: saat catatan
          // banyak, tinggi modal tetap terkendali dan halaman
          // tidak ikut bergeser.
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {notes.map((note) => {
              const long = note.isi.length > PREVIEW_MAX

              return (
                <div
                  key={note.id}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {note.dibuatOlehNama || "Admin"}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        — {sumberLabel(note.sumber)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatNoteDate(note.createdAt)}
                    </p>
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {long ? `${note.isi.slice(0, PREVIEW_MAX)}…` : note.isi}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {long && (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() => setDetailNote(note)}
                        className="h-auto px-0"
                      >
                        Lihat selengkapnya
                      </Button>
                    )}

                    {writable && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditForm(note)}
                          disabled={saving || deleting}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(note)}
                          disabled={saving || deleting}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                          Hapus
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* ============================================ */}
      {/* MODAL: TAMBAHKAN / UBAH CATATAN             */}
      {/* ============================================ */}

      <Modal
        open={open && formMode !== null}
        onClose={() => {
          setFormMode(null)
          setEditingId("")
          setDraft("")
        }}
        title={formMode === "edit" ? "Ubah Catatan" : "Tambahkan Catatan"}
        description={`${storeLabel} · ${periodeLabel}`}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormMode(null)
                setEditingId("")
                setDraft("")
              }}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="button" onClick={submitForm} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan Catatan"}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          {/* Periode ditampilkan sebagai informasi saja, mengikuti
              periode dashboard yang sedang aktif. Tidak ada input
              periode baru di sini. */}
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">Periode</p>
            <p className="font-medium">{periodeLabel}</p>
          </div>

          <Field label="Isi Catatan">
            <textarea
              value={draft}
              onChange={(event) =>
                setDraft(event.target.value.slice(0, ISI_MAX))
              }
              disabled={saving}
              rows={5}
              placeholder="Tulis catatan Monitoring Error untuk toko ini."
              className={textareaBase}
            />
          </Field>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Toko dan periode mengikuti dashboard yang aktif.</span>
            <span>
              {draft.length}/{ISI_MAX}
            </span>
          </div>
        </div>
      </Modal>

      {/* ============================================ */}
      {/* MODAL: DETAIL CATATAN PANJANG                */}
      {/* ============================================ */}

      <Modal
        open={open && detailNote !== null && formMode === null}
        onClose={() => setDetailNote(null)}
        title="Catatan Monitoring Error"
        description={`${storeLabel} · ${periodeLabel}`}
      >
        {detailNote && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {detailNote.dibuatOlehNama || "Admin"}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  — {sumberLabel(detailNote.sumber)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {formatNoteDate(detailNote.createdAt)}
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {detailNote.isi}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ============================================ */}
      {/* MODAL: KONFIRMASI HAPUS                     */}
      {/* ============================================ */}

      <Modal
        open={open && pendingDelete !== null && formMode === null}
        onClose={() => setPendingDelete(null)}
        title="Hapus catatan?"
        description="Catatan yang dihapus tidak dapat dikembalikan."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={performDelete}
              disabled={deleting}
            >
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              {pendingDelete.dibuatOlehNama || "Admin"} —{" "}
              {sumberLabel(pendingDelete.sumber)}
            </p>
            <p className="text-muted-foreground">
              {formatNoteDate(pendingDelete.createdAt)} · {storeLabel}
            </p>
            <p className="whitespace-pre-wrap text-muted-foreground">
              {pendingDelete.isi.length > PREVIEW_MAX
                ? `${pendingDelete.isi.slice(0, PREVIEW_MAX)}…`
                : pendingDelete.isi}
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
