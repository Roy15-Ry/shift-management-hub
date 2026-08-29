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
  STATUS_ORDER,
  formatTanggal,
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
      bg: "bg-amber-500",
      text: "text-white",
      ring: "ring-amber-500/30",
    },
    {
      key: "shift_siang",
      bg: "bg-blue-600",
      text: "text-white",
      ring: "ring-blue-600/30",
    },
    {
      key: "libur",
      bg: "bg-red-600",
      text: "text-white",
      ring: "ring-red-600/30",
    },
    {
      key: "sakit",
      bg: "bg-rose-900",
      text: "text-white",
      ring: "ring-rose-900/30",
    },
    {
      key: "izin",
      bg: "bg-violet-600",
      text: "text-white",
      ring: "ring-violet-600/30",
    },
    {
      key: "cuti",
      bg: "bg-emerald-600",
      text: "text-white",
      ring: "ring-emerald-600/30",
    },
  ]

// ============================================================
// KARTU KARYAWAN — STATUS BADGE
// ============================================================

const STATUS_BADGE_CLASS: Record<ShiftStatus, string> = {
  shift_pagi: "bg-amber-500 text-white ring-amber-500/30",
  shift_siang: "bg-blue-600 text-white ring-blue-600/30",
  libur: "bg-red-600 text-white ring-red-600/30",
  cuti: "bg-emerald-600 text-white ring-emerald-600/30",
  izin: "bg-violet-600 text-white ring-violet-600/30",
  sakit: "bg-rose-900 text-white ring-rose-900/30",
}

function statusDisplayLabel(status: ShiftStatus) {
  switch (status) {
    case "shift_pagi":
      return "SHIFT PAGI"
    case "shift_siang":
      return "SHIFT SIANG"
    case "libur":
      return "OFF"
    case "cuti":
      return "CUTI"
    case "izin":
      return "IZIN"
    case "sakit":
      return "SAKIT"
  }
}

// ============================================================
// URUTAN PRIORITAS STATUS KARYAWAN
// ============================================================

const STATUS_PRIORITY: Record<ShiftStatus, number> = {
  shift_pagi: 1,
  shift_siang: 2,
  libur: 3,
  cuti: 4,
  izin: 5,
  sakit: 6,
}

const STORE_HEADER_THEMES = [
  {
    header: "bg-sky-500/10 dark:bg-sky-400/10",
    icon: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-200",
  },
  {
    header: "bg-emerald-500/10 dark:bg-emerald-400/10",
    icon: "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
  },
  {
    header: "bg-violet-500/10 dark:bg-violet-400/10",
    icon: "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200",
  },
  {
    header: "bg-amber-500/10 dark:bg-amber-400/10",
    icon: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
  },
]

const CENTRAL_STORE_HEADER_THEMES = [
  {
    header: "bg-sky-500/12 dark:bg-sky-400/12",
    icon: "bg-sky-500/20 text-sky-800 dark:bg-sky-400/20 dark:text-sky-100",
  },
  {
    header: "bg-emerald-500/12 dark:bg-emerald-400/12",
    icon: "bg-emerald-500/20 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-100",
  },
  {
    header: "bg-violet-500/12 dark:bg-violet-400/12",
    icon: "bg-violet-500/20 text-violet-800 dark:bg-violet-400/20 dark:text-violet-100",
  },
  {
    header: "bg-amber-500/12 dark:bg-amber-400/12",
    icon: "bg-amber-500/20 text-amber-800 dark:bg-amber-400/20 dark:text-amber-100",
  },
  {
    header: "bg-rose-500/12 dark:bg-rose-400/12",
    icon: "bg-rose-500/20 text-rose-800 dark:bg-rose-400/20 dark:text-rose-100",
  },
  {
    header: "bg-teal-500/12 dark:bg-teal-400/12",
    icon: "bg-teal-500/20 text-teal-800 dark:bg-teal-400/20 dark:text-teal-100",
  },
]

function getLocalDateISO(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function addDays(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split("-").map(Number)
  const date = new Date(year, month - 1, day)

  date.setDate(date.getDate() + days)

  return getLocalDateISO(date)
}

function getStoreHeaderTheme(store: FirestoreStore) {
  const identity = store.id || store.kode
  const hash = Array.from(identity).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  )

  return STORE_HEADER_THEMES[
    hash % STORE_HEADER_THEMES.length
  ]
}

