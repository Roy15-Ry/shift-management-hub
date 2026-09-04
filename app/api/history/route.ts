import { NextResponse } from "next/server"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// HISTORY — READ ONLY (GET)
//
// Membaca riwayat (jadwal shift, libur/cuti/izin/sakit, dan revisi
// absensi) melalui server (Firebase Admin SDK) untuk halaman
// HISTORY. Pembacaan dipindahkan ke server agar scope otorisasi
// peran dipaksakan dari profile akun, bukan dari parameter client.
//
// SCOPE (ditentukan dari akun yang login, BUKAN dari client):
//   STORE          -> hanya tokonya sendiri (storeId akun)
//   CENTRAL CABANG -> seluruh toko pada cabang akun
//   CENTRAL PUSAT  -> seluruh cabang & toko
//
// Parameter year/month hanya berfungsi sebagai FILTER bulan setelah
// scope otorisasi server diterapkan. History bersifat READ-ONLY.
// ============================================================

type HistoryUser = {
  uid: string
  role: string
  cabangId?: string | null
  storeId?: string | null
}

async function getAuthenticatedUser(
  request: Request,
): Promise<HistoryUser> {
  const authorization =
    request.headers.get("authorization")

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new Error("AUTH_REQUIRED")
  }

  const idToken = authorization.substring(7)

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
    cabangId: data?.cabangId ?? null,
    storeId: data?.storeId ?? null,
  }
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

type Scope =
  | { type: "store"; storeId: string }
  | { type: "cabang"; cabangId: string }
  | { type: "all" }
  | { type: "__FORBIDDEN__" }

function scopeForRole(user: HistoryUser): Scope {
  const role = user.role?.trim().toLowerCase()

  if (role === "store") {
    return {
      type: "store",
      storeId: normalize(user.storeId),
    }
  }

  if (role === "central_cabang") {
    return {
      type: "cabang",
      cabangId: normalize(user.cabangId),
    }
  }

  if (role === "central_pusat") {
    return { type: "all" }
  }

  return { type: "__FORBIDDEN__" }
}

export async function GET(request: Request) {
  try {
    let user: HistoryUser

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

    const scope = scopeForRole(user)

    if (scope.type === "__FORBIDDEN__") {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    // =====================================================
    // PARAMETER BULAN (HANYA FILTER SETELAH OTORISASI)
    // =====================================================

    const url = new URL(request.url)

    const year = Number(url.searchParams.get("year"))
    const month = Number(url.searchParams.get("month"))

    const hasValidMonth =
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      month >= 0 &&
      month <= 11

    const monthPrefix = hasValidMonth
      ? `${year}-${String(month + 1).padStart(2, "0")}-`
      : null

    // Periode bulan yang diminta: [start, end)
    // start = YYYY-MM-01, end = tanggal 1 bulan berikutnya
    // (rollover tahun bila Desember). Dipakai untuk membatasi
    // query schedules; monthPrefix di atas tetap dipakai untuk
    // filter revisi.
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

    // =====================================================
    // AMBIL TOKO SESUAI SCOPE
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

    if (scope.type === "store") {
      stores = stores.filter(
        (store) =>
          store.aktif !== false &&
          normalize(store.id) === scope.storeId,
      )
    } else if (scope.type === "cabang") {
      stores = stores.filter(
        (store) =>
          store.aktif !== false &&
          store.cabangId === scope.cabangId,
      )
    } else {
      stores = stores.filter(
        (store) => store.aktif !== false,
      )
    }

    // =====================================================
    // AMBIL KARYAWAN PER TOKO
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
            storeId:
              data.storeId ??
              store.id,
            posisi: data.posisi ?? "",
            aktif:
              data.aktif !== false,
          }
        })
    }

    // =====================================================
    // AMBIL JADWAL SHIFT SESUAI SCOPE + BULAN
    // =====================================================

    const schedulesByStore: Record<
      string,
      Array<Record<string, unknown>>
    > = {}

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
              data.storeId ??
              store.id,
            cabangId:
              normalize(data.cabangId),
            employeeId:
              data.employeeId ?? "",
            tanggal:
              data.tanggal ?? "",
            status: data.status ?? "",
            cutiJenis:
              data.cutiJenis ?? undefined,
          }
        })

      schedulesByStore[store.id] = schedules
    }

    // =====================================================
    // AMBIL REVISI ABSENSI SESUAI SCOPE + BULAN
    // =====================================================

    let revisiQuery: FirebaseFirestore.Query =
      adminDb.collection("revisi")

    if (scope.type === "store") {
      revisiQuery = revisiQuery.where(
        "storeId",
        "==",
        scope.storeId,
      )
    } else if (scope.type === "cabang") {
      revisiQuery = revisiQuery.where(
        "cabangId",
        "==",
        scope.cabangId,
      )
    }

    const revisiSnapshot =
      await revisiQuery.get()

    const revisi = revisiSnapshot.docs
      .map((doc) => {
        const data = doc.data()

        return {
          id: doc.id,
          storeId:
            data.storeId ?? "",
          storeName:
            data.storeName ?? "",
          cabangId:
            normalize(data.cabangId),
          employeeId:
            data.employeeId ?? "",
          employeeName:
            data.employeeName ?? "",
          tanggal:
            data.tanggal ?? "",
          jenisRevisi:
            data.jenisRevisi ?? "",
          jenisRevisiLainnya:
            data.jenisRevisiLainnya ?? "",
          jadwalShift:
            data.jadwalShift ?? null,
          keterangan:
            data.keterangan ?? "",
          tanggalPengajuan:
            data.tanggalPengajuan ?? "",
          status: data.status ?? "",
          prosesOleh:
            data.prosesOleh ?? "",
        }
      })
      .filter(
        (item) =>
          !monthPrefix ||
          String(item.tanggal).startsWith(monthPrefix),
      )

    return NextResponse.json({
      success: true,
      user: {
        role,
        cabangId: normalize(user.cabangId),
        storeId: normalize(user.storeId),
      },
      stores,
      employeesByStoreId,
      schedulesByStore,
      revisi,
    })
  } catch (error) {
    console.error(
      "GET HISTORY ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data history.",
      },
      { status: 500 },
    )
  }
}
