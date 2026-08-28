"use client"

import * as React from "react"
import { RotateCcw, Store as StoreIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useAuth } from "@/components/auth-context"

import {
  DateField,
  EmptyState,
  Field,
  LoadingState,
  SelectField,
} from "@/components/controls"

import {
  getFirestoreEmployees,
  getFirestoreSchedules,
  getFirestoreStores,
  type FirestoreEmployee,
  type FirestoreStore,
} from "@/lib/firestore-data"

import {
  STATUS_LABEL,
  STATUS_ORDER,
  formatTanggal,
  DEFAULT_DATE,
  type ShiftStatus,
} from "@/lib/data"

import { cn } from "@/lib/utils"

// ============================================================
// SUMMARY STYLE
// ============================================================

const summaryMeta: {
  key: ShiftStatus
  bg: string
  text: string
  ring: string
}[] = [
    {
      key: "shift_pagi",
      bg: "bg-status-pagi-bg",
      text: "text-status-pagi",
      ring: "ring-status-pagi/20",
    },
    {
      key: "shift_siang",
      bg: "bg-status-siang-bg",
      text: "text-status-siang",
      ring: "ring-status-siang/20",
    },
    {
      key: "libur",
      bg: "bg-status-libur-bg",
      text: "text-status-libur",
      ring: "ring-status-libur/20",
    },
    {
      key: "sakit",
      bg: "bg-status-sakit-bg",
      text: "text-status-sakit",
      ring: "ring-status-sakit/20",
    },
    {
      key: "izin",
      bg: "bg-status-izin-bg",
      text: "text-status-izin",
      ring: "ring-status-izin/20",
    },
    {
      key: "cuti",
      bg: "bg-status-cuti-bg",
      text: "text-status-cuti",
      ring: "ring-status-cuti/20",
    },
  ]

// ============================================================
// DASHBOARD
// ============================================================