function getCentralStoreHeaderTheme(index: number) {
  return CENTRAL_STORE_HEADER_THEMES[
    index % CENTRAL_STORE_HEADER_THEMES.length
  ]
}

function scheduleKey(storeId: string, tanggal: string) {
  return `${storeId}:${tanggal}`
}

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
    React.useState(() => getLocalDateISO())

  const [storeFilter, setStoreFilter] =
    React.useState("all")

  const [branchFilter, setBranchFilter] =
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

  const monitoringDates =
    React.useMemo(
      () =>
        isStore
          ? [date, addDays(date, 1), addDays(date, 2)]
          : [date],
      [date, isStore],
    )

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

          for (const scheduleDate of monitoringDates) {
            scheduleMap[
              scheduleKey(
                store.id,
                scheduleDate,
              )
            ] = await getFirestoreSchedules(
              store.id,
              scheduleDate,
              cabangId,
            )
          }
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
    monitoringDates,
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

  const branchStores =
    React.useMemo(
      () =>
        isCentralPusat &&
        branchFilter !== "all"
          ? accessibleStores.filter(
            (store) =>
              store.cabangId ===
              branchFilter,
          )
          : accessibleStores,
      [
        accessibleStores,
        branchFilter,
        isCentralPusat,
      ],
    )

  const branchOptions =
    React.useMemo(
      () =>
        Array.from(
          new Set(
            accessibleStores
              .map(
                (store) => store.cabangId,
              )
              .filter(Boolean),
          ),
        ),
      [accessibleStores],
    )

  React.useEffect(() => {
    if (
      isCentralPusat &&
      storeFilter !== "all" &&
      !branchStores.some(
        (store) =>
          store.id === storeFilter,
      )
    ) {
      setStoreFilter("all")
    }
  }, [
    branchStores,
    isCentralPusat,
    storeFilter,
  ])

  // ==========================================================
  // STORE TERPILIH
  // ==========================================================

  const visibleStores =
    isStore
      ? accessibleStores
      : storeFilter === "all"
        ? branchStores
        : branchStores.filter(
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
            scheduleKey(
              store.id,
              date,
            )
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
    date === getLocalDateISO() &&
    branchFilter === "all" &&
    storeFilter === "all" &&
    statusFilter === "all"

  function resetFilter() {
    setDate(getLocalDateISO())
    setBranchFilter("all")
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

        <div className="flex flex-col justify-between rounded-xl border border-border bg-primary p-4 text-primary-foreground shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/70 hover:shadow-md">

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
              className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-md"
            >

              <div
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ring-1 ring-inset",
                  m.bg,
                  m.text,
                  m.ring,
                )}
              >
                {
                  statusDisplayLabel(
                  m.key
                  )
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

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-md">

        <div
          className={cn(
            "grid grid-cols-1 gap-3 sm:grid-cols-2",
            isStore
              ? "lg:grid-cols-[1fr_1fr_auto]"
              : isCentralPusat
                ? "lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
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

          {/* CABANG - CENTRAL PUSAT SAJA */}

          {isCentralPusat && (
            <Field label="Cabang">

              <SelectField
                value={branchFilter}
                onChange={setBranchFilter}
                options={[
                  {
                    value: "all",
                    label: "Semua Cabang",
                  },

                  ...branchOptions.map(
                    (cabangId) => ({
                      value: cabangId,
                      label: cabangId,
                    }),
                  ),
                ]}
              />

            </Field>
          )}

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
                      branchStores.length ===
                        1
                        ? branchStores[0]
                          .nama
                        : "Semua Toko",
                  },

                  ...branchStores.map(
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
                      statusDisplayLabel(
                      status
                      ),
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

          <div className={cn(
            "grid grid-cols-1 gap-4",
            !isStore && "xl:grid-cols-2 2xl:grid-cols-3",
          )}>

            {visibleStores.map(
              (store, index) => {

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

                const headerTheme =
                  isStore
                    ? getStoreHeaderTheme(store)
                    : getCentralStoreHeaderTheme(index)

                const cardNumber =
                  isStore
                    ? 1
                    : index + 1

                return (

                  <div
                    key={
                      store.id
                    }
                    className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >

                    {/* STORE HEADER */}

                    <div className={cn(
                      "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
                      headerTheme.header,
                    )}>

                      <div className="flex items-center gap-3">

                        <div className={cn(
                          "flex size-9 items-center justify-center rounded-lg text-sm font-bold",
                          headerTheme.icon,
                        )}>
                          {cardNumber}
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

                        <div className={cn(
                          isStore && "overflow-x-auto pb-1",
                        )}>

                        <div className={cn(
                          "space-y-2",
                          isStore && "grid min-w-[54rem] grid-cols-3 gap-3 space-y-0",
                        )}>

                          {monitoringDates.map(
                            (monitoringDate) => {
                              const storeSchedules =
                                schedules[
                                scheduleKey(
                                  store.id,
                                  monitoringDate,
                                )
                                ] ?? []

                              const sortedEmployees =
                                [...storeEmployees].sort(
                                  (a, b) => {
                                    const statusA =
                                      storeSchedules.find(
                                        (item) =>
                                          item.employeeId ===
                                          a.id,
                                      )?.status
                                    const statusB =
                                      storeSchedules.find(
                                        (item) =>
                                          item.employeeId ===
                                          b.id,
                                      )?.status
                                    const priorityA =
                                      statusA
                                        ? STATUS_PRIORITY[statusA]
                                        : 99
                                    const priorityB =
                                      statusB
                                        ? STATUS_PRIORITY[statusB]
                                        : 99
                                    return priorityA - priorityB
                                  },
                                )

                              return (
                                <div
                                  key={monitoringDate}
                                  className={cn(
                                    "min-w-0 space-y-2",
                                    isStore && "rounded-lg border border-border bg-muted/20 p-3",
                                  )}
                                >

                                  {isStore && (
                                    <p className="text-xs font-semibold text-muted-foreground">
                                      {formatTanggal(monitoringDate)}
                                    </p>
                                  )}

                                  {sortedEmployees.map(
                                    (employee) => {
                                      const schedule =
                                        storeSchedules.find(
                                          (item) =>
                                            item.employeeId ===
                                            employee.id,
                                        )

                                      if (
                                        statusFilter !== "all" &&
                                        schedule?.status !== statusFilter
                                      ) {
                                        return null
                                      }

                                      return (
                                        <div
                                          key={employee.id}
                                          className={cn(
                                            "flex rounded-lg border border-border bg-muted/20 transition-colors hover:bg-muted/40",
                                            isStore
                                              ? "flex-row items-center justify-between gap-3 px-3 py-2.5"
                                              : "items-center justify-between px-3 py-2",
                                          )}
                                        >

                                          <div className="min-w-0">

                                            <p className="text-sm font-medium">
                                              {employee.name || "-"}
                                            </p>

                                            <p className="text-xs text-muted-foreground">
                                              NIK: {employee.nik?.trim() || "-"}
                                            </p>

                                            <p className="text-xs text-muted-foreground">
                                              {employee.posisi || "-"}
                                            </p>

                                          </div>

                                          {schedule ? (
                                            <span
                                              className={cn(
                                                "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-bold ring-1 ring-inset",
                                                isStore
                                                  ? "min-w-32 px-3 py-2 text-sm"
                                                  : "min-w-28 px-2.5 py-1 text-[13px]",
                                                STATUS_BADGE_CLASS[schedule.status],
                                              )}
                                            >
                                              {statusDisplayLabel(schedule.status)}
                                            </span>
                                          ) : (
                                            <span
                                              className={cn(
                                                "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-semibold ring-1 ring-inset",
                                                isStore
                                                  ? "min-w-32 bg-muted px-3 py-2 text-sm text-muted-foreground ring-border"
                                                  : "min-w-28 bg-muted px-2.5 py-1 text-[13px] text-muted-foreground ring-border",
                                              )}
                                            >
                                              Belum dijadwalkan
                                            </span>
                                          )}

                                        </div>
                                      )
                                    },
                                  )}

                                </div>
                              )
                            },
                          )}

                        </div>

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
