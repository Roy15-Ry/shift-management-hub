import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// JADWAL LIBUR — READ ONLY (GET)
//
// Membaca data toko, karyawan, dan jadwal shift untuk halaman
// JADWAL LIBUR melalui server (Firebase Admin SDK).
//
// Alasan: Firestore Rules mengizinkan akun CENTRAL membaca
// seluruh data dalam scope-nya. Agar scope (CENTRAL CABANG ->
// hanya cabang sendiri; CENTRAL PUSAT -> semua) dipaksakan di
// server, pembacaan dipindahkan ke server (Admin SDK), persis
// seperti pola /api/shift-cabang.
//
// HANYA untuk role CENTRAL CABANG dan CENTRAL PUSAT.
// Role STORE ditolak.
//
// AMAN: scope otorisasi selalu ditentukan dari profile akun yang
// login (role + cabangId), BUKAN dari parameter client. Parameter
// tambahan (year / month) hanya dipakai sebagai FILTER setelah
// scope otorisasi server.
//
// Sebaris read-only. Tidak ada write/mutasi ke Firestore.
// ============================================================

type JadwalLiburUser = {
  uid: string
  role: string
  cabangId?: string | null
}

async function getAuthenticatedUser(
  request: Request,
): Promise<JadwalLiburUser> {
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
// CENTRAL CABANG -> hanya toko pada cabangId akun
// CENTRAL PUSAT  -> semua toko
//
// Mengembalikan cabangId yang sah untuk cabang, atau null
// untuk Pusat (semua cabang), atau penanda FORBIDDEN bila
// role tidak dikenali.
function allowedCabangForRole(
  user: JadwalLiburUser,
): string | null {
  const role = user.role?.trim().toLowerCase()

  // CENTRAL CABANG & STORE -> hanya cabang akun
  if (role === "central_cabang" || role === "store") {
    return normalize(user.cabangId)
  }

  // CENTRAL PUSAT -> semua cabang (dapat difilter via param cabang)
  if (role === "central_pusat") {
    return null
  }

  return "__FORBIDDEN__"
}

export async function GET(
  request: Request,
) {
  try {
    let user: JadwalLiburUser

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

    // CENTRAL CABANG & CENTRAL PUSAT untuk halaman JADWAL LIBUR.
    // STORE diizinkan hanya untuk membaca (read-only) sebagai
    // sumber data section JADWAL LIBUR pada DASHBOARD STORE.
    if (
      role !== "central_cabang" &&
      role !== "central_pusat" &&
      role !== "store"
    ) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    const isCentralPusat = role === "central_pusat"
    const allowedCabang = allowedCabangForRole(user)

    if (allowedCabang === "__FORBIDDEN__") {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    // =====================================================
    // FILTER CABANG UNTUK CENTRAL PUSAT
    //
    // Central Pusat memilih satu cabang (param "cabang") atau
    // "Semua Cabang" (""). Parameter ini HANYA dipakai oleh
    // Central Pusat; Central Cabang & Store selalu memakai cabang
    // akunnya sendiri.
    // =====================================================

    const url = new URL(request.url)

    const rawCabangFilter = url.searchParams.get("cabang") ?? ""
    const cabangFilter =
      isCentralPusat
        ? normalize(rawCabangFilter)
        : null

    // =====================================================
    // PARAMETER TAMBAHAN (HANYA FILTER SETELAH OTORISASI)
    // =====================================================

    const year = Number(url.searchParams.get("year"))
    const month = Number(url.searchParams.get("month"))

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
    } else if (cabangFilter && cabangFilter !== "ALL") {
      // CENTRAL PUSAT dengan cabang terpilih -> hanya cabang itu.
      stores = stores.filter(
        (store) =>
          store.aktif !== false &&
          store.cabangId === cabangFilter,
      )
    } else {
      // CENTRAL PUSAT "Semua Cabang" -> semua toko aktif.
      stores = stores.filter(
        (store) =>
          store.aktif !== false,
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

    // =====================================================
    // AMBIL KETERANGAN JADWAL LIBUR SESUAI SCOPE + BULAN
    // =====================================================

    const bulanKey = hasValidMonth
      ? `${year}-${String(month + 1).padStart(2, "0")}`
      : null

    const keteranganSnapshot =
      await adminDb
        .collection("jadwal-libur-keterangan")
        .get()

    const userCabangId =
      normalize(user.cabangId)

    // Scope keterangan:
    // - CENTRAL PUSAT "Semua Cabang" -> semua keterangan tiap cabang
    //   (tidak ada lagi keterangan global "" yang ikut tampil)
    // - CENTRAL PUSAT cabang terpilih -> hanya cabang tersebut
    // - CENTRAL CABANG / STORE      -> hanya cabang akunnya
    const keteranganScopeIsPusatAll =
      isCentralPusat &&
      (!cabangFilter || cabangFilter === "ALL")

    const keteranganMatchesBranch = (
      itemCabang: string,
    ) => {
      if (keteranganScopeIsPusatAll) {
        return true
      }
      if (isCentralPusat) {
        return itemCabang === cabangFilter
      }
      return itemCabang === userCabangId
    }

    const keterangan =
      keteranganSnapshot.docs
        .map((doc) => {
          const data = doc.data()

          return {
            id: doc.id,
            jenis: data.jenis ?? "",
            teks: data.teks ?? "",
            bulan: data.bulan ?? "",
            tanggal: data.tanggal ?? "",
            cabangId: normalize(data.cabangId),
          }
        })
        .filter(
          (item) =>
            (!bulanKey ||
              item.bulan === bulanKey) &&
            keteranganMatchesBranch(
              item.cabangId,
            ),
        )

    return NextResponse.json({
      success: true,
      user: {
        role: role,
        cabangId: normalize(user.cabangId),
      },
      isCentralPusat,
      stores,
      employeesByStoreId,
      schedulesByStore,
      keterangan,
    })
  } catch (error: unknown) {
    console.error(
      "GET JADWAL LIBUR ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data jadwal libur.",
      },
      { status: 500 },
    )
  }
}

// ============================================================
// POST / DELETE — KETERANGAN JADWAL LIBUR (HANYA CENTRAL)
//
// Keterangan disimpan ke collection khusus terisolasi:
//   jadwal-libur-keterangan
//
// Menulis melalui Admin SDK (server), sehingga AKSES TIDAK
// melanggar Firestore Rules existing (rules memblokir tulis
// langsung dari client). Dengan begitu firestore.rules TIDAK
// perlu diubah.
//
// Hak akses:
//   - CENTRAL PUSAT  -> membuat/mengedit/menghapus keterangan
//                       global (cabangId ""), dapat melihat semua
//   - CENTRAL CABANG -> membuat/mengedit/menghapus keterangan
//                       pada scope cabangnya (cabangId == milik
//                       akun), dapat melihat cabangnya + global
//   - STORE          -> ditolak (tanpa endpoint tulis)
//
// Data keterangan persistent di Firestore dan mengikuti bulan
// yang sedang dilihat (field bulan "YYYY-MM").
// ============================================================

function fmtDateTime(): string {
  const now = new Date()
  const pad = (n: number) =>
    String(n).padStart(2, "0")

  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-") +
    " " +
    [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(":")
}

const KETERANGAN_JENIS = new Set([
  "kegiatan",
  "operasional",
  "tanggal",
])

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// ============================================================
// HELPERS OTORISASI (dipakai POST & DELETE)
// ============================================================

async function authAndCheckCentral(
  request: Request,
): Promise<{
  uid: string
  role: string
  cabangId: string
  nama: string
}> {
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

  const data = userSnapshot.data() ?? {}

  const role = String(data.role ?? "").trim().toLowerCase()
  const aktif = data.aktif === true

  if (!aktif) {
    throw new Error("FORBIDDEN")
  }

  if (role !== "central_pusat" && role !== "central_cabang") {
    throw new Error("FORBIDDEN")
  }

  return {
    uid,
    role,
    cabangId: normalize(data.cabangId),
    nama: cleanText(data.nama ?? data.email ?? "Central", 150),
  }
}

function cleanText(value: unknown, max = 500): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().slice(0, max)
}

// ============================================================
// POST
// Membuat atau memperbarui keterangan JADWAL LIBUR.
// ============================================================

export async function POST(request: Request) {
  try {
    const actor = await authAndCheckCentral(request)

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { success: false, message: "Body request tidak valid." },
        { status: 400 },
      )
    }

    const id = cleanText(body.id, 120)
    const jenis = cleanText(body.jenis, 20)
    const teks = cleanText(body.teks, 1000)
    const tanggal = body.jenis === "tanggal"
      ? cleanText(body.tanggal, 10)
      : ""

    if (!KETERANGAN_JENIS.has(jenis)) {
      return NextResponse.json(
        { success: false, message: "Jenis keterangan tidak valid." },
        { status: 400 },
      )
    }

    if (!teks) {
      return NextResponse.json(
        { success: false, message: "Isi keterangan tidak boleh kosong." },
        { status: 400 },
      )
    }

    if (jenis === "tanggal" && !isValidDateString(tanggal)) {
      return NextResponse.json(
        { success: false, message: "Tanggal keterangan tidak valid." },
        { status: 400 },
      )
    }

    // Keterangan selalu terikat pada bulan (mengikuti bulan yang
    // dilihat). Untuk jenis "tanggal" diambil dari tanggalnya;
    // untuk kegiatan/operasional diambil dari param bulan
    // ("YYYY-MM") yang dikirim client.
    let bulan = ""
    if (jenis === "tanggal") {
      bulan = tanggal.slice(0, 7)
    } else {
      bulan = cleanText(body.bulan, 7)
      if (!/^\d{4}-\d{2}$/.test(bulan)) {
        return NextResponse.json(
          { success: false, message: "Periode bulan keterangan tidak valid." },
          { status: 400 },
        )
      }
    }

    // =====================================================
    // SCOPE PENYIMPANAN BERDASAR ROLE + CABANG TUJUAN
    //
    // CENTRAL PUSAT  -> wajib memilih cabang tujuan (param "cabang").
    //                   Tidak ada lagi keterangan global (cabangId "").
    // CENTRAL CABANG -> cabang otomatis dari akun (actor.cabangId).
    // =====================================================

    let cabangId: string

    if (actor.role === "central_pusat") {
      const targetCabang = normalize(body.cabang)

      if (!targetCabang || targetCabang === "ALL" || targetCabang === "__ALL__") {
        return NextResponse.json(
          { success: false, message: "Pilih cabang tujuan untuk keterangan terlebih dahulu." },
          { status: 400 },
        )
      }

      // Validasi cabang tujuan benar-benar ada.
      const branchSnapshot =
        await adminDb
          .collection("branches")
          .where("cabangId", "==", targetCabang)
          .get()

      if (branchSnapshot.empty) {
        return NextResponse.json(
          { success: false, message: "Cabang tujuan tidak ditemukan." },
          { status: 400 },
        )
      }

      cabangId = targetCabang
    } else {
      cabangId = actor.cabangId
    }

    const now = fmtDateTime()

    const ref = id
      ? adminDb.collection("jadwal-libur-keterangan").doc(id)
      : adminDb.collection("jadwal-libur-keterangan").doc()

    // Saat memperbarui dokumen yang sudah ada, verifikasi dulu
    // bahwa keterangan tersebut berada dalam kewenangan user.
    if (id) {
      const snapshot = await ref.get()
      if (!snapshot.exists) {
        return NextResponse.json(
          { success: false, message: "Keterangan tidak ditemukan." },
          { status: 404 },
        )
      }
      const existing = snapshot.data() ?? {}
      const existingCabang = normalize(existing.cabangId)

      if (actor.role === "central_cabang") {
        if (existingCabang !== actor.cabangId) {
          return NextResponse.json(
            { success: false, message: "Anda hanya dapat mengubah keterangan pada cabang Anda." },
            { status: 403 },
          )
        }
      }
    }

    await ref.set(
      {
        jenis,
        teks,
        bulan,
        tanggal,
        cabangId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
        updatedBy: actor.uid,
      },
      { merge: true },
    )

    return NextResponse.json({
      success: true,
      id: ref.id,
      message: "Keterangan berhasil disimpan.",
    })
  } catch (error: unknown) {
    const code =
      error instanceof Error
        ? error.message
        : ""

    if (code === "AUTH_REQUIRED") {
      return NextResponse.json(
        { success: false, message: "Anda harus login terlebih dahulu." },
        { status: 401 },
      )
    }
    if (code === "FORBIDDEN" || code === "USER_PROFILE_NOT_FOUND") {
      return NextResponse.json(
        { success: false, message: "Akses ditolak." },
        { status: 403 },
      )
    }

    console.error("POST KETERANGAN JADWAL LIBUR ERROR:", error)

    return NextResponse.json(
      { success: false, message: "Keterangan gagal disimpan. Silakan coba lagi." },
      { status: 500 },
    )
  }
}

