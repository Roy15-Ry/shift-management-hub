"use client"

import * as React from "react"
import { BarChart3, RotateCcw, Store as StoreIcon } from "lucide-react"

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

import { DashboardJadwalLibur } from "@/components/pages/dashboard-jadwal-libur"

// ============================================================
// ADDITIONAL SELLING TYPES & HELPERS
// ============================================================

type PenjualanJenis = "ADDITIONAL_SELLING" | "UPSIZE_BOTOL" | "SELLING_EKSKLUSIF_PERFUME"

const JENIS_LABEL: Record<PenjualanJenis, string> = {
  ADDITIONAL_SELLING: "Additional Selling",
  UPSIZE_BOTOL: "Upsize Botol",
  SELLING_EKSKLUSIF_PERFUME: "Selling Eksklusif Perfume",
}

const JENIS_LIST: PenjualanJenis[] = [
  "ADDITIONAL_SELLING",
  "UPSIZE_BOTOL",
  "SELLING_EKSKLUSIF_PERFUME",
]

function formatRupiah(value: number): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  return `Rp${safe.toLocaleString("id-ID")}`
}

function formatNilai(jenis: PenjualanJenis, value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return jenis === "ADDITIONAL_SELLING"
    ? formatRupiah(safe)
    : `${safe.toLocaleString("id-ID")} PCS`
}

// ============================================================// KETERSEDIAAN EMPLOYEE PER TANGGAL MONITORING
//
// Employee "tersedia" pada suatu tanggal monitoring bila masih
// AKTIF, atau bila NONAKTIF tetapi tanggalNonaktif-nya belum lewat
// dari tanggal monitoring tersebut (tanggalNonaktif = hari terakhir
// employee masih tersedia secara operasional).
// ============================================================

function isEmployeeAvailableOn(
  employee: FirestoreEmployee,
  tanggal: string,
): boolean {
  return (
    employee.aktif !== false ||
    (typeof employee.tanggalNonaktif === "string" &&
      employee.tanggalNonaktif >= tanggal)
  )
}

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
      bg: "bg-green-500",
      text: "text-white",
      ring: "ring-green-500/30",
    },
    {
      key: "shift_siang",
      bg: "bg-blue-500",
      text: "text-white",
      ring: "ring-blue-500/30",
    },
    {
      key: "libur",
      bg: "bg-red-500",
      text: "text-white",
      ring: "ring-red-500/30",
    },
    {
      key: "sakit",
      bg: "bg-red-500",
      text: "text-white",
      ring: "ring-red-500/30",
    },
    {
      key: "izin",
      bg: "bg-red-500",
      text: "text-white",
      ring: "ring-red-500/30",
    },
    {
      key: "cuti",
      bg: "bg-red-500",
      text: "text-white",
      ring: "ring-red-500/30",
    },
  ]

// ============================================================
// KARTU KARYAWAN — STATUS BADGE
// ============================================================

const STATUS_BADGE_CLASS: Record<ShiftStatus, string> = {
  shift_pagi: "bg-green-500 text-white ring-green-500/30",
  shift_siang: "bg-blue-500 text-white ring-blue-500/30",
  libur: "bg-red-500 text-white ring-red-500/30",
  cuti: "bg-red-500 text-white ring-red-500/30",
  izin: "bg-red-500 text-white ring-red-500/30",
  sakit: "bg-red-500 text-white ring-red-500/30",
}

