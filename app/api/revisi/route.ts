import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

import {
  REVISI_JENIS_ITEMS,
  REVISI_JENIS_LAINNYA,
} from "@/lib/data"

// ============================================================
// STATUS SHIFT YANG SAH
// ============================================================

const VALID_STATUS = new Set([
  "shift_pagi",
  "shift_siang",
  "libur",
  "cuti",
  "izin",
  "sakit",
])

const JENIS_REVISI_VALUES = new Set<string>(
  REVISI_JENIS_ITEMS.map(
    (item) => item.value,
  ),
)

// ============================================================
// REVISI STATUS WORKFLOW
// ============================================================

const REVISI_STATUS = new Set([
  "BARU",
  "PROSES",
  "SELESAI",
])

// ============================================================
// DATA AKUN YANG SEDANG LOGIN
// ============================================================

async function getAuthenticatedUser(
  request: Request,
): Promise<{
  uid: string
  role: string
  data: Record<string, unknown>
}> {
  const authorization =
    request.headers.get(
      "authorization",
    )

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    throw new Error(
      "AUTH_REQUIRED",
    )
  }

  const idToken =
    authorization.substring(7)

  const decodedToken =
    await adminAuth.verifyIdToken(
      idToken,
    )

  const uid =
    decodedToken.uid

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error(
      "USER_PROFILE_NOT_FOUND",
    )
  }

  const data =
    userSnapshot.data() ?? {}

  const role =
    String(data?.role ?? "")
      .trim()

  const aktif =
    data?.aktif === true

  if (!aktif || !role) {
    throw new Error(
      "FORBIDDEN",
    )
  }

  return {
    uid,
    role,
    data,
  }
}

function isStoreRole(
  role: string,
) {
  return role === "store"
}

function isCentralRole(
  role: string,
) {
  return (
    role === "central_cabang" ||
    role === "central_pusat"
  )
}

function isValidDateISO(
  value: unknown,
): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split("-")
      .map(Number)

  const date =
    new Date(
      year,
      month - 1,
      day,
    )

  return (
    date.getFullYear() === year &&
    date.getMonth() ===
      month - 1 &&
    date.getDate() === day
  )
}

function cleanString(
  value: unknown,
  max = 500,
): string {
  if (typeof value !== "string") {
    return ""
  }

  return value.trim().slice(
    0,
    max,
  )
}

function fmtDateTime(): string {
  const now = new Date()

  const pad = (n: number) =>
    String(n).padStart(2, "0")

  const date = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-")

  const time = [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join(":")

  return `${date} ${time}`
}

// ============================================================
// MEMBACA JADWAL SHIFT KARYAWAN (REFERENSI SAJA)
//
// Revisi Absensi TIDAK mengubah jadwal. Nilai jadwal hanya
// diambil dari collection schedules sebagai informasi
// referensi dan disimpan apa adanya.
// ============================================================

async function getEmployeeScheduleStatus(
  storeId: string,
  tanggal: string,
  employeeId: string,
): Promise<string | null> {
  const snapshot =
    await adminDb
      .collection("schedules")
      .where(
        "storeId",
        "==",
        storeId,
      )
      .where(
        "tanggal",
        "==",
        tanggal,
      )
      .where(
        "employeeId",
        "==",
        employeeId,
      )
      .limit(1)
      .get()

  const data =
    snapshot.docs[0]?.data()

  const status =
    typeof data?.status ===
      "string"
      ? data.status.trim()
      : ""

  return VALID_STATUS.has(
    status,
  )
    ? status
    : null
}

async function getStoreName(
  storeId: string,
): Promise<string> {
  const snapshot =
    await adminDb
      .collection("stores")
      .where(
        "storeId",
        "==",
        storeId,
      )
      .limit(1)
      .get()

  const data =
    snapshot.docs[0]?.data()

  return (
    cleanString(
      data?.namaStore ??
        data?.nama ??
        storeId,
      120,
    ) || storeId
  )
}

// ============================================================
// POST
// Membuat pengajuan revisi absensi (khusus STORE).
// ============================================================

export async function POST(
  request: Request,
) {
  try {
    const {
      role,
      data: userData,
    } =
      await getAuthenticatedUser(
        request,
      )

    if (!isStoreRole(role)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Untuk saat ini pengajuan revisi hanya dapat dibuat oleh akun Store.",
        },
        { status: 403 },
      )
    }

    // storeId dan cabangId selalu diambil dari akun,
    // bukan dari body request.
    const storeId =
      cleanString(
        userData?.storeId,
        100,
      )

    const cabangId =
      cleanString(
        userData?.cabangId,
        100,
      )

    if (!storeId || !cabangId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Store belum memiliki data toko/cabang yang valid.",
        },
        { status: 403 },
      )
    }

    let body: Record<
      string,
      unknown
    >
    try {
      body =
        (await request.json()) as Record<
          string,
          unknown
        >
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const tanggal =
      cleanString(
        body?.tanggal,
        20,
      )

    const employeeId =
      cleanString(
        body?.employeeId,
        100,
      )

    const employeeName =
      cleanString(
        body?.employeeName,
        150,
      )

    const jenisRevisi =
      cleanString(
        body?.jenisRevisi,
        50,
      )

    const jenisRevisiLainnya =
      cleanString(
        body?.jenisRevisiLainnya,
        300,
      )

    const keterangan =
      cleanString(
        body?.keterangan,
        2000,
      )

    if (
      !isValidDateISO(tanggal) ||
      !employeeId ||
      !employeeName
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data tanggal dan karyawan wajib diisi dengan benar.",
        },
        { status: 400 },
      )
    }

    if (
      !JENIS_REVISI_VALUES.has(
        jenisRevisi,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Jenis revisi tidak valid.",
        },
        { status: 400 },
      )
    }

    if (
      jenisRevisi ===
        REVISI_JENIS_LAINNYA &&
      !jenisRevisiLainnya
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Jenis revisi lainnya wajib diisi.",
        },
        { status: 400 },
      )
    }

    if (!keterangan) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Keterangan wajib diisi.",
        },
        { status: 400 },
      )
    }

    // Jadwal dibaca dari server sebagai referensi dan TIDAK
    // pernah mengubah collection schedules.
    const jadwalShift =
      await getEmployeeScheduleStatus(
        storeId,
        tanggal,
        employeeId,
      )

    const storeName =
      await getStoreName(storeId)

    const docRef =
      await adminDb
        .collection("revisi")
        .add({
          storeId,
          cabangId,
          storeName,
          employeeId,
          employeeName,
          tanggal,
          jenisRevisi,
          jenisRevisiLainnya:
            jenisRevisi ===
              REVISI_JENIS_LAINNYA
              ? jenisRevisiLainnya
              : "",
          jadwalShift: jadwalShift ?? null,
          keterangan,
          tanggalPengajuan:
            fmtDateTime(),
          status: "BARU",
          createdBy: {
            uid: null,
          },
          createdAt:
            FieldValue.serverTimestamp(),
          updatedAt:
            FieldValue.serverTimestamp(),
        })

    // Simpan createdBy setelah dokumen terbentuk agar
    // ID pengirim tidak di-set dari input client.
    await docRef.update({
      "createdBy.uid":
        (await getAuthenticatedUser(
          request,
        )).uid,
    })

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message:
          "Pengajuan revisi berhasil dibuat.",
      },
      { status: 201 },
    )
  } catch (error) {
    const code =
      error instanceof Error &&
      error.message
        ? error.message
        : ""

    if (
      code === "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda harus login terlebih dahulu.",
        },
        { status: 401 },
      )
    }

    if (
      code === "FORBIDDEN" ||
      code ===
        "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akses ditolak.",
        },
        { status: 403 },
      )
    }

    console.error(
      "Gagal membuat revisi:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          "Pengajuan revisi gagal dibuat. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }
}

