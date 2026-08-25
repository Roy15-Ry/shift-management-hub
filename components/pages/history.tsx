"use client"

import * as React from "react"
import { Store as StoreIcon } from "lucide-react"

import { useAuth } from "@/components/auth-context"
import {
  EmptyState,
  Field,
  SelectField,
  useSimulatedLoading,
  LoadingState,
} from "@/components/controls"
import { Button } from "@/components/ui/button"

import {
  getStore,
  history,
  stores,
  type HistoryJenis,
  type Store,
} from "@/lib/data"

import { cn } from "@/lib/utils"

// ============================================================
// STYLE JENIS
// ============================================================

const jenisStyle: Record<HistoryJenis, string> = {
  Cuti: "bg-status-cuti-bg text-status-cuti",
  Sakit: "bg-status-sakit-bg text-status-sakit",
  Izin: "bg-status-izin-bg text-status-izin",
}

function JenisBadge({
  jenis,
}: {
  jenis: HistoryJenis
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        jenisStyle[jenis],
      )}
    >
      {jenis}
    </span>
  )
}

// ============================================================
// HELPER
// ============================================================

function isStoreRole(role?: string) {
  return role?.toUpperCase() === "STORE"
}

/**
 * Mencari toko berdasarkan profile akun STORE.
 *
 * Prioritas:
 * 1. storeId
 * 2. kode
 * 3. akunStore
 * 4. namaStore
 */
function resolveStore(
  profile: {
    storeId?: string
    namaStore?: string
  } | null,
): Store | undefined {
  if (!profile) return undefined

  const storeId =
    profile.storeId?.trim().toLowerCase()

  const namaStore =
    profile.namaStore?.trim().toLowerCase()

  return stores.find((store) => {
    if (
      storeId &&
      (
        store.id.toLowerCase() === storeId ||
        store.kode.toLowerCase() === storeId ||
        store.akunStore.toLowerCase() === storeId
      )
    ) {
      return true
    }

    if (
      namaStore &&
      store.name.toLowerCase() === namaStore
    ) {
      return true
    }

    return false
  })
}

// ============================================================
// HISTORY PAGE
// ============================================================