export function DashboardPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const showToastRef =
    React.useRef(showToast)

  React.useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  const [date, setDate] =
    React.useState(DEFAULT_DATE)

  const [storeFilter, setStoreFilter] =
    React.useState("all")

  const [statusFilter, setStatusFilter] =
    React.useState<ShiftStatus | "all">("all")

  const [stores, setStores] =
    React.useState<FirestoreStore[]>([])

  const [employees, setEmployees] =
    React.useState<FirestoreEmployee[]>([])

  const [schedules, setSchedules] =
    React.useState<
      Record<
        string,
        Awaited<
          ReturnType<
            typeof getFirestoreSchedules
          >
        >
      >
    >({})

  const [loading, setLoading] =
    React.useState(true)

  // ==========================================================
  // ROLE
  // ==========================================================

  const role =
    profile?.role
      ?.trim()
      .toLowerCase()

  const isStore =
    role === "store"

  const isCentralCabang =
    role === "central_cabang"

  const isCentralPusat =
    role === "central_pusat"

  // ==========================================================
  // LOAD DATA FIRESTORE
  // ==========================================================

  React.useEffect(() => {
    async function loadData() {
      let accessibleStores: FirestoreStore[] = []

      try {
        setLoading(true)

        const firestoreStores =
          await getFirestoreStores(
            role,
            profile?.storeId,
            profile?.cabangId,
          )

        const activeStores =
          firestoreStores.filter(
            (store) =>
              store.aktif !== false,
          )

        // ------------------------------------------------------
        // FILTER STORE SESUAI ROLE
        // ------------------------------------------------------

        accessibleStores = activeStores

        // STORE
        if (
          isStore &&
          profile?.storeId
        ) {
          const accountStoreId =
            profile.storeId
              .trim()
              .toUpperCase()

          accessibleStores =
            activeStores.filter(
              (store) =>
                store.id
                  .trim()
                  .toUpperCase() ===
                accountStoreId,
            )
        }

        // CENTRAL CABANG
        else if (
          isCentralCabang &&
          profile?.cabangId
        ) {
          const accountCabangId =
            profile.cabangId
              .trim()
              .toUpperCase()

          accessibleStores =
            activeStores.filter(
              (store) =>
                store.cabangId
                  ?.trim()
                  .toUpperCase() ===
                accountCabangId,
            )
        }

        // CENTRAL PUSAT
        else if (isCentralPusat) {
          accessibleStores =
            activeStores
        }

        // ------------------------------------------------------
        // SIMPAN STORE YANG BOLEH DIAKSES
        // ------------------------------------------------------

        setStores(accessibleStores)
        console.log("DASHBOARD STORES:", accessibleStores)

      } catch (error) {
        console.error(
          "Gagal mengambil data toko Dashboard:",
          error,
        )

        setStores([])
        setEmployees([])
        setSchedules({})
        showToastRef.current(
          "error",
          "Data toko gagal dimuat",
          "Silakan coba lagi.",
        )
        setLoading(false)
        return
      }

      // ------------------------------------------------------
      // LOAD EMPLOYEE + SCHEDULE
      // ------------------------------------------------------

      try {
        const allEmployees: FirestoreEmployee[] =
          []

        const scheduleMap: Record<
          string,
          Awaited<
            ReturnType<
              typeof getFirestoreSchedules
            >
          >
        > = {}

        for (
          const store of accessibleStores
        ) {
          const cabangId =
            isCentralCabang
              ? profile?.cabangId
              : undefined

          const storeEmployees =
            await getFirestoreEmployees(
              store.id,
              cabangId,
            )

          allEmployees.push(
            ...storeEmployees.filter(
              (employee) =>
                employee.aktif !== false,
            ),
          )

          scheduleMap[store.id] =
            await getFirestoreSchedules(
              store.id,
              date,
              cabangId,
            )
        }

        setEmployees(
          allEmployees,
        )

        setSchedules(
          scheduleMap,
        )

        console.log(
          "DASHBOARD EMPLOYEE FIRESTORE:",
          allEmployees,
        )
      } catch (error) {
        console.error(
          "Gagal mengambil data karyawan atau jadwal Dashboard:",
          error,
        )

        setEmployees([])
        setSchedules({})
        showToastRef.current(
          "error",
          "Data jadwal belum dapat dimuat",
          "Daftar toko tetap ditampilkan. Silakan coba lagi.",
        )
      }

      setLoading(false)
    }

    if (profile) {
      loadData()
    }
  }, [
    profile,
    date,
    isStore,
    isCentralCabang,
    isCentralPusat,
  ])

  // ==========================================================
  // STORE YANG BOLEH DIAKSES
  // ==========================================================

  const accessibleStores =
    React.useMemo(
      () => stores,
      [stores],
    )

  // ==========================================================
  // STORE TERPILIH
  // ==========================================================

  const visibleStores =
    isStore
      ? accessibleStores
      : storeFilter === "all"
        ? accessibleStores
        : accessibleStores.filter(
          (store) =>
            store.id ===
            storeFilter,
        )

  // ==========================================================
  // STORE ACCOUNT
  // ==========================================================

  const accountStore =
    isStore
      ? accessibleStores[0]
      : null

  // ==========================================================
  // SUMMARY
  // ==========================================================

  const summary =
    React.useMemo(() => {
      const result: Record<
        ShiftStatus,
        number
      > & {
        totalToko: number
      } = {
        totalToko:
          visibleStores.length,

        shift_pagi: 0,
        shift_siang: 0,
        libur: 0,
        sakit: 0,
        izin: 0,
        cuti: 0,
      }

      visibleStores.forEach(
        (store) => {
          const storeSchedules =
            schedules[
            store.id
            ] ?? []

          storeSchedules.forEach(
            (schedule) => {
              if (
                schedule.status in
                result
              ) {
                result[
                  schedule.status as ShiftStatus
                ] += 1
              }
            },
          )
        },
      )

      return result
    }, [
      visibleStores,
      schedules,
    ])

  // ==========================================================
  // RESET
  // ==========================================================

  const isDefault =
    date === DEFAULT_DATE &&
    storeFilter === "all" &&
    statusFilter === "all"

  function resetFilter() {
    setDate(DEFAULT_DATE)
    setStoreFilter("all")
    setStatusFilter("all")
  }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="space-y-6">

      {/* ================================================== */}
      {/* INTRO */}
      {/* ================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">

        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {isStore
              ? "DASHBOARD STORE"
              : "DASHBOARD CENTRAL"}
          </h2>

          <p className="text-sm text-muted-foreground">
            Operasional{" "}
            {isStore
              ? "toko"
              : "seluruh toko"}{" "}
            Hari Ini
            &middot;{" "}
            {formatTanggal(date)}
          </p>
        </div>

        <div className="w-full sm:w-56">
          <Field label="Tanggal Monitoring">
            <DateField
              value={date}
              onChange={setDate}
            />
          </Field>
        </div>

      </div>

      {/* ================================================== */}
      {/* SUMMARY */}
      {/* ================================================== */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">

        {/* STORE / TOTAL TOKO */}

        <div className="flex flex-col justify-between rounded-xl border border-border bg-primary p-4 text-primary-foreground shadow-sm">

          <div className="flex items-center gap-2 text-xs font-medium text-primary-foreground/80">

            <StoreIcon className="size-4" />

            {isStore
              ? "Toko"
              : "Total Toko"}

          </div>

          {isStore ? (
            accountStore ? (
              <>
                <p className="mt-3 text-lg font-bold leading-tight">
                  {accountStore.nama}
                </p>

                <p className="mt-1 text-xs font-medium text-primary-foreground/70">
                  Data Toko
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm font-bold leading-tight">
                  Data Toko Belum Tersedia
                </p>

                <p className="mt-1 text-xs font-medium text-primary-foreground/70">
                  Belum ada data toko yang dapat ditampilkan untuk akun ini.
                </p>
              </>
            )
          ) : (
            <p className="mt-3 text-3xl font-bold leading-none">

              {summary.totalToko}

              <span className="ml-1 text-sm font-medium text-primary-foreground/70">
                Toko
              </span>

            </p>
          )}

        </div>

        {/* STATUS SUMMARY */}

        {summaryMeta.map(
          (m) => (
            <div
              key={m.key}
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm"
            >

              <div
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
                  m.bg,
                  m.text,
                  m.ring,
                )}
              >
                {
                  STATUS_LABEL[
                  m.key
                  ]
                }
              </div>

              <p className="mt-3 text-3xl font-bold leading-none text-foreground">

                {
                  summary[
                  m.key
                  ]
                }

                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  orang
                </span>

              </p>

            </div>
          ),
        )}

      </div>

      {/* ================================================== */}
      {/* FILTER */}
      {/* ================================================== */}

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">

        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            isStore
              ? "lg:grid-cols-[1fr_1fr_auto]"
              : "lg:grid-cols-[1fr_1fr_1fr_auto]",
            "lg:items-end",
          )}
        >

          {/* TANGGAL */}

          <Field label="Tanggal">
            <DateField
              value={date}
              onChange={setDate}
            />
          </Field>

          {/* TOKO - CENTRAL SAJA */}

          {!isStore && (
            <Field label="Toko">

              <SelectField
                value={
                  storeFilter
                }
                onChange={
                  setStoreFilter
                }
                options={[
                  {
                    value:
                      "all",
                    label:
                      accessibleStores.length ===
                        1
                        ? accessibleStores[0]
                          .nama
                        : "Semua Toko",
                  },

                  ...accessibleStores.map(
                    (store) => ({
                      value:
                        store.id,
                      label:
                        store.nama,
                    }),
                  ),
                ]}
              />

            </Field>
          )}

          {/* STATUS */}

          <Field label="Status">

            <SelectField
              value={
                statusFilter
              }
              onChange={(
                value,
              ) =>
                setStatusFilter(
                  value as
                  | ShiftStatus
                  | "all",
                )
              }
              options={[
                {
                  value:
                    "all",
                  label:
                    "Semua Status",
                },

                ...STATUS_ORDER.map(
                  (
                    status,
                  ) => ({
                    value:
                      status,
                    label:
                      STATUS_LABEL[
                      status
                      ],
                  }),
                ),
              ]}
            />

          </Field>

          {/* RESET */}

          <Button
            variant="outline"
            size="lg"
            disabled={
              isDefault
            }
            onClick={
              resetFilter
            }
          >
            <RotateCcw />
            Reset Filter
          </Button>

        </div>
      </div>

      {/* ================================================== */}
      {/* MONITORING */}
      {/* ================================================== */}

      <div>

        <div className="mb-3 flex items-center justify-between">

          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Monitoring Toko
          </h3>

          <span className="text-xs text-muted-foreground">

            {isStore
              ? `${visibleStores.length === 1 ? "1" : "0"} toko`
              : `${visibleStores.length} toko ditampilkan`}

          </span>

        </div>

        {loading ? (

          <div className="rounded-xl border border-border bg-card">
            <LoadingState />
          </div>

        ) : visibleStores.length ===
          0 ? (

          <EmptyState
            title={
              isStore
                ? "Data Toko Belum Tersedia"
                : "Tidak ada toko"
            }
            description={
              isStore
                ? "Belum ada data toko yang dapat ditampilkan untuk akun ini."
                : isCentralCabang
                  ? "Belum ada toko aktif pada cabang ini."
                  : "Belum ada data toko."
            }
          />

        ) : (

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">

            {visibleStores.map(
              (store) => {

                const storeEmployees =
                  employees.filter(
                    (employee) =>
                      employee.storeId
                        ?.trim()
                        .toUpperCase() ===
                      store.id
                        ?.trim()
                        .toUpperCase(),
                  )

                const storeSchedules =
                  schedules[
                  store.id
                  ] ?? []

                return (

                  <div
                    key={
                      store.id
                    }
                    className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                  >

                    {/* STORE HEADER */}

                    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3">

                      <div className="flex items-center gap-3">

                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                          {
                            store.kode?.slice(
                              -1,
                            ) ??
                            "?"
                          }
                        </div>

                        <div>

                          <p className="text-sm font-semibold leading-tight">
                            {
                              store.nama
                            }
                          </p>

                          <p className="text-xs text-muted-foreground">
                            {
                              formatTanggal(
                                date,
                              )
                            }
                          </p>

                        </div>

                      </div>

                      <span className="rounded-md bg-card px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border">

                        {
                          storeEmployees.length
                        }{" "}
                        karyawan

                      </span>

                    </div>

                    {/* SCHEDULE */}

                    <div className="p-4">

                      {storeEmployees.length ===
                        0 ? (

                        <p className="py-4 text-center text-sm text-muted-foreground">
                          Belum ada karyawan.
                        </p>

                      ) : (

                        <div className="space-y-2">

                          {storeEmployees.map(
                            (
                              employee,
                            ) => {

                              const schedule =
                                storeSchedules.find(
                                  (
                                    item,
                                  ) =>
                                    item.employeeId ===
                                    employee.id,
                                )

                              if (
                                statusFilter !==
                                "all" &&
                                schedule?.status !==
                                statusFilter
                              ) {
                                return null
                              }

                              return (

                                <div
                                  key={
                                    employee.id
                                  }
                                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2"
                                >

                                  <div>

                                    <p className="text-sm font-medium">
                                      {
                                        employee.name ||
                                        "-"
                                      }
                                    </p>

                                    <p className="text-xs text-muted-foreground">
                                      NIK:{" "}
                                      {
                                        employee.nik?.trim() ||
                                        "-"
                                      }
                                    </p>

                                    <p className="text-xs text-muted-foreground">
                                      {
                                        employee.posisi ||
                                        "-"
                                      }
                                    </p>

                                  </div>

                                  <span className="text-xs font-medium text-muted-foreground">

                                    {
                                      schedule
                                        ? STATUS_LABEL[
                                        schedule.status
                                        ]
                                        : "Belum dijadwalkan"
                                    }

                                  </span>

                                </div>

                              )
                            },
                          )}

                        </div>

                      )}

                    </div>

                  </div>

                )
              },
            )}

          </div>

        )}

      </div>

    </div>
  )
}