// ============================================================
// PATCH
// Memajukan status revisi (BARU -> PROSES -> SELESAI).
// Khusus CENTRAL CABANG dan CENTRAL PUSAT.
// ============================================================

export async function PATCH(
  request: Request,
) {
  try {
    const {
      role,
      data: userData,
    } =
      await getAuthenticatedUser(
        request,
      )

    if (!isCentralRole(role)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya Central yang dapat memproses revisi.",
        },
        { status: 403 },
      )
    }

    let body: Record<
      string,
      unknown
    >
    try {
      body =
        (await request.json()) as Record<
          string,
          unknown
        >
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const id =
      cleanString(
        body?.id,
        200,
      )

    const targetStatus =
      cleanString(
        body?.status,
        20,
      )

    if (
      !id ||
      !REVISI_STATUS.has(
        targetStatus,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data revisi tidak valid.",
        },
        { status: 400 },
      )
    }

    const docRef =
      adminDb
        .collection("revisi")
        .doc(id)

    const docSnapshot =
      await docRef.get()

    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Pengajuan revisi tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const currentStatus =
      cleanString(
        docSnapshot.data()
          ?.status,
        20,
      )

    if (
      !REVISI_STATUS.has(
        currentStatus,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Status revisi tidak dikenali.",
        },
        { status: 400 },
      )
    }

    // =====================================================
    // PEMBATASAN SCOPE
    //
    // CENTRAL CABANG hanya boleh memproses revisi milik
    // cabangnya sendiri. CENTRAL PUSAT boleh memproses
    // seluruh revisi.
    // =====================================================

    const docCabangId =
      cleanString(
        docSnapshot.data()
          ?.cabangId,
        100,
      )

    if (
      role === "central_cabang"
    ) {
      const userCabangId =
        cleanString(
          userData?.cabangId,
          100,
        )

      if (
        !userCabangId ||
        docCabangId !== userCabangId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Anda hanya dapat memproses revisi pada cabang Anda.",
          },
          { status: 403 },
        )
      }
    }

    // Hanya boleh maju satu langkah: BARU -> PROSES,
    // PROSES -> SELESAI. Tidak boleh melompat/mundur.
    const allowedNext: Record<
      string,
      string
    > = {
      BARU: "PROSES",
      PROSES: "SELESAI",
      SELESAI: "SELESAI",
    }

    if (
      allowedNext[
        currentStatus
      ] !== targetStatus
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Perubahan status revisi tidak diizinkan.",
        },
        { status: 400 },
      )
    }

    const adminName =
      cleanString(
        userData?.nama ??
          userData?.email ??
          "Central",
        150,
      )

    await docRef.update({
      status: targetStatus,
      prosesAt: fmtDateTime(),
      prosesOleh: adminName,
      prosesUid: null,
      updatedAt:
        FieldValue.serverTimestamp(),
    })

    // Simpan prosesUid secara terpisah (dari akun).
    await docRef.update({
      prosesUid:
        (await getAuthenticatedUser(
          request,
        )).uid,
    })

    return NextResponse.json(
      {
        success: true,
        message:
          "Status revisi berhasil diperbarui.",
      },
    )
  } catch (error) {
    const code =
      error instanceof Error &&
      error.message
        ? error.message
        : ""

    if (
      code === "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda harus login terlebih dahulu.",
        },
        { status: 401 },
      )
    }

    if (
      code === "FORBIDDEN" ||
      code ===
        "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akses ditolak.",
        },
        { status: 403 },
      )
    }

    console.error(
      "Gagal memperbarui revisi:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          "Status revisi gagal diperbarui. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }
}