// ============================================================
// DELETE
// Menghapus keterangan JADWAL LIBUR (hanya dalam scope user).
// ============================================================

export async function DELETE(request: Request) {
  try {
    const actor = await authAndCheckCentral(request)

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { success: false, message: "Body request tidak valid." },
        { status: 400 },
      )
    }

    const id = cleanText(body.id, 120)

    if (!id) {
      return NextResponse.json(
        { success: false, message: "ID keterangan tidak valid." },
        { status: 400 },
      )
    }

    const ref = adminDb.collection("jadwal-libur-keterangan").doc(id)
    const snapshot = await ref.get()

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, message: "Keterangan tidak ditemukan." },
        { status: 404 },
      )
    }

    const existing = snapshot.data() ?? {}
    const existingCabang = normalize(existing.cabangId)

    if (actor.role === "central_cabang") {
      if (existingCabang !== actor.cabangId) {
        return NextResponse.json(
          { success: false, message: "Anda hanya dapat menghapus keterangan pada cabang Anda." },
          { status: 403 },
        )
      }
    }

    await ref.delete()

    return NextResponse.json({
      success: true,
      message: "Keterangan berhasil dihapus.",
    })
  } catch (error: unknown) {
    const code =
      error instanceof Error
        ? error.message
        : ""

    if (code === "AUTH_REQUIRED") {
      return NextResponse.json(
        { success: false, message: "Anda harus login terlebih dahulu." },
        { status: 401 },
      )
    }
    if (code === "FORBIDDEN" || code === "USER_PROFILE_NOT_FOUND") {
      return NextResponse.json(
        { success: false, message: "Akses ditolak." },
        { status: 403 },
      )
    }

    console.error("DELETE KETERANGAN JADWAL LIBUR ERROR:", error)

    return NextResponse.json(
      { success: false, message: "Keterangan gagal dihapus. Silakan coba lagi." },
      { status: 500 },
    )
  }
}
