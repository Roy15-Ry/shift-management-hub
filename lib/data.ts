// ============================================================
// SHIFT MANAGEMENT HUB — Data Layer
// ============================================================

export type ShiftStatus =
  | "shift_pagi"
  | "shift_siang"
  | "libur"
  | "cuti"
  | "izin"
  | "sakit"

export const STATUS_LABEL: Record<ShiftStatus, string> = {
  shift_pagi: "Shift Pagi",
  shift_siang: "Shift Siang",
  libur: "Libur",
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
}

export const STATUS_ORDER: ShiftStatus[] = [
  "shift_pagi",
  "shift_siang",
  "libur",
  "sakit",
  "izin",
  "cuti",
]

// ============================================================
// EMPLOYEE
// ============================================================

export type Employee = {
  id: string
  name: string
  nik: string
  storeId: string
  posisi: string
  aktif: boolean
}

// ============================================================
// STORE
// ============================================================

export type Store = {
  id: string
  name: string
  kode: string
  akunStore: string
  aktif: boolean
}

// ============================================================
// DATA TOKO
// ============================================================

export let stores: Store[] = [
  {
    id: "A",
    name: "Toko A",
    kode: "TKA",
    akunStore: "Store A",
    aktif: true,
  },
  {
    id: "B",
    name: "Toko B",
    kode: "TKB",
    akunStore: "Store B",
    aktif: true,
  },
  {
    id: "C",
    name: "Toko C",
    kode: "TKC",
    akunStore: "Store C",
    aktif: true,
  },
  {
    id: "D",
    name: "Toko D",
    kode: "TKD",
    akunStore: "Store D",
    aktif: true,
  },
]

// ============================================================
// CRUD TOKO
// ============================================================

let storeSeq = 0

/**
 * Mengambil semua toko.
 */
export function getStores(): Store[] {
  return stores
}

/**
 * Mengambil satu toko berdasarkan ID.
 */
export function getStore(
  storeId: string,
): Store | undefined {
  return stores.find(
    (store) => store.id === storeId,
  )
}

/**
 * Menambah toko baru.
 */
export function addStore(
  name: string,
  kode: string,
  akunStore: string,
  aktif: boolean = true,
): Store {
  storeSeq += 1

  const newStore: Store = {
    id: `STORE-${Date.now()}-${storeSeq}`,
    name: String(name).trim(),
    kode: String(kode).trim().toUpperCase(),
    akunStore: String(akunStore).trim(),
    aktif,
  }

  stores = [
    ...stores,
    newStore,
  ]

  return newStore
}

/**
 * Mengedit toko.
 */
export function updateStore(
  storeId: string,
  data: Partial<
    Pick<
      Store,
      "name" | "kode" | "akunStore" | "aktif"
    >
  >,
): Store | undefined {
  let updatedStore:
    | Store
    | undefined

  stores = stores.map((store) => {
    if (store.id !== storeId) {
      return store
    }

    updatedStore = {
      ...store,
      ...data,

      name:
        data.name !== undefined
          ? data.name.trim()
          : store.name,

      kode:
        data.kode !== undefined
          ? data.kode
            .trim()
            .toUpperCase()
          : store.kode,

      akunStore:
        data.akunStore !== undefined
          ? data.akunStore.trim()
          : store.akunStore,
    }

    return updatedStore
  })

  return updatedStore
}

/**
 * Menghapus toko.
 *
 * Karyawan yang berada di toko tersebut
 * juga ikut dihapus.
 */
export function deleteStore(
  storeId: string,
): boolean {
  const exists = stores.some(
    (store) =>
      store.id === storeId,
  )

  if (!exists) {
    return false
  }

  stores = stores.filter(
    (store) =>
      store.id !== storeId,
  )

  employees = employees.filter(
    (employee) =>
      employee.storeId !== storeId,
  )

  return true
}

// ============================================================
// POSISI
// ============================================================

const POSISI = [
  "Kepala Toko",
  "Kasir",
  "Pramuniaga",
  "Gudang",
  "Supervisor",
]

// ============================================================
// EMPLOYEE DATA AWAL
// ============================================================

const rawEmployees: Record<
  string,
  string[]
> = {
  A: [
    "Anwar",
    "Saepul",
    "Edi",
    "Gunda",
    "Rudi",
    "Andi",
    "Budi",
    "Citra",
  ],

  B: [
    "Fajar",
    "Rizal",
    "Doni",
    "Hendra",
    "Wawan",
    "Sari",
    "Lukman",
  ],

  C: [
    "Bagas",
    "Yoga",
    "Tomi",
    "Nanda",
    "Reza",
    "Iwan",
    "Dewi",
    "Putra",
    "Galih",
    "Ade",
  ],

  D: [
    "Surya",
    "Bayu",
    "Eko",
    "Wahyu",
    "Dimas",
    "Rina",
    "Joko",
  ],
}

