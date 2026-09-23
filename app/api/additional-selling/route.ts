import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// ADDITIONAL SELLING — PENCATATAN & DASHBOARD
//
// GET   -> agregasi Dashboard + daftar pencatatan + target,
//          scope otorisasi SELALU dari akun (bukan client).
// POST  -> membuat pencatatan (khusus STORE).
// PATCH -> mengubah pencatatan milik Store login sendiri.
// DELETE-> menghapus pencatatan milik Store login sendiri.
//
// SCOPE (ditentukan dari akun):
//   STORE          -> hanya tokonya sendiri (storeId akun)
//   CENTRAL CABANG -> seluruh toko pada cabang akun
//   CENTRAL PUSAT  -> wajib memilih SATU cabang (param "cabang"),
//                     tidak ada fallback "Semua Cabang".
//
// Parameter year/month hanya menjadi FILTER periode setelah
// scope otorisasi diterapkan.
//
// Employee availability memakai pola Revisi: employee aktif,
// ATAU tanggal pencatatan masih <= tanggalNonaktif. Nama toko
// dan nama employee disimpan sebagai snapshot saat menulis.
//
// storeId, cabangId, storeName, employeeName, createdBy TIDAK
// pernah diambil dari body request.
// ============================================================

type AddSellUser = {
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
): Promise<AddSellUser> {
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

  return {
    uid,
    role,
    storeId,
    cabangId,
    nama,
  }
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toUpperCase()
}

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

function isValidPeriode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value)
  )
}

// ============================================================
// PERIODE
// ============================================================

function buildPeriod(
  year: number,
  month: number,
): { periode: string; start: string; end: string } {
  const periode = `${year}-${pad2(month + 1)}`
  const start = `${periode}-01`

  const endYear = month === 11 ? year + 1 : year
  const endMonth = month === 11 ? 0 : month + 1
  const end = `${endYear}-${pad2(endMonth + 1)}-01`

  return { periode, start, end }
}

// ============================================================
// SCOPE — Daftar storeId yang boleh diakses per role
// ============================================================
//
// Daftar toko diambil dari collection "stores" (master toko,
// ukuran kecil). Filtering cabang dilakukan di sisi server
// (bukan dipaksa client), lalu pencatatan per toko dibaca
// dengan kueri (storeId + rentang tanggal) — memakai index
// composite (storeId, tanggal) yang sudah aktif untuk kueri
// bulanan existing, sehingga TIDAK membutuhkan index baru.
// ============================================================

async function getAllStoresByCabang(): Promise<
  Map<string, string>
> {
  const snapshot =
    await adminDb
      .collection("stores")
      .get()

  const map = new Map<string, string>()

  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const storeId = String(
      data?.storeId ?? doc.id ?? "",
    ).trim()
    if (!storeId) {
      return
    }
    map.set(
      storeId,
      normalize(data?.cabangId ?? ""),
    )
  })

  return map
}

async function scopeForRole(
  user: AddSellUser,
  cabangParam: string,
): Promise<{
  scope: "store" | "cabang" | "pusat"
  storeIds: string[]
}> {
  const role = user.role.toLowerCase()

  if (role === "store") {
    if (!user.storeId) {
      return { scope: "store", storeIds: [] }
    }
    return { scope: "store", storeIds: [user.storeId] }
  }

  const storesByCabang = await getAllStoresByCabang()

  if (role === "central_cabang") {
    if (!user.cabangId) {
      return { scope: "cabang", storeIds: [] }
    }
    const cabang = normalize(user.cabangId)
    return {
      scope: "cabang",
      storeIds: Array.from(storesByCabang.entries())
        .filter(([, cabangId]) => cabangId === cabang)
        .map(([storeId]) => storeId),
    }
  }

  return {
    scope: "pusat",
    storeIds: Array.from(storesByCabang.entries())
      .filter(([, cabangId]) => cabangId === cabangParam)
      .map(([storeId]) => storeId),
  }
}

// ============================================================
// HELPERS DATA
// ============================================================