function statusDisplayLabel(status: ShiftStatus) {
  switch (status) {
    case "shift_pagi":
      return "SHIFT PAGI"
    case "shift_siang":
      return "SHIFT SIANG"
    case "libur":
      return "LIBUR"
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
            ...storeEmployees,
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
            !isStore && "xl:grid-cols-3",
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
                          storeEmployees.filter(
                            (employee) =>
                              isEmployeeAvailableOn(
                                employee,
                                date,
                              ),
                          ).length
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

                              const dateEmployees =
                                storeEmployees.filter(
                                  (employee) =>
                                    isEmployeeAvailableOn(
                                      employee,
                                      monitoringDate,
                                    ),
                                )

                              const sortedEmployees =
                                [...dateEmployees].sort(
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

      {/* ================================================== */}
      {/* JADWAL LIBUR — STORE ONLY (READ-ONLY) */}
      {/* ================================================== */}

      {isStore && (
        <DashboardJadwalLibur />
      )}

      {/* ================================================== */}
      {/* GRAFIK PENCAPAIAN PROGRAM */}
      {/* ================================================== */}

      {(isStore ||
        isCentralCabang ||
        isCentralPusat) && (
        <ProgramAchievementBarChart
          centralPusat={isCentralPusat}
          cabang={
            isCentralPusat
              ? branchFilter
              : ""
          }
        />
      )}

    </div>
  )
}

// ============================================================
// GRAFIK PENCAPAIAN PROGRAM
// ============================================================
//
// SATU chart, vertical grouped bar, satu toko = satu grup
// dengan TIGA batang (satu per program).
//
// MAKNA BATANG
//   Batang = REALISASI program pada toko tersebut.
//   Target TIDAK digambar sebagai batang kedua; target hanya
//   tersedia pada tooltip. Jadi selalu 3 bar per toko, bukan
//   6 bar.
//
// SATUAN
//   Additional Selling        -> Rupiah (Rp…)
//   Upsize Botol              -> PCS
//   Selling Eksklusif Perfume -> PCS
//   Unit asli dipertahankan di tooltip. Tidak ada persen
//   sebagai nilai utama.
//
// SKALA TINGGI (INTERNAL, BUKAN DATA)
//   Tiga program memakai satuan berbeda sehingga tidak dapat
//   dibandingkan pada satu skala angka. Tinggi bar dihitung
//   per program dari TARGET terbesar program tersebut, bukan
//   dari realisasi terbesar: bila scale memakai realisasi,
//   satu-satunya data non-zero selalu menjadi 100% tinggi.
//   Ini hanya mekanisme rendering: tidak ada angka yang
//   ditampilkan, tidak ada field baru, tidak ada write, dan
//   nilai Target/Realisasi pada tooltip tetap angka asli dari
//   server.
//
// DATA
//   Satu request ke /api/additional-selling/chart. Server
//   hanya mengirim storeId, storeName, totalTarget, dan
//   totalAchievement per program. Tidak ada transaksi,
//   nama karyawan, atau target individual.
//
// PERIODE
//   Kontrak API month = 0-11, jadi now.getMonth() tanpa +1.
// ============================================================

type ChartJenis = {
  totalTarget: number
  totalAchievement: number
}

type ChartStore = {
  storeId: string
  storeName: string
  byJenis: Partial<
    Record<PenjualanJenis, ChartJenis>
  >
}

type ChartResponse = {
  success?: boolean
  message?: string
  stores?: ChartStore[]
}

type ChartSeriesItem = {
  jenis: PenjualanJenis
  target: number
  achievement: number
}

type ChartRow = {
  storeId: string
  storeName: string
  series: ChartSeriesItem[]
}

type ChartTip = {
  left: number
  top: number
  storeName: string
  jenis: PenjualanJenis
  target: number
  achievement: number
}

const CHART_TONE: Record<
  PenjualanJenis,
  { fill: string; glow: string }
> = {
  ADDITIONAL_SELLING: {
    fill: "bg-emerald-500",
    glow: "shadow-emerald-500/45",
  },
  UPSIZE_BOTOL: {
    fill: "bg-blue-500",
    glow: "shadow-blue-500/45",
  },
  SELLING_EKSKLUSIF_PERFUME: {
    fill: "bg-fuchsia-500",
    glow: "shadow-fuchsia-500/45",
  },
}

// Tinggi bar = REALISASI dibagi SKALA TARGET program, yaitu
// target terbesar antar toko pada cabang terpilih.
//
// Scale memakai TARGET, bukan realisasi terbesar: kalau
// scale memakai realisasi, satu-satunya data non-zero selalu
// menjadi 100% dan tinggi bar tidak lagi mewakili pencapaian.
//
// Rasio ini murni internal penentuan tinggi. Tidak pernah
// disimpan dan tidak pernah ditampilkan sebagai angka, jadi
// satuan tetap Rp / PCS dan tidak ada persentase di UI.
//
// Realisasi 0 menghasilkan bar tanpa tinggi. Bar hanya
// mendapat floor 0.5% agar realisasi non-zero yang sangat
// kecil masih terlihat.
function chartBarHeight(
  value: number,
  scale: number,
): number {
  if (value <= 0 || scale <= 0) {
    return 0
  }

  return Math.max(
    0.5,
    Math.min(100, (value / scale) * 100),
  )
}

function ProgramAchievementBarChart({
  centralPusat,
  cabang,
}: {
  centralPusat: boolean
  cabang: string
}) {
  const { user } = useAuth()

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [stores, setStores] =
    React.useState<ChartStore[]>([])
  const [tip, setTip] =
    React.useState<ChartTip | null>(null)

  // Central Pusat belum memilih cabang: TIDAK ada request
  // sama sekali, karena API menolak value "ALL" (mekanisme
  // existing). Branch selector tidak diubah.
  const cabangDipilih =
    !centralPusat ||
    (!!cabang && cabang !== "all")

  React.useEffect(() => {
    if (!user) {
      return
    }

    if (!cabangDipilih) {
      setStores([])
      setTip(null)
      setError("")
      setLoading(false)
      return
    }

    let mounted = true

    const authedUser = user

    async function fetchChart() {
      try {
        setLoading(true)
        setError("")

        const now = new Date()

        // Kontrak API: month 0-11.
        const params = new URLSearchParams({
          year: String(now.getFullYear()),
          month: String(now.getMonth()),
        })

        if (centralPusat) {
          params.set("cabang", cabang)
        }

        const idToken =
          await authedUser.getIdToken()

        const response = await fetch(
          `/api/additional-selling/chart?${params.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
            cache: "no-store",
          },
        )

        const result = (await response
          .json()
          .catch(() => null)) as ChartResponse | null

        if (!mounted) {
          return
        }

        if (!response.ok || !result?.success) {
          setStores([])
          setTip(null)
          setError(
            result?.message ||
              "Gagal memuat data pencapaian program.",
          )
          return
        }

        setStores(
          Array.isArray(result.stores)
            ? result.stores
            : [],
        )
      } catch {
        if (mounted) {
          setStores([])
          setError(
            "Gagal memuat data pencapaian program.",
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchChart()

    return () => {
      mounted = false
    }
  }, [user, centralPusat, cabang, cabangDipilih])

  // ------------------------------------------------------------
  // BARIS CHART — langsung dari response chart
  // ------------------------------------------------------------
  //
  // Urutan toko mengikuti urutan server (nama toko A-Z).
  // Tidak ada sampling dan tidak ada top-N.

  const rows = React.useMemo<ChartRow[]>(() => {
    return stores.map((store) => ({
      storeId: store.storeId,
      storeName: store.storeName || store.storeId,
      series: JENIS_LIST.map((jenis) => {
        const cell = store.byJenis?.[jenis]

        return {
          jenis,
          target: cell?.totalTarget ?? 0,
          achievement: cell?.totalAchievement ?? 0,
        }
      }),
    }))
  }, [stores])

  // Skala visual per program: TARGET terbesar antar toko
  // pada cabang terpilih. Target hanya dipakai sebagai batas
  // tinggi bar — sudah tampil di tooltip dan tidak pernah
  // digambar sebagai batang kedua.

  const scaleByJenis =
    React.useMemo(() => {
      const scale: Record<
        PenjualanJenis,
        number
      > = {
        ADDITIONAL_SELLING: 0,
        UPSIZE_BOTOL: 0,
        SELLING_EKSKLUSIF_PERFUME: 0,
      }

      for (const row of rows) {
        for (const item of row.series) {
          scale[item.jenis] = Math.max(
            scale[item.jenis],
            item.target,
          )
        }
      }

      return scale
    }, [rows])

  // ------------------------------------------------------------
  // RANKING REALISASI — TOP 5 PER PROGRAM
  // ------------------------------------------------------------
  //
  // Diturunkan dari state `stores` yang sama persis dengan bar
  // chart di atas. Tanpa fetch, query, collection, atau field
  // tambahan, sehingga jumlah request browser dan read Firestore
  // tidak berubah sama sekali.
  //
  // Yang diurutkan hanya `totalAchievement` (realisasi).
  // `totalTarget` tidak dipakai, jadi panel ini tidak pernah
  // menampilkan persentase, progress, atau perbandingan
  // gabungan antar program.
  //
  // `stores` sudah diurutkan A-Z oleh server dan `sort` di bawah
  // stabil, sehingga realisasi yang sama otomatis mengikuti
  // urutan A-Z tersebut. Tidak ada tie-break acak.
  //
  // Array `stores` asli tidak dimutasi: map -> filter -> sort
  // -> slice menghasilkan array baru per program.

  const rankingByJenis =
    React.useMemo(
      () =>
        JENIS_LIST.map((jenis) => ({
          jenis,
          items: stores
            .map((store) => ({
              storeId: store.storeId,
              storeName: store.storeName,
              achievement:
                store.byJenis?.[jenis]
                  ?.totalAchievement ?? 0,
            }))
            .filter((item) => item.achievement > 0)
            .sort(
              (a, b) =>
                b.achievement - a.achievement,
            )
            .slice(0, 5),
        })),
      [stores],
    )

  function showTip(
    event: React.SyntheticEvent<HTMLElement>,
    storeName: string,
    item: ChartSeriesItem,
  ) {
    const rect =
      event.currentTarget.getBoundingClientRect()

    setTip({
      left: rect.left + rect.width / 2,
      top: rect.top,
      storeName,
      jenis: item.jenis,
      target: item.target,
      achievement: item.achievement,
    })
  }

  const empty = rows.length === 0

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-sm">

      {/* HEADER */}
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-zinc-200 ring-1 ring-inset ring-white/10">
          <BarChart3 className="size-5" />
        </span>

        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-zinc-100">
            Grafik Pencapaian Per Program
          </h2>
          <p className="text-xs text-zinc-400">
            Target dan realisasi per program, antar toko
          </p>
        </div>
      </div>

      {/* LEGEND */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {JENIS_LIST.map((jenis) => (
          <span
            key={jenis}
            className="inline-flex items-center gap-2 text-[11px] font-medium text-zinc-300"
          >
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                CHART_TONE[jenis].fill,
              )}
            />
            {JENIS_LABEL[jenis]}
          </span>
        ))}
      </div>

      {/* BODY */}
      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] py-16 text-sm text-zinc-400">
          Memuat data pencapaian program...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
          {error}
        </div>
      )}

      {!loading &&
        !error &&
        empty &&
        !cabangDipilih && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-white/5 text-zinc-400">
            <BarChart3 className="size-5" />
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            Pilih cabang terlebih dahulu
          </p>
          <p className="max-w-sm text-sm text-zinc-400">
            Grafik menampilkan toko pada
            cabang yang dipilih.
          </p>
        </div>
      )}

      {!loading && !error && empty && cabangDipilih && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-white/5 text-zinc-400">
            <StoreIcon className="size-5" />
          </div>
          <p className="text-sm font-semibold text-zinc-200">
            Belum ada toko
          </p>
          <p className="max-w-sm text-sm text-zinc-400">
            Cakupan ini belum memiliki toko.
            Hubungi admin untuk menambahkan
            toko.
          </p>
        </div>
      )}

      {!loading && !error && !empty && (
        <div className="grid gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          {/* Scroll horizontal DIBATAS di area plot,
              halaman tidak pernah overflow horizontal. */}
          <div
            className="w-full min-w-0 overflow-x-auto"
            onScroll={() => setTip(null)}
          >
            <div className="min-w-max">
              {/* BATANG + GRID */}
              <div className="relative flex h-72 items-stretch gap-3">
                {/* Grid horizontal subtle — tanpa
                    label angka karena satuan antar
                    program berbeda. */}
                {[25, 50, 75, 100].map((tick) => (
                  <div
                    key={tick}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/5"
                    style={{
                      bottom: `${tick}%`,
                    }}
                  />
                ))}

                {/* Garis dasar */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-white/10"
                />

                {rows.map((row) => (
                  <div
                    key={row.storeId}
                    className="group/store relative flex w-[76px] shrink-0 flex-col justify-end"
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-lg transition-colors duration-200 group-hover/store:bg-white/[0.04]"
                    />

                    <div className="absolute inset-0 flex items-end justify-center gap-1 px-1.5">
                      {row.series.map((item) => {
                        const tone =
                          CHART_TONE[item.jenis]

                        const tinggi =
                          chartBarHeight(
                            item.achievement,
                            scaleByJenis[item.jenis],
                          )

                        return (
                          <div
                            key={item.jenis}
                            tabIndex={0}
                            aria-label={`${row.storeName} — ${JENIS_LABEL[item.jenis]}. Target ${formatNilai(item.jenis, item.target)}. Realisasi ${formatNilai(item.jenis, item.achievement)}`}
                            className={cn(
                              "w-full max-w-[20px] shrink-0 cursor-default rounded-t-[4px] outline-none",
                              "transition-[filter,opacity] duration-200",
                              "hover:brightness-110 focus-visible:brightness-110",
                              tone.fill,
                              tone.glow,
                            )}
                            style={{
                              height: `${tinggi}%`,
                            }}
                            onMouseEnter={(
                              event,
                            ) =>
                              showTip(
                                event,
                                row.storeName,
                                item,
                              )
                            }
                            onFocus={(event) =>
                              showTip(
                                event,
                                row.storeName,
                                item,
                              )
                            }
                            onMouseLeave={() =>
                              setTip(null)
                            }
                            onBlur={() =>
                              setTip(null)
                            }
                          />
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* SUMBU X — nama toko, lebar kolom sama
                  dengan batang di atas. */}
              <div className="mt-2 flex gap-3">
                {rows.map((row) => (
                  <p
                    key={row.storeId}
                    className="w-[76px] shrink-0 truncate text-center text-[10px] text-zinc-400"
                    title={row.storeName}
                  >
                    {row.storeName}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* RANKING REALISASI — TOP 5 PER PROGRAM.
              Di kanan chart pada xl+, di bawah chart pada
              layar lebih kecil. Broker perubahan tinggi bar,
              tooltip, dan gridline. */}
          <aside className="min-w-0 border-t border-white/5 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-100">
              Ranking Pencapaian Tertinggi
            </h3>

            <div className="mt-3 space-y-4">
              {rankingByJenis.map((group) => (
                <section key={group.jenis}>
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-[2px]",
                        CHART_TONE[group.jenis].fill,
                      )}
                    />
                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      {JENIS_LABEL[group.jenis]}
                    </h4>
                  </div>

                  {group.items.length === 0 ? (
                    <p className="mt-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-[11px] leading-relaxed text-zinc-400">
                      Belum ada
                      realisasi pada
                      program ini.
                    </p>
                  ) : (
                    <ol className="mt-2 space-y-1.5">
                      {group.items.map(
                        (item, index) => (
                          <li
                            key={item.storeId}
                            className="flex items-baseline gap-2"
                          >
                            <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">
                              {index + 1}.
                            </span>
                            <span
                              className="min-w-0 flex-1 truncate text-[11px] text-zinc-300"
                              title={item.storeName}
                            >
                              {item.storeName}
                            </span>
                            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-zinc-100">
                              {formatNilai(
                                group.jenis,
                                item.achievement,
                              )}
                            </span>
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* TOOLTIP — Target dan Realisasi dalam satuan
          asli. */}
      {tip && (
        <div
          role="tooltip"
          style={{
            left: tip.left,
            top: tip.top,
          }}
          className="pointer-events-none fixed z-50 w-max max-w-56 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 shadow-xl"
        >
          <p className="text-xs font-semibold text-zinc-100">
            {tip.storeName}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {JENIS_LABEL[tip.jenis]}
          </p>

          <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
            <p className="text-[11px] text-zinc-400">
              Target:{" "}
              <span className="font-semibold tabular-nums text-zinc-100">
                {formatNilai(
                  tip.jenis,
                  tip.target,
                )}
              </span>
            </p>
            <p className="text-[11px] text-zinc-400">
              Realisasi:{" "}
              <span className="font-semibold tabular-nums text-zinc-100">
                {formatNilai(
                  tip.jenis,
                  tip.achievement,
                )}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