// ============================================================
// EMPLOYEE
// ============================================================

export let employees: Employee[] =
  Object.entries(
    rawEmployees,
  ).flatMap(
    ([storeId, names]) =>
      names.map(
        (name, i) => ({
          id: `${storeId}-${i + 1}`,

          name,

          // NIK prototype.
          // Nanti dapat diganti dengan NIK
          // seperti TP9901120226.
          nik: `TP${String(
            99,
          )}${String(
            storeId.charCodeAt(0),
          ).padStart(
            2,
            "0",
          )}${String(
            i + 1,
          ).padStart(
            6,
            "0",
          )}`,

          storeId,

          posisi:
            POSISI[
            (i +
              storeId.charCodeAt(
                0,
              )) %
            POSISI.length
            ],

          aktif: !(
            storeId === "C" &&
            i === 9
          ),
        }),
      ),
  )

// ============================================================
// CRUD EMPLOYEE
// ============================================================

/**
 * Mengambil karyawan berdasarkan toko.
 */
export function employeesByStore(
  storeId: string,
): Employee[] {
  return employees.filter(
    (employee) =>
      employee.storeId === storeId,
  )
}

/**
 * Mengambil satu karyawan berdasarkan ID.
 */
export function getEmployee(
  employeeId: string,
): Employee | undefined {
  return employees.find(
    (employee) =>
      employee.id === employeeId,
  )
}

/**
 * Menambah karyawan.
 */
export function addEmployee(
  data: Omit<
    Employee,
    "id"
  >,
): Employee {
  const newEmployee: Employee = {
    ...data,

    name: data.name.trim(),

    nik: data.nik
      .trim()
      .toUpperCase()
      .replace(/\s/g, ""),

    posisi:
      data.posisi.trim(),
  }

  newEmployee.id =
    `${data.storeId}-NEW-${Date.now()}`

  employees = [
    ...employees,
    newEmployee,
  ]

  return newEmployee
}

/**
 * Mengedit karyawan.
 */
export function updateEmployee(
  employeeId: string,
  data: Partial<
    Omit<Employee, "id">
  >,
): Employee | undefined {
  let updated:
    | Employee
    | undefined

  employees = employees.map(
    (employee) => {
      if (
        employee.id !==
        employeeId
      ) {
        return employee
      }

      updated = {
        ...employee,
        ...data,

        name:
          data.name !==
            undefined
            ? data.name.trim()
            : employee.name,

        nik:
          data.nik !==
            undefined
            ? data.nik
              .trim()
              .toUpperCase()
              .replace(
                /\s/g,
                "",
              )
            : employee.nik,

        posisi:
          data.posisi !==
            undefined
            ? data.posisi.trim()
            : employee.posisi,
      }

      return updated
    },
  )

  return updated
}

/**
 * Menghapus karyawan.
 */
export function deleteEmployee(
  employeeId: string,
): boolean {
  const exists =
    employees.some(
      (employee) =>
        employee.id ===
        employeeId,
    )

  if (!exists) {
    return false
  }

  employees =
    employees.filter(
      (employee) =>
        employee.id !==
        employeeId,
    )

  return true
}

// ============================================================
// SCHEDULE GENERATION
// ============================================================

function baseStatus(
  empIndex: number,
  day: number,
): ShiftStatus {
  const seed =
    (empIndex * 13 +
      day * 7) %
    21

  if (seed === 3)
    return "cuti"

  if (seed === 8)
    return "izin"

  if (seed === 15)
    return "sakit"

  if (seed % 5 === 0)
    return "libur"

  return (
    (empIndex + day) %
    2 ===
    0
  )
    ? "shift_pagi"
    : "shift_siang"
}

// ============================================================
// OVERRIDE SCHEDULE
// ============================================================

const overrides: Record<
  string,
  ShiftStatus
> = {}

function setOverride(
  storeId: string,
  dateISO: string,
  map: Record<
    ShiftStatus,
    string[]
  >,
) {
  const emps =
    employeesByStore(
      storeId,
    )

    ; (
      Object.keys(
        map,
      ) as ShiftStatus[]
    ).forEach(
      (status) => {
        map[status].forEach(
          (name) => {
            const emp =
              emps.find(
                (employee) =>
                  employee.name ===
                  name,
              )

            if (emp) {
              overrides[
                `${storeId}:${dateISO}:${emp.id}`
              ] = status
            }
          },
        )
      },
    )
}