async function getEmployeeSnapshot(
  employeeId: string,
): Promise<{ name: string; storeId: string; aktif: boolean; tanggalNonaktif: string | null } | null> {
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

async function getStoreName(
  storeId: string,
): Promise<string> {
  const snapshot = await adminDb
    .collection("stores")
    .where("storeId", "==", storeId)
    .limit(1)
    .get()

  const data = snapshot.docs[0]?.data()

  return (
    cleanString(
      data?.namaStore ?? data?.nama ?? storeId,
      120,
    ) || storeId
  )
}

// ============================================================
// VALIDASI NOMINAL
// ============================================================

function parseNominal(
  value: unknown,
): number | null {
  const nominal = Number(value)

  if (
    !Number.isFinite(nominal) ||
    !Number.isInteger(nominal) ||
    nominal <= 0 ||
    nominal >= 1_000_000_000_000
  ) {
    return null
  }

  return nominal
}

function isValidNominal(
  value: unknown,
): value is number {
  return parseNominal(value) !== null
}

// ============================================================
// VALIDASI EMPLOYEE AVAILABILITY (pola Revisi)
// ============================================================

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
    "Gagal memproses Additional Selling:",
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

// ============================================================
// GET — DASHBOARD + PENCATATAN + TARGET
// ============================================================

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    const role = user.role.toLowerCase()

    if (
      role !== "store" &&
      role !== "central_cabang" &&
      role !== "central_pusat"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Anda tidak memiliki izin.",
        },
        { status: 403 },
      )
    }

    const url = new URL(request.url)
    const year = Number(url.searchParams.get("year") ?? "")
    const month = Number(url.searchParams.get("month") ?? "")

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 0 ||
      month > 11
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Periode tidak valid.",
        },
        { status: 400 },
      )
    }

    const { periode, start, end } = buildPeriod(year, month)

    // CENTRAL PUSAT wajib memilih SATU cabang.
    let cabangParam = ""
    if (role === "central_pusat") {
      cabangParam = normalize(
        url.searchParams.get("cabang") ?? "",
      )

      if (
        !cabangParam ||
        cabangParam === "ALL" ||
        cabangParam === "__ALL__"
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Central Pusat wajib memilih satu cabang untuk melihat Additional Selling.",
          },
          { status: 400 },
        )
      }
    }

    const { storeIds } = await scopeForRole(user, cabangParam)

    if (storeIds.length === 0) {
      return NextResponse.json({
        success: true,
        periode,
        transactions: [],
        targets: [],
        summary: {
          totalNominal: 0,
          totalTarget: 0,
          progress: 0,
          perEmployee: [],
        },
      })
    }

    // =====================================================
    // PENCATATAN per toko (reuse index storeId+tanggal)
    // =====================================================

    const transactions: Record<string, unknown>[] = []

    for (const storeId of storeIds) {
      const snapshot = await adminDb
        .collection("additional_selling")
        .where("storeId", "==", storeId)
        .where("tanggal", ">=", start)
        .where("tanggal", "<", end)
        .get()

      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        transactions.push({
          id: doc.id,
          storeId: cleanString(data?.storeId, 100),
          cabangId: cleanString(data?.cabangId, 100),
          storeName: cleanString(data?.storeName, 120),
          employeeId: cleanString(data?.employeeId, 200),
          employeeName: cleanString(data?.employeeName, 150),
          tanggal: cleanString(data?.tanggal, 20),
          nominal:
            typeof data?.nominal === "number"
              ? data.nominal
              : 0,
          keterangan: cleanString(data?.keterangan, 500),
          createdAt:
            data?.createdAt && typeof data.createdAt.toDate === "function"
              ? data.createdAt.toDate().toISOString()
              : null,
          updatedAt:
            data?.updatedAt && typeof data.updatedAt.toDate === "function"
              ? data.updatedAt.toDate().toISOString()
              : null,
        })
      })
    }

    // =====================================================
    // TARGET bulanan per employee pada scope
    // =====================================================

    const targets: Record<string, unknown>[] = []

    for (const storeId of storeIds) {
      const snapshot = await adminDb
        .collection("additional_selling_targets")
        .where("storeId", "==", storeId)
        .get()

      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        if (String(data?.periode ?? "") !== periode) {
          return
        }

        targets.push({
          id: doc.id,
          storeId: cleanString(data?.storeId, 100),
          cabangId: cleanString(data?.cabangId, 100),
          employeeId: cleanString(data?.employeeId, 200),
          employeeName: cleanString(data?.employeeName, 150),
          periode: cleanString(data?.periode, 20),
          targetNominal:
            typeof data?.targetNominal === "number"
              ? data.targetNominal
              : 0,
        })
      })
    }

    // =====================================================
    // SUMMARY (aggreasi di server)
    // =====================================================

    const nominalByEmployee =
      new Map<string, number>()
    const nameByEmployee =
      new Map<string, string>()

    const latest = new Map<string, Date>()

    for (const txn of transactions) {
      const employeeId = String(txn.employeeId ?? "")
      const nominal =
        typeof txn.nominal === "number"
          ? txn.nominal
          : 0

      nominalByEmployee.set(
        employeeId,
        (nominalByEmployee.get(employeeId) ?? 0) + nominal,
      )

      const createdAt = txn.createdAt
        ? new Date(String(txn.createdAt))
        : new Date(0)

      if (
        !latest.has(employeeId) ||
        createdAt > (latest.get(employeeId) ?? new Date(0))
      ) {
        latest.set(employeeId, createdAt)
        nameByEmployee.set(
          employeeId,
          String(txn.employeeName ?? "-"),
        )
      }
    }

    const employeeIds = new Set<string>([
      ...nominalByEmployee.keys(),
      ...targets.map((t) => String(t.employeeId ?? "")),
    ])

    const targetByEmployee = new Map<
      string,
      number
    >()

    for (const target of targets) {
      targetByEmployee.set(
        String(target.employeeId ?? ""),
        typeof target.targetNominal === "number"
          ? target.targetNominal
          : 0,
      )
    }

    const perEmployee = Array.from(employeeIds)
      .filter((employeeId) => employeeId)
      .map((employeeId) => {
        const targetNominal =
          targetByEmployee.get(employeeId) ?? 0
        const nominal =
          nominalByEmployee.get(employeeId) ?? 0

        const progress =
          targetNominal > 0
            ? Math.round((nominal / targetNominal) * 100)
            : 0

        return {
          employeeId,
          employeeName:
            nameByEmployee.get(employeeId) ?? "-",
          targetNominal,
          nominal,
          progress,
        }
      })
      .sort((a, b) =>
        a.employeeName.localeCompare(
          b.employeeName,
          "id",
          { sensitivity: "base" },
        ),
      )

    const totalNominal = perEmployee.reduce(
      (total, row) => total + row.nominal,
      0,
    )
    const totalTarget = perEmployee.reduce(
      (total, row) => total + row.targetNominal,
      0,
    )
    const progress =
      totalTarget > 0
        ? Math.round((totalNominal / totalTarget) * 100)
        : 0

    transactions.sort((a, b) => {
      const ta = String(a.tanggal ?? "")
      const tb = String(b.tanggal ?? "")
      if (ta !== tb) {
        return ta < tb ? -1 : 1
      }
      const ca = String(a.createdAt ?? "")
      const cb = String(b.createdAt ?? "")
      return ca < cb ? -1 : ca > cb ? 1 : 0
    })

    return NextResponse.json({
      success: true,
      periode,
      transactions,
      targets,
      summary: {
        totalNominal,
        totalTarget,
        progress,
        perEmployee,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// POST — MEMBUAT PENCATATAN (khusus STORE)
// ============================================================

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mencatat Additional Selling.",
        },
        { status: 403 },
      )
    }

    const storeId = user.storeId
    const cabangId = user.cabangId

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

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const tanggal = cleanString(body?.tanggal, 20)
    const employeeId = cleanString(body?.employeeId, 200)
    const nominal = body?.nominal
    const keterangan = cleanString(body?.keterangan, 500)

    if (!isValidDateISO(tanggal) || !employeeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tanggal dan Nama Tim wajib diisi dengan benar.",
        },
        { status: 400 },
      )
    }

    if (!isValidNominal(nominal)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nilai Additional Selling harus berupa bilangan bulat Rupiah yang valid.",
        },
        { status: 400 },
      )
    }

    // Simpan selalu sebagai number integer (bukan string).
    const nominalNumber = Number(nominal)

    if (keterangan.length > 500) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Keterangan terlalu panjang.",
        },
        { status: 400 },
      )
    }

    // Validasi ketersediaan employee pada tanggal pencatatan.
    const employee = await getEmployeeSnapshot(employeeId)

    if (
      !employee ||
      !employeeAvailableAt(
        employee,
        storeId,
        tanggal,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee tidak tersedia pada tanggal pencatatan yang dipilih.",
        },
        { status: 400 },
      )
    }

    const storeName = await getStoreName(storeId)

    const docRef = await adminDb
      .collection("additional_selling")
      .add({
        storeId,
        cabangId,
        storeName,
        employeeId,
        employeeName: employee.name,
        tanggal,
        nominal: nominalNumber,
        keterangan,
        createdBy: { uid: null },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

    await docRef.update({
      "createdBy.uid": (await getAuthenticatedUser(request)).uid,
    })

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        message:
          "Pencatatan Additional Selling berhasil disimpan.",
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// PATCH — MENGUBAH PENCATATAN milik Store sendiri
// ============================================================

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mengubah pencatatan Additional Selling.",
        },
        { status: 403 },
      )
    }

    const storeId = user.storeId
    const cabangId = user.cabangId

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

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const id = cleanString(body?.id, 200)
    const tanggal = cleanString(body?.tanggal, 20)
    const employeeId = cleanString(body?.employeeId, 200)
    const nominal = body?.nominal
    const keterangan = cleanString(body?.keterangan, 500)

    if (
      !id ||
      !isValidDateISO(tanggal) ||
      !employeeId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data pencatatan tidak valid.",
        },
        { status: 400 },
      )
    }

    if (!isValidNominal(nominal)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nilai Additional Selling harus berupa bilangan bulat Rupiah yang valid.",
        },
        { status: 400 },
      )
    }

    // Simpan selalu sebagai number integer (bukan string).
    const nominalNumber = Number(nominal)

    if (keterangan.length > 500) {
      return NextResponse.json(
        {
          success: false,
          message: "Keterangan terlalu panjang.",
        },
        { status: 400 },
      )
    }

    const docRef = adminDb
      .collection("additional_selling")
      .doc(id)

    const docSnapshot = await docRef.get()

    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message: "Pencatatan tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const current = docSnapshot.data() ?? {}

    if (cleanString(current?.storeId, 100) !== storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat mengubah pencatatan pada toko Anda.",
        },
        { status: 403 },
      )
    }

    // Validasi ketersediaan employee pada tanggal baru.
    const employee = await getEmployeeSnapshot(employeeId)

    if (
      !employee ||
      !employeeAvailableAt(
        employee,
        storeId,
        tanggal,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Employee tidak tersedia pada tanggal pencatatan yang dipilih.",
        },
        { status: 400 },
      )
    }

    const storeName = await getStoreName(storeId)

    await docRef.update({
      storeName,
      cabangId,
      employeeId,
      employeeName: employee.name,
      tanggal,
      nominal: nominalNumber,
      keterangan,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json(
      {
        success: true,
        message:
          "Pencatatan Additional Selling berhasil diperbarui.",
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// DELETE — MENGHAPUS PENCATATAN milik Store sendiri
// ============================================================

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat menghapus pencatatan Additional Selling.",
        },
        { status: 403 },
      )
    }

    const storeId = user.storeId

    if (!storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Store belum memiliki data toko yang valid.",
        },
        { status: 403 },
      )
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Body request tidak valid.",
        },
        { status: 400 },
      )
    }

    const id = cleanString(body?.id, 200)

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: "Data pencatatan tidak valid.",
        },
        { status: 400 },
      )
    }

    const docRef = adminDb
      .collection("additional_selling")
      .doc(id)

    const docSnapshot = await docRef.get()

    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message: "Pencatatan tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const current = docSnapshot.data() ?? {}

    if (cleanString(current?.storeId, 100) !== storeId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat menghapus pencatatan pada toko Anda.",
        },
        { status: 403 },
      )
    }

    await docRef.delete()

    return NextResponse.json(
      {
        success: true,
        message:
          "Pencatatan Additional Selling berhasil dihapus.",
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}