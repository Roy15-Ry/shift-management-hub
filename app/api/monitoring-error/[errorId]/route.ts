import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import {
  isMonitoringErrorJenis,
  isMonitoringErrorKeteranganValid,
  isMonitoringErrorLainnya,
  type MonitoringErrorJenis,
} from "@/lib/monitoring-error"

// ============================================================
// MONITORING ERROR — UBAH / HAPUS 1 KEJADIAN
// ============================================================
//
// PATCH  -> mengubah kejadian milik Store login sendiri.
// DELETE -> menghapus (physical delete) kejadian milik Store
//           login sendiri.
//
// Keduanya HANYA untuk role STORE. Central Cabang dan Central
// Pusat bersifat read-only dan akan menolak di route ini.
//
// storeId / cabangId dokumen TIDAK pernah diambil dari body.
// Ownership diverifikasi server-side terhadap users/{uid}
// dan field storeId dokumen.
//
// Keterangan Manual HANYA disimpan saat keterangan = LAINNYA.
// Memilih kembali pilihan standar akan mengosongkan nilai manual.
//
// Route ini TIDAK menulis ke history global.
// ============================================================

const COLLECTION = "monitoring_errors"

type MonitoringErrorUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
  nama: string
}

// ============================================================
// AUTH
// ============================================================

async function getAuthenticatedUser(
  request: Request,
): Promise<MonitoringErrorUser> {
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

  const userSnapshot = await adminDb
    .collection("users")
    .doc(uid)
    .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data = userSnapshot.data() ?? {}

  const role = String(data?.role ?? "").trim()
  const storeId = String(data?.storeId ?? "").trim()
  const cabangId = String(data?.cabangId ?? "").trim()
  const nama = String(
    data?.nama ?? data?.email ?? "",
  ).trim()

  const aktif = data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return { uid, role, storeId, cabangId, nama }
}

// ============================================================
// UTILITAS
// ============================================================

function cleanString(
  value: unknown,
  max = 500,
): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().slice(0, max)
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function isValidDateISO(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const [year, month, day] =
    value.split("-").map(Number)

  const date = new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function todayISO(): string {
  const now = new Date()

  return `${now.getFullYear()}-${pad2(
    now.getMonth() + 1,
  )}-${pad2(now.getDate())}`
}

// ============================================================
// EMPLOYEE AVAILABILITY (pola existing)
// ============================================================

async function getEmployeeSnapshot(
  employeeId: string,
): Promise<{
  name: string
  storeId: string
  aktif: boolean
  tanggalNonaktif: string | null
} | null> {
  const snapshot = await adminDb
    .collection("employees")
    .doc(employeeId)
    .get()

  if (!snapshot.exists) {
    return null
  }

  const data = snapshot.data() ?? {}

  return {
    name: cleanString(
      data?.name ?? data?.nama ?? "-",
      150,
    ),
    storeId: cleanString(data?.storeId, 100),
    aktif: data?.aktif === true,
    tanggalNonaktif:
      typeof data?.tanggalNonaktif === "string"
        ? data.tanggalNonaktif
        : null,
  }
}

function employeeAvailableAt(
  employee: {
    storeId: string
    aktif: boolean
    tanggalNonaktif: string | null
  },
  storeId: string,
  tanggal: string,
): boolean {
  return (
    employee.storeId === storeId &&
    (employee.aktif ||
      (employee.tanggalNonaktif !== null &&
        tanggal <= employee.tanggalNonaktif))
  )
}

// ============================================================
// RESPONSE HELPER
// ============================================================

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && error.message
      ? error.message
      : ""

  if (code === "AUTH_REQUIRED") {
    return NextResponse.json(
      {
        success: false,
        message: "Anda harus login terlebih dahulu.",
      },
      { status: 401 },
    )
  }

  if (
    code === "FORBIDDEN" ||
    code === "USER_PROFILE_NOT_FOUND"
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "Akses ditolak.",
      },
      { status: 403 },
    )
  }

  console.error(
    "Gagal memproses Monitoring Error:",
    error,
  )

  return NextResponse.json(
    {
      success: false,
      message:
        "Kesalahan tidak terduga. Silakan coba lagi.",
    },
    { status: 500 },
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 400 },
  )
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 403 },
  )
}

function notFound(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 404 },
  )
}

// Siapkan dokumen milik store login. Mengembalikan docRef dan
// data bila ada.
async function loadOwnedDoc(
  errorId: string,
  storeId: string,
) {
  const id = cleanString(errorId, 200)

  if (!id) {
    return { error: badRequest("Data tidak valid.") } as const
  }

  const docRef = adminDb
    .collection(COLLECTION)
    .doc(id)

  const docSnapshot = await docRef.get()

  if (!docSnapshot.exists) {
    return {
      error: notFound("Monitoring Error tidak ditemukan."),
    } as const
  }

  const current = docSnapshot.data() ?? {}

  if (cleanString(current?.storeId, 100) !== storeId) {
    return {
      error: forbidden(
        "Anda hanya dapat mengelola Monitoring Error pada toko Anda.",
      ),
    } as const
  }

  return { docRef, current } as const
}

// ============================================================
// PATCH — UBAH KEJADIAN MILIK STORE SENDIRI
// ============================================================

export async function PATCH(
  request: Request,
  context: { params: Promise<{ errorId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return forbidden(
        "Hanya akun Store yang dapat mengubah Monitoring Error.",
      )
    }

    const storeId = user.storeId
    const cabangId = user.cabangId

    if (!storeId || !cabangId) {
      return forbidden(
        "Akun Store belum memiliki data toko/cabang yang valid.",
      )
    }

    const { errorId } = await context.params

    const loaded = await loadOwnedDoc(errorId, storeId)

    if ("error" in loaded) {
      return loaded.error
    }

    const { docRef } = loaded

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<
        string,
        unknown
      >
    } catch {
      return badRequest("Body request tidak valid.")
    }

    // ----------------------------------------------------------
    // VALIDASI FIELD
    // ----------------------------------------------------------

    const tanggal = cleanString(body?.tanggal, 20)
    const employeeId = cleanString(body?.employeeId, 200)
    const rawJenis = cleanString(body?.jenisError, 80)
    const rawKeterangan = cleanString(body?.keterangan, 200)
    const rawManual = cleanString(
      body?.keteranganManual,
      500,
    )

    if (!isValidDateISO(tanggal) || !employeeId) {
      return badRequest(
        "Tanggal dan Nama Karyawan wajib diisi dengan benar.",
      )
    }

    if (tanggal > todayISO()) {
      return badRequest(
        "Tanggal tidak boleh lebih dari hari ini.",
      )
    }

    if (!isMonitoringErrorJenis(rawJenis)) {
      return badRequest("Jenis error tidak valid.")
    }

    const jenisError = rawJenis as MonitoringErrorJenis

    if (
      !isMonitoringErrorKeteranganValid(
        jenisError,
        rawKeterangan,
      )
    ) {
      return badRequest(
        `Keterangan tidak sesuai untuk jenis error ${jenisError}.`,
      )
    }

    const keterangan = rawKeterangan.trim().toUpperCase()

    let keteranganManual = ""

    if (isMonitoringErrorLainnya(keterangan)) {
      if (!rawManual.trim()) {
        return badRequest(
          "Keterangan manual wajib diisi ketika memilih LAINNYA.",
        )
      }
      keteranganManual = rawManual.trim()
    }

    const employee =
      await getEmployeeSnapshot(employeeId)

    if (
      !employee ||
      !employeeAvailableAt(
        employee,
        storeId,
        tanggal,
      )
    ) {
      return badRequest(
        "Karyawan tidak tersedia pada tanggal pencatatan yang dipilih.",
      )
    }

    const storeSnapshot = await adminDb
      .collection("stores")
      .where("storeId", "==", storeId)
      .limit(1)
      .get()

    const storeData = storeSnapshot.docs[0]?.data()

    const storeName =
      cleanString(
        storeData?.namaStore ?? storeData?.nama,
        120,
      ) || storeId

    await docRef.update({
      storeName,
      employeeId,
      employeeName: employee.name,
      tanggal,
      jenisError,
      keterangan,
      keteranganManual,
      updatedBy: {
        uid: user.uid,
        nama: user.nama,
        role: user.role,
      },
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      message: "Monitoring Error berhasil diperbarui.",
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// DELETE — HAPUS KEJADIAN MILIK STORE SENDIRI
// ============================================================

export async function DELETE(
  request: Request,
  context: { params: Promise<{ errorId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return forbidden(
        "Hanya akun Store yang dapat menghapus Monitoring Error.",
      )
    }

    const storeId = user.storeId

    if (!storeId) {
      return forbidden(
        "Akun Store belum memiliki data toko yang valid.",
      )
    }

    const { errorId } = await context.params

    const loaded = await loadOwnedDoc(errorId, storeId)

    if ("error" in loaded) {
      return loaded.error
    }

    await loaded.docRef.delete()

    return NextResponse.json({
      success: true,
      message: "Monitoring Error berhasil dihapus.",
    })
  } catch (error) {
    return errorResponse(error)
  }
}
