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
  nama: string
  nik: string
  storeId: string
  posisi: string
  aktif: boolean
}

export type FirestoreSchedule = {
  id: string
  storeId: string
  employeeId: string
  tanggal: string
  status:
  | "shift_pagi"
  | "shift_siang"
  | "libur"
  | "cuti"
  | "izin"
  | "sakit"
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
// EMPLOYEES
// ============================================================

export async function getFirestoreEmployees(
  storeId: string,
): Promise<FirestoreEmployee[]> {
  const employeesRef =
    collection(
      db,
      "employees",
    )

  const q = query(
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
    (doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<
        FirestoreEmployee,
        "id"
      >),
    }),
  )
}

// ============================================================
// SCHEDULES
// ============================================================

export async function getFirestoreSchedules(
  storeId: string,
  tanggal: string,
): Promise<FirestoreSchedule[]> {
  const schedulesRef =
    collection(
      db,
      "schedules",
    )

  const q = query(
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