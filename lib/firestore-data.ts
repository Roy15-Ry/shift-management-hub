import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore"

import { db } from "@/lib/firebase"

// ============================================================
// TYPES
// ============================================================

export type FirestoreStore = {
  id: string
  nama: string
  kode: string
  cabangId: string
  aktif: boolean
}

export type FirestoreEmployee = {
  id: string
  name: string
  nik: string
  storeId: string
  cabangId: string
  posisi: string
  aktif: boolean
}

export type FirestoreSchedule = {
  id: string
  storeId: string
  cabangId: string
  employeeId: string
  tanggal: string
  status:
  | "shift_pagi"
  | "shift_siang"
  | "libur"
  | "cuti"
  | "izin"
  | "sakit"
  cutiJenis?: string
}

// ============================================================
// STORES
// ============================================================

export async function getFirestoreStores(
  role?: string,
  storeId?: string,
  cabangId?: string,
): Promise<FirestoreStore[]> {
  const storesRef = collection(
    db,
    "stores",
  )

  let q

  // ==========================================================
  // STORE
  // Hanya mengambil toko miliknya sendiri
  // ==========================================================

  if (
    role === "store" &&
    storeId
  ) {
    q = query(
      storesRef,
      where(
        "storeId",
        "==",
        storeId,
      ),
    )
  }

  // ==========================================================
  // CENTRAL CABANG
  // Hanya mengambil toko pada cabangnya
  // ==========================================================

  else if (
    role === "central_cabang" &&
    cabangId
  ) {
    q = query(
      storesRef,
      where(
        "cabangId",
        "==",
        cabangId,
      ),
      where(
        "aktif",
        "==",
        true,
      ),
    )
  }

  // ==========================================================
  // CENTRAL PUSAT
  // Mengambil semua toko
  // ==========================================================

  else {
    q = query(
      storesRef,
    )
  }

  const snapshot =
    await getDocs(q)

  return snapshot.docs.map(
    (doc) => {
      const data =
        doc.data()

      return {
        id:
          data.storeId ??
          doc.id,

        nama:
          data.namaStore ??
          data.nama ??
          "-",

        kode:
          data.storeId ??
          doc.id,

        cabangId:
          data.cabangId ??
          "",

        aktif:
          data.aktif !== false,
      }
    },
  )
}

// ============================================================
// STORES BY CABANG
//
// Mengambil semua toko yang berada pada satu cabang.
// Dipakai oleh SHIFT CABANG untuk akun STORE dan CENTRAL
// CABANG agar keduanya hanya melihat toko pada cabang mereka.
// ============================================================

export async function getFirestoreStoresByCabang(
  cabangId: string,
): Promise<FirestoreStore[]> {
  const storesRef = collection(
    db,
    "stores",
  )

  // Gunakan satu klausa (cabangId) agar tidak membutuhkan composite
  // index; penyaringan aktif dilakukan di sisi klien.
  const q = query(
    storesRef,
    where(
      "cabangId",
      "==",
      cabangId,
    ),
  )

  const snapshot =
    await getDocs(q)

  return snapshot.docs
    .map(
      (doc) => {
        const data = doc.data()

        return {
          id:
            data.storeId ??
            doc.id,

          nama:
            data.namaStore ??
            data.nama ??
            "-",

          kode:
            data.storeId ??
            doc.id,

          cabangId:
            data.cabangId ??
            "",

          aktif:
            data.aktif !== false,
        }
      },
    )
    .filter(
      (store) =>
        store.aktif !== false,
    )
}

// ============================================================
// EMPLOYEES
// ============================================================

export async function getFirestoreEmployees(
  storeId: string,
  cabangId?: string,
): Promise<FirestoreEmployee[]> {
  const employeesRef =
    collection(
      db,
      "employees",
    )

  const q = cabangId
    ? query(
      employeesRef,
      where(
        "storeId",
        "==",
        storeId,
      ),
      where(
        "cabangId",
        "==",
        cabangId,
      ),
    )
    : query(
      employeesRef,
      where(
        "storeId",
        "==",
        storeId,
      ),
    )

  const snapshot =
    await getDocs(q)

  return snapshot.docs.map(
    (doc) => {
      const data = doc.data()

      return {
        id: doc.id,
        ...(data as Omit<
          FirestoreEmployee,
          "id" | "name"
        >),
        name:
          data.name ??
          data.nama ??
          "-",
      }
    },
  )
}

// ============================================================
// SCHEDULES
// ============================================================

export async function getFirestoreSchedules(
  storeId: string,
  tanggal: string,
  cabangId?: string,
): Promise<FirestoreSchedule[]> {
  const schedulesRef =
    collection(
      db,
      "schedules",
    )

  const q = cabangId
    ? query(
      schedulesRef,
      where(
        "storeId",
        "==",
        storeId,
      ),
      where(
        "tanggal",
        "==",
        tanggal,
      ),
      where(
        "cabangId",
        "==",
        cabangId,
      ),
    )
    : query(
      schedulesRef,
      where(
        "storeId",
        "==",
        storeId,
      ),
      where(
        "tanggal",
        "==",
        tanggal,
      ),
    )

  const snapshot =
    await getDocs(q)

  return snapshot.docs.map(
    (doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<
        FirestoreSchedule,
        "id"
      >),
    }),
  )
}

// ============================================================
// MONTHLY SCHEDULES
// ============================================================

export async function getFirestoreMonthlySchedules(
  storeId: string,
  year: number,
  month: number,
): Promise<FirestoreSchedule[]> {
  const schedulesRef =
    collection(
      db,
      "schedules",
    )

  const snapshot =
    await getDocs(
      query(
        schedulesRef,
        where(
          "storeId",
          "==",
          storeId,
        ),
      ),
    )

  const monthPrefix =
    `${year}-${String(month + 1).padStart(2, "0")}-`

  return snapshot.docs
    .map(
      (doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<
          FirestoreSchedule,
          "id"
        >),
      }),
    )
    .filter(
      (schedule) =>
        schedule.tanggal?.startsWith(
          monthPrefix,
        ),
    )
}