export function HistoryPage() {
  const { profile, loading: authLoading } =
    useAuth()

  const storeAccount =
    isStoreRole(profile?.role)

  /*
   * Jika akun STORE:
   * otomatis tentukan toko dari profile Firebase.
   *
   * Jika CENTRAL:
   * user bebas memilih toko.
   */
  const storeProfile =
    storeAccount
      ? resolveStore(profile)
      : undefined

  const [storeId, setStoreId] =
    React.useState("")

  const [periode, setPeriode] =
    React.useState("all")

  const [karyawan, setKaryawan] =
    React.useState("all")

  const [jenis, setJenis] =
    React.useState("all")

  // ============================================================
  // AUTO SELECT STORE UNTUK AKUN STORE
  // ============================================================

  React.useEffect(() => {
    if (!storeAccount) return

    if (storeProfile) {
      setStoreId(storeProfile.id)
    }
  }, [
    storeAccount,
    storeProfile?.id,
  ])

  // ============================================================
  // STORE YANG BOLEH DILIHAT
  // ============================================================

  const visibleStores =
    storeAccount
      ? storeProfile
        ? [storeProfile]
        : []
      : stores

  // ============================================================
  // DATA HISTORY
  // ============================================================

  const storeHistory =
    history.filter(
      (h) =>
        h.storeId === storeId,
    )

  const karyawanOptions =
    Array.from(
      new Set(
        storeHistory.map(
          (h) => h.name,
        ),
      ),
    )

  const filtered =
    storeHistory.filter((h) => {
      if (
        karyawan !== "all" &&
        h.name !== karyawan
      ) {
        return false
      }

      if (
        jenis !== "all" &&
        h.jenis !== jenis
      ) {
        return false
      }

      if (
        periode !== "all" &&
        !h.tanggalISO.startsWith(
          periode,
        )
      ) {
        return false
      }

      return true
    })

  const loading =
    useSimulatedLoading([
      storeId,
      periode,
      karyawan,
      jenis,
    ])

  // ============================================================
  // AUTH LOADING
  // ============================================================

  if (authLoading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <LoadingState />
      </div>
    )
  }

  // ============================================================
  // AKUN STORE TIDAK DITEMUKAN
  // ============================================================

  if (
    storeAccount &&
    !storeProfile
  ) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            HISTORY
          </h2>

          <p className="text-sm text-muted-foreground">
            Riwayat cuti, sakit, dan izin.
          </p>
        </div>

        <EmptyState
          icon={StoreIcon}
          title="Toko akun tidak ditemukan"
          description="Akun STORE belum terhubung dengan data toko. Silakan periksa storeId atau namaStore pada profil Firebase."
        />
      </div>
    )
  }

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <div className="space-y-5">
      {/* ======================================================
          HEADER
      ====================================================== */}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          HISTORY
        </h2>

        <p className="text-sm text-muted-foreground">
          Riwayat cuti, sakit, dan izin per toko.
        </p>
      </div>

      {/* ======================================================
          FILTER
      ====================================================== */}

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div
          className={cn(
            "grid grid-cols-1 gap-3",
            storeAccount
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {/* --------------------------------------------------
              TOKO
              Hanya tampil untuk CENTRAL
          -------------------------------------------------- */}

          {!storeAccount && (
            <Field label="Pilih Toko">
              <SelectField
                value={storeId}
                onChange={(value) => {
                  setStoreId(value)
                  setKaryawan("all")
                }}
                options={[
                  {
                    value: "",
                    label: "— Pilih Toko —",
                  },
                  ...visibleStores.map(
                    (store) => ({
                      value: store.id,
                      label: store.name,
                    }),
                  ),
                ]}
              />
            </Field>
          )}

          {/* --------------------------------------------------
              PERIODE
          -------------------------------------------------- */}

          <Field label="Periode">
            <SelectField
              value={periode}
              onChange={setPeriode}
              options={[
                {
                  value: "all",
                  label: "Semua Periode",
                },
                {
                  value: "2026-08",
                  label: "Agustus 2026",
                },
                {
                  value: "2026-07",
                  label: "Juli 2026",
                },
              ]}
            />
          </Field>

          {/* --------------------------------------------------
              KARYAWAN
          -------------------------------------------------- */}

          <Field label="Karyawan">
            <SelectField
              value={karyawan}
              onChange={setKaryawan}
              options={[
                {
                  value: "all",
                  label: "Semua Karyawan",
                },
                ...karyawanOptions.map(
                  (name) => ({
                    value: name,
                    label: name,
                  }),
                ),
              ]}
            />
          </Field>

          {/* --------------------------------------------------
              JENIS
          -------------------------------------------------- */}

          <Field label="Jenis">
            <SelectField
              value={jenis}
              onChange={setJenis}
              options={[
                {
                  value: "all",
                  label: "Semua Jenis",
                },
                {
                  value: "Cuti",
                  label: "Cuti",
                },
                {
                  value: "Sakit",
                  label: "Sakit",
                },
                {
                  value: "Izin",
                  label: "Izin",
                },
              ]}
            />
          </Field>
        </div>

        {/* ----------------------------------------------------
            STORE ACCOUNT INFO
        ---------------------------------------------------- */}

        {storeAccount &&
          storeProfile && (
            <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Toko
              </p>

              <p className="text-sm font-medium">
                {storeProfile.name}
              </p>
            </div>
          )}

        {/* ----------------------------------------------------
            RESET
        ---------------------------------------------------- */}

        {storeId && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPeriode("all")
                setKaryawan("all")
                setJenis("all")
              }}
            >
              Reset Filter
            </Button>
          </div>
        )}
      </div>

      {/* ======================================================
          CONTENT
      ====================================================== */}

      {!storeId ? (
        <EmptyState
          icon={StoreIcon}
          title="Belum ada toko dipilih"
          description="Silakan pilih toko terlebih dahulu untuk menampilkan riwayat cuti, sakit, dan izin."
        />
      ) : loading ? (
        <div className="rounded-xl border border-border bg-card">
          <LoadingState />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Tidak ada riwayat"
          description={`Tidak ada data history untuk ${
            getStore(storeId)?.name
          } dengan filter ini.`}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* --------------------------------------------------
              TABLE HEADER
          -------------------------------------------------- */}

          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-semibold">
              Riwayat{" "}
              {getStore(storeId)?.name}
            </p>

            <span className="text-xs text-muted-foreground">
              {filtered.length} data
            </span>
          </div>

          {/* --------------------------------------------------
              TABLE
          -------------------------------------------------- */}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">
                    Tanggal
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Nama
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Toko
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Jenis
                  </th>

                  <th className="px-4 py-3 font-medium">
                    Keterangan
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {item.tanggal}
                    </td>

                    <td className="px-4 py-3">
                      {item.name}
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {
                        getStore(
                          item.storeId,
                        )?.name
                      }
                    </td>

                    <td className="px-4 py-3">
                      <JenisBadge
                        jenis={item.jenis}
                      />
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {item.keterangan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}