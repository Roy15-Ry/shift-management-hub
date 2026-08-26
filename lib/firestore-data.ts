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

export async function getFirestoreStores(): Promise<
  FirestoreStore[]
> {
  const snapshot = await getDocs(
    collection(db, "stores"),
  )

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<
      FirestoreStore,
      "id"
    >),
  }))
}

// ============================================================
// EMPLOYEES
// ============================================================

export async function getFirestoreEmployees(
  storeId: string,
): Promise<FirestoreEmployee[]> {
  const employeesRef = collection(
    db,
    "employees",
  )

  const q = query(
    employeesRef,
    where("storeId", "==", storeId),
  )

  const snapshot = await getDocs(q)

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<
      FirestoreEmployee,
      "id"
    >),
  }))
}

// ============================================================
// SCHEDULES
// ============================================================

export async function getFirestoreSchedules(
  storeId: string,
  tanggal: string,
): Promise<FirestoreSchedule[]> {
  const schedulesRef = collection(
    db,
    "schedules",
  )

  const q = query(
    schedulesRef,
    where("storeId", "==", storeId),
    where("tanggal", "==", tanggal),
  )

  const snapshot = await getDocs(q)

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<
      FirestoreSchedule,
      "id"
    >),
  }))
}