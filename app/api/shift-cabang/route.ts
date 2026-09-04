import { NextResponse } from "next/server"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// SHIFT CABANG — READ ONLY (GET)
//
// Membaca data toko, karyawan, dan jadwal shift untuk SHIFT
// CABANG melalui server (Firebase Admin SDK).
//
// Alasan: Firestore Rules hanya mengizinkan akun STORE membaca
// tokonya sendiri. Requirement SHIFT CABANG mengharuskan STORE
// (dan CENTRAL CABANG) melihat SELURUH toko dalam cabang yang
// sama, sehingga pembacaan dipindahkan ke server.
//
// AMAN: scope otorisasi selalu ditentukan dari profile akun yang
// login (role + cabangId + storeId), BUKAN dari parameter client.
// Parameter tambahan (cabangId / storeId / year / month) hanya
// digunakan sebagai FILTER setelah scope otorisasi server.
// ============================================================

type ShiftCabangUser = {
  uid: string
  role: string
  cabangId?: string | null
  storeId?: string | null
}

async function getAuthenticatedUser(
  request: Request,
): Promise<ShiftCabangUser> {
  const authorization =
    request.headers.get("authorization")

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new Error("AUTH_REQUIRED")
  }

  const idToken =
    authorization.substring(7)

  const decodedToken =
    await adminAuth.verifyIdToken(idToken)

  const uid = decodedToken.uid

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data = userSnapshot.data()

  return {
    uid,
    role: data?.role ?? "",
    cabangId:
      data?.cabangId ?? null,
    storeId:
      data?.storeId ?? null,
  }
}

// Normalisasi teks untuk pencocokan yang konsisten.
function normalize(
  value: unknown,
): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

// Menentukan cakupan toko berdasarkan role akun yang login.
//
// STORE        -> hanya toko pada cabangId akun
// CENTRAL CABANG -> hanya toko pada cabangId akun
// CENTRAL PUSAT -> semua toko
//
// Mengembalikan daftar storeDocId yang sah (dari query Firestore
// oleh Admin SDK) + list store yang sudah di-map.
function allowedCabangForRole(
  user: ShiftCabangUser,
): string | null {
  const role = user.role?.trim().toLowerCase()

  // STORE / CENTRAL CABANG dibatasi ke cabang akun.
  if (
    role === "store" ||
    role === "central_cabang"
  ) {
    return normalize(user.cabangId)
  }

  // CENTRAL PUSAT: semua cabang.
  if (role === "central_pusat") {
    return null
  }

  return "__FORBIDDEN__"
}

export async function GET(
  request: Request,
) {
  try {
    let user: ShiftCabangUser

    try {
      user = await getAuthenticatedUser(request)
    } catch (authError) {
      const message =
        authError instanceof Error
          ? authError.message
          : ""
      if (message === "AUTH_REQUIRED") {
        return NextResponse.json(
          { success: false, message: "Tidak terautentikasi." },
          { status: 401 },
        )
      }
      if (message === "USER_PROFILE_NOT_FOUND") {
        return NextResponse.json(
          { success: false, message: "Profil pengguna tidak ditemukan." },
          { status: 403 },
        )
      }
      throw authError
    }

    const role = user.role?.trim().toLowerCase()

    if (
      role !== "store" &&
      role !== "central_cabang" &&
      role !== "central_pusat"
    ) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    const isCentralPusat = role === "central_pusat"
    const allowedCabang = allowedCabangForRole(user)

    // Bila role tidak dikenali cakupannya.
    if (allowedCabang === "__FORBIDDEN__") {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    // =====================================================
    // PARAMETER TAMBAHAN (HANYA FILTER SETELAH OTORISASI)
    // =====================================================

    const url = new URL(request.url)

    const year = Number(url.searchParams.get("year"))
    const month = Number(url.searchParams.get("month"))

    const requestedCabangId =
      normalize(
        url.searchParams.get("cabangId"),
      )

    const requestedStoreId =
      normalize(
        url.searchParams.get("storeId"),
      )

    // =====================================================
    // AMBIL TOKO SESUAI SCOPE ROLE
    // =====================================================

    const storesSnapshot =
      await adminDb
        .collection("stores")
        .get()

    let stores = storesSnapshot.docs.map((doc) => {
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
          normalize(data.cabangId),
        aktif:
          data.aktif !== false,
      }
    })

    // Filter menurut scope role.
    if (allowedCabang !== null) {
      stores = stores.filter(
        (store) =>
          store.aktif !== false &&
          store.cabangId === allowedCabang,
      )
    } else {
      stores = stores.filter(
        (store) =>
          store.aktif !== false,
      )
    }

    // Filter tambahan (aman, hanya subset data yang lolos scope).
    if (requestedCabangId) {
      stores = stores.filter(
        (store) =>
          store.cabangId === requestedCabangId,
      )
    }

    if (requestedStoreId) {
      stores = stores.filter(
        (store) =>
          store.id === requestedStoreId,
      )
    }

    // =====================================================
    // AMBIL KARYAWAN PER TOKO (SESUAI SCOPE)
    // =====================================================

    const employeesByStoreId: Record<
      string,
      Array<Record<string, unknown>>
    > = {}

    for (const store of stores) {
      const employeesSnapshot =
        await adminDb
          .collection("employees")
          .where("storeId", "==", store.id)
          .get()

      employeesByStoreId[store.id] =
        employeesSnapshot.docs.map((doc) => {
          const data = doc.data()

          return {
            id: doc.id,
            name:
              data.name ??
              data.nama ??
              "-",
            nik: data.nik ?? "",
            storeId:
              data.storeId ?? store.id,
            cabangId:
              normalize(data.cabangId),
            posisi: data.posisi ?? "",
            aktif: data.aktif !== false,
          }
        })
    }

    // =====================================================
    // AMBIL JADWAL SHIFT TOKO SESUAI SCOPE + BULAN
    // =====================================================

    const schedulesByStore: Record<
      string,
      Array<Record<string, unknown>>
    > = {}

    const hasValidMonth =
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      month >= 0 &&
      month <= 11

    // Periode bulan yang diminta: [start, end)
    // start = YYYY-MM-01, end = tanggal 1 bulan berikutnya
    // (rollover tahun bila Desember).
    const monthRange =
      hasValidMonth
        ? (() => {
            const start = `${year}-${String(month + 1).padStart(2, "0")}-01`
            const nextMonth = month === 11 ? month + 1 - 12 : month + 1
            const nextYear = month === 11 ? year + 1 : year
            const end = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`
            return { start, end }
          })()
        : null

    for (const store of stores) {
      let schedulesQuery =
        adminDb
          .collection("schedules")
          .where("storeId", "==", store.id)

      if (monthRange) {
        schedulesQuery =
          schedulesQuery
            .where("tanggal", ">=", monthRange.start)
            .where("tanggal", "<", monthRange.end)
      }

      const schedulesSnapshot =
        await schedulesQuery.get()

      const schedules = schedulesSnapshot.docs
        .map((doc) => {
          const data = doc.data()

          return {
            id: doc.id,
            storeId:
              data.storeId ?? store.id,
            cabangId:
              normalize(data.cabangId),
            employeeId: data.employeeId ?? "",
            tanggal: data.tanggal ?? "",
            status: data.status ?? "",
            cutiJenis:
              data.cutiJenis ?? undefined,
          }
        })

      schedulesByStore[store.id] = schedules
    }

    return NextResponse.json({
      success: true,
      user: {
        role: role,
        cabangId: normalize(user.cabangId),
        storeId: normalize(user.storeId),
      },
      stores,
      employeesByStoreId,
      schedulesByStore,
    })
  } catch (error: unknown) {
    console.error(
      "GET SHIFT CABANG ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data shift cabang.",
      },
      { status: 500 },
    )
  }
}