// ============================================================
// OVERRIDE DATA
// ============================================================

setOverride(
  "A",
  "2026-08-20",
  {
    shift_pagi: [
      "Anwar",
      "Saepul",
    ],

    shift_siang: [
      "Edi",
      "Gunda",
    ],

    libur: ["Rudi"],

    izin: ["Andi"],

    sakit: ["Budi"],

    cuti: ["Citra"],
  },
)

setOverride(
  "A",
  "2026-08-12",
  {
    shift_pagi: [
      "Anwar",
      "Saepul",
    ],

    shift_siang: [
      "Edi",
      "Gunda",
    ],

    libur: ["Rudi"],

    izin: [],

    sakit: [],

    cuti: [],
  },
)

setOverride(
  "B",
  "2026-08-12",
  {
    shift_pagi: [
      "Fajar",
      "Rizal",
      "Doni",
    ],

    shift_siang: [
      "Fajar",
      "Rizal",
    ],

    libur: [],

    izin: [],

    sakit: [],

    cuti: [],
  },
)

// ============================================================
// GET EMPLOYEE STATUS
// ============================================================

export function getEmployeeStatus(
  emp: Employee,
  dateISO: string,
): ShiftStatus {
  const ov =
    overrides[
    `${emp.storeId}:${dateISO}:${emp.id}`
    ]

  if (ov) {
    return ov
  }

  const empIndex =
    Number(
      emp.id.split(
        "-",
      )[1],
    ) - 1

  const day =
    Number(
      dateISO.split(
        "-",
      )[2],
    )

  return baseStatus(
    empIndex,
    day,
  )
}

// ============================================================
// GROUPED DAY
// ============================================================

export type GroupedDay =
  Record<
    ShiftStatus,
    Employee[]
  >

export function getStoreDay(
  storeId: string,
  dateISO: string,
): GroupedDay {
  const grouped: GroupedDay =
  {
    shift_pagi: [],
    shift_siang: [],
    libur: [],
    cuti: [],
    izin: [],
    sakit: [],
  }

  employeesByStore(
    storeId,
  ).forEach(
    (emp) => {
      grouped[
        getEmployeeStatus(
          emp,
          dateISO,
        )
      ].push(emp)
    },
  )

  return grouped
}

// ============================================================
// SUMMARY
// ============================================================

export type Summary =
  Record<
    ShiftStatus,
    number
  > & {
    totalToko: number
  }

export function getSummary(
  dateISO: string,
  storeIds: string[],
): Summary {
  const summary: Summary =
  {
    totalToko:
      storeIds.length,

    shift_pagi: 0,

    shift_siang: 0,

    libur: 0,

    cuti: 0,

    izin: 0,

    sakit: 0,
  }

  storeIds.forEach(
    (storeId) => {
      const day =
        getStoreDay(
          storeId,
          dateISO,
        )

      STATUS_ORDER.forEach(
        (status) => {
          summary[
            status
          ] +=
            day[
              status
            ].length
        },
      )
    },
  )

  return summary
}

// ============================================================
// REVISI ABSENSI
// ============================================================

export type RevisiStatus =
  | "BARU"
  | "PROSES"
  | "SELESAI"

// ============================================================
// JENIS REVISI ABSENSI
// ============================================================

export const REVISI_JENIS_LAINNYA = "lainnya"

export type RevisiJenis =
  | "tukar_shift"
  | "lupa_absen_masuk"
  | "lupa_absen_pulang"
  | "sistem_error"
  | "perubahan_kehadiran"
  | "penyesuaian_jam"
  | "lainnya"

export const REVISI_JENIS_ITEMS: {
  value: RevisiJenis
  label: string
  description: string
}[] = [
  {
    value: "tukar_shift",
    label: "Tukar Shift",
    description:
      "Karyawan bertukar jadwal shift dengan karyawan lain.",
  },
  {
    value: "lupa_absen_masuk",
    label: "Lupa Absen Masuk",
    description:
      "Karyawan lupa melakukan absensi saat masuk kerja.",
  },
  {
    value: "lupa_absen_pulang",
    label: "Lupa Absen Pulang",
    description:
      "Karyawan lupa melakukan absensi saat selesai bekerja.",
  },
  {
    value: "sistem_error",
    label: "Tidak Bisa Absen — Sistem Error",
    description:
      "Karyawan tidak dapat melakukan absensi karena kendala sistem, perangkat, jaringan, atau kendala teknis lainnya.",
  },
  {
    value: "perubahan_kehadiran",
    label: "Perubahan Status Kehadiran",
    description:
      "Digunakan apabila status kehadiran berubah, misalnya menjadi izin, sakit, cuti, libur, atau kondisi lainnya.",
  },
  {
    value: "penyesuaian_jam",
    label: "Penyesuaian Jam Kerja",
    description:
      "Digunakan apabila terdapat kegiatan atau kondisi khusus yang menyebabkan jam masuk atau jam pulang berbeda dari jadwal normal.",
  },
  {
    value: "lainnya",
    label: "Lainnya",
    description:
      "Untuk kejadian yang tidak termasuk dalam pilihan yang tersedia.",
  },
]

export function getRevisiJenisItem(
  value?: string | null,
) {
  return REVISI_JENIS_ITEMS.find(
    (item) =>
      item.value === value,
  )
}

export type Revisi = {
  id: string
  storeId: string
  cabangId?: string
  storeName?: string
  employeeId?: string
  employeeName: string
  tanggal: string
  jenisRevisi?: string
  jenisRevisiLainnya?: string
  jadwalShift?: ShiftStatus
  // Bidang legacy (tidak dipakai formulir baru, dipertahankan
  // agar data lama tetap terbaca).
  shiftSebelumnya?: ShiftStatus
  statusBaru?: ShiftStatus
  alasan?: string
  keterangan: string
  tanggalPengajuan: string
  status: RevisiStatus
  prosesAt?: string
  prosesOleh?: string
}

let revisiSeq = 0

function mkRevisi(
  storeId: string,
  employeeName: string,
  tanggal: string,
  shiftSebelumnya: ShiftStatus,
  statusBaru: ShiftStatus,
  keterangan: string,
  tanggalPengajuan: string,
  status: RevisiStatus,
): Revisi {
  revisiSeq += 1

  return {
    id: `REV-${String(
      revisiSeq,
    ).padStart(
      4,
      "0",
    )}`,

    storeId,

    employeeName,

    tanggal,

    shiftSebelumnya,

    statusBaru,

    keterangan,

    tanggalPengajuan,

    status,
  }
}

// ============================================================
// INITIAL REVISI
// ============================================================

export const initialRevisi:
  Revisi[] = [
    mkRevisi(
      "A",
      "Anwar",
      "10 Agustus 2026",
      "shift_pagi",
      "sakit",
      "Demam",
      "11 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Saepul",
      "9 Agustus 2026",
      "shift_siang",
      "izin",
      "Keperluan keluarga",
      "10 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Edi",
      "8 Agustus 2026",
      "shift_pagi",
      "cuti",
      "Cuti tahunan",
      "9 Agustus 2026",
      "PROSES",
    ),

    mkRevisi(
      "A",
      "Gunda",
      "12 Agustus 2026",
      "libur",
      "shift_pagi",
      "Menggantikan rekan",
      "12 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Rudi",
      "13 Agustus 2026",
      "shift_siang",
      "sakit",
      "Sakit maag",
      "13 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Andi",
      "14 Agustus 2026",
      "shift_pagi",
      "izin",
      "Urusan pribadi",
      "14 Agustus 2026",
      "PROSES",
    ),

    mkRevisi(
      "A",
      "Budi",
      "15 Agustus 2026",
      "shift_siang",
      "libur",
      "Tukar jadwal",
      "15 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Citra",
      "16 Agustus 2026",
      "libur",
      "shift_siang",
      "Menggantikan rekan",
      "16 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Anwar",
      "17 Agustus 2026",
      "shift_pagi",
      "izin",
      "Acara keluarga",
      "17 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "A",
      "Edi",
      "18 Agustus 2026",
      "shift_siang",
      "sakit",
      "Flu",
      "18 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "B",
      "Fajar",
      "10 Agustus 2026",
      "shift_pagi",
      "izin",
      "Keperluan keluarga",
      "10 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "B",
      "Rizal",
      "11 Agustus 2026",
      "shift_siang",
      "sakit",
      "Demam tinggi",
      "11 Agustus 2026",
      "PROSES",
    ),

    mkRevisi(
      "B",
      "Doni",
      "12 Agustus 2026",
      "libur",
      "shift_pagi",
      "Tukar jadwal",
      "12 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "D",
      "Surya",
      "9 Agustus 2026",
      "shift_pagi",
      "cuti",
      "Cuti tahunan",
      "9 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "D",
      "Bayu",
      "10 Agustus 2026",
      "shift_siang",
      "sakit",
      "Sakit gigi",
      "10 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "D",
      "Eko",
      "11 Agustus 2026",
      "shift_pagi",
      "izin",
      "Urusan bank",
      "11 Agustus 2026",
      "PROSES",
    ),

    mkRevisi(
      "D",
      "Wahyu",
      "12 Agustus 2026",
      "libur",
      "shift_siang",
      "Menggantikan rekan",
      "12 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "D",
      "Dimas",
      "13 Agustus 2026",
      "shift_siang",
      "izin",
      "Keperluan keluarga",
      "13 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "D",
      "Rina",
      "14 Agustus 2026",
      "shift_pagi",
      "sakit",
      "Demam",
      "14 Agustus 2026",
      "BARU",
    ),

    mkRevisi(
      "D",
      "Joko",
      "15 Agustus 2026",
      "shift_pagi",
      "libur",
      "Tukar jadwal",
      "15 Agustus 2026",
      "BARU",
    ),
  ]

// ============================================================
// HISTORY
// ============================================================

export type HistoryJenis =
  | "Cuti"
  | "Sakit"
  | "Izin"

export type HistoryEntry = {
  id: string
  tanggal: string
  tanggalISO: string
  name: string
  storeId: string
  jenis: HistoryJenis
  keterangan: string
}

let histSeq = 0

function mkHist(
  tanggal: string,
  tanggalISO: string,
  name: string,
  storeId: string,
  jenis: HistoryJenis,
  keterangan: string,
): HistoryEntry {
  histSeq += 1

  return {
    id: `H-${histSeq}`,

    tanggal,

    tanggalISO,

    name,

    storeId,

    jenis,

    keterangan,
  }
}

// ============================================================
// HISTORY DATA
// ============================================================

export const history:
  HistoryEntry[] = [
    mkHist(
      "10 Agustus 2026",
      "2026-08-10",
      "Anwar",
      "A",
      "Sakit",
      "Demam",
    ),

    mkHist(
      "15 Agustus 2026",
      "2026-08-15",
      "Saepul",
      "A",
      "Izin",
      "Keperluan keluarga",
    ),

    mkHist(
      "20 Agustus 2026",
      "2026-08-20",
      "Citra",
      "A",
      "Cuti",
      "Cuti tahunan",
    ),

    mkHist(
      "3 Agustus 2026",
      "2026-08-03",
      "Budi",
      "A",
      "Sakit",
      "Flu",
    ),

    mkHist(
      "8 Agustus 2026",
      "2026-08-08",
      "Andi",
      "A",
      "Izin",
      "Urusan pribadi",
    ),

    mkHist(
      "5 Agustus 2026",
      "2026-08-05",
      "Fajar",
      "B",
      "Izin",
      "Keperluan keluarga",
    ),

    mkHist(
      "12 Agustus 2026",
      "2026-08-12",
      "Rizal",
      "B",
      "Sakit",
      "Demam tinggi",
    ),

    mkHist(
      "18 Agustus 2026",
      "2026-08-18",
      "Sari",
      "B",
      "Cuti",
      "Cuti tahunan",
    ),

    mkHist(
      "6 Agustus 2026",
      "2026-08-06",
      "Yoga",
      "C",
      "Sakit",
      "Sakit kepala",
    ),

    mkHist(
      "14 Agustus 2026",
      "2026-08-14",
      "Dewi",
      "C",
      "Cuti",
      "Cuti melahirkan",
    ),

    mkHist(
      "19 Agustus 2026",
      "2026-08-19",
      "Reza",
      "C",
      "Izin",
      "Wisuda keluarga",
    ),

    mkHist(
      "7 Agustus 2026",
      "2026-08-07",
      "Surya",
      "D",
      "Cuti",
      "Cuti tahunan",
    ),

    mkHist(
      "11 Agustus 2026",
      "2026-08-11",
      "Bayu",
      "D",
      "Sakit",
      "Sakit gigi",
    ),

    mkHist(
      "16 Agustus 2026",
      "2026-08-16",
      "Rina",
      "D",
      "Izin",
      "Urusan bank",
    ),
  ]

// ============================================================
// DATE HELPERS
// ============================================================

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

export const DEFAULT_DATE =
  "2026-08-20"

export function formatTanggal(
  iso: string,
): string {
  const [
    y,
    m,
    d,
  ] =
    iso
      .split("-")
      .map(Number)

  return `${d} ${MONTHS[m - 1]
    } ${y}`
}

export function daysInMonth(
  year: number,
  month1: number,
): number {
  return new Date(
    year,
    month1,
    0,
  ).getDate()
}

export function monthName(
  month1: number,
): string {
  return MONTHS[
    month1 - 1
  ]
}