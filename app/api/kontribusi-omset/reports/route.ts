import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { getKontribusiOmsetReportId } from "@/lib/kontribusi-omset/types"
import { getTodayJakarta } from "@/lib/kontribusi-omset/target-harian"

const COLLECTION_NAME = "kontribusi_omset_reports"

const MAX_ANGKA = 1_000_000_000_000

type KontribusiUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
  nama: string
}

type KontribusiEmployee = {
  employeeId: string
  employeeNameSnapshot: string
  visitorValue: number
  visitorConfirmed: boolean
  revenueValue: number
  revenueConfirmed: boolean
}

type KontribusiStoreScope = {
  storeIds: string[]
  invalidStore?: boolean
}

async function getAuthenticatedUser(
  request: Request,
): Promise<KontribusiUser> {
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

  const uid =
    decodedToken.uid

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data =
    userSnapshot.data() ?? {}

  const role =
    String(data?.role ?? "").trim()

  const storeId =
    String(data?.storeId ?? "").trim()

  const cabangId =
    String(data?.cabangId ?? "").trim()

  const nama =
    String(
      data?.nama ?? data?.email ?? "",
    ).trim()

  const aktif =
    data?.aktif === true

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

function normalize(
  value: unknown,
): string {
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

function pad2(
  value: number,
): string {
  return String(value).padStart(2, "0")
}

function isValidDateISO(
  value: unknown,
): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const [year, month, day] =
    value.split("-").map(Number)

  const date =
    new Date(year, month - 1, day)

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

function buildPeriod(
  year: number,
  month: number,
): {
  periode: string
  start: string
  end: string
} {
  const periode =
    `${year}-${pad2(month + 1)}`

  const start =
    `${periode}-01`

  const endYear =
    month === 11 ? year + 1 : year

  const endMonth =
    month === 11 ? 0 : month + 1

  const end =
    `${endYear}-${pad2(endMonth + 1)}-01`

  return { periode, start, end }
}

function getSafeNumber(
  value: unknown,
): number {
  const num =
    Number(value)

  return Number.isFinite(num)
    ? Math.round(num)
    : 0
}

function toIsoTimestamp(
  value: unknown,
): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in (value as Record<string, unknown>)
  ) {
    const maybeDate =
      (value as Record<string, unknown>)
        .toDate as (() => Date) | undefined

    if (typeof maybeDate === "function") {
      try {
        const date = maybeDate()
        if (date instanceof Date && !isNaN(date.getTime())) {
          return date.toISOString()
        }
      } catch {
        return null
      }
    }
  }

  return typeof value === "string"
    ? value
    : null
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

async function getEmployeeSnapshot(
  employeeId: string,
): Promise<{
  name: string
  storeId: string
  aktif: boolean
  tanggalNonaktif: string | null
} | null> {
  const snapshot =
    await adminDb
      .collection("employees")
      .doc(employeeId)
      .get()

  if (!snapshot.exists) {
    return null
  }

  const data =
    snapshot.data() ?? {}

  return {
    name: cleanString(
      data?.name ?? data?.nama ?? "-",
      150,
    ),
    storeId: cleanString(
      data?.storeId,
      100,
    ),
    aktif:
      data?.aktif === true,
    tanggalNonaktif:
      typeof data?.tanggalNonaktif === "string"
        ? data.tanggalNonaktif
        : null,
  }
}

function toReportRow(
  docId: string,
  data: Record<string, unknown>,
) {
  const rawEmployees =
    Array.isArray(data?.employees)
      ? (data.employees as Record<string, unknown>[])
      : []

  const employees =
    rawEmployees.map(
      (employee) => ({
        employeeId:
          cleanString(
            employee?.employeeId,
            200,
          ),
        employeeName:
          cleanString(
            employee?.employeeName ??
              employee?.employeeNameSnapshot,
            150,
          ),
        visitor:
          typeof employee?.visitor === "number"
            ? employee.visitor
            : typeof employee?.visitorValue === "number"
              ? employee.visitorValue
              : 0,
        omset:
          typeof employee?.omset === "number"
            ? employee.omset
            : typeof employee?.revenueValue === "number"
              ? employee.revenueValue
              : 0,
      }),
    )

  const totalVisitor =
    getSafeNumber(data?.totalVisitor)

  const totalRevenue =
    getSafeNumber(
      data?.totalOmset ?? data?.totalRevenue,
    )

  const averageRevenuePerTransaction =
    getSafeNumber(
      data?.averageRevenuePerTransaction,
    ) ||
    (totalVisitor > 0
      ? Math.round(totalRevenue / totalVisitor)
      : 0)

  const employeeCountSnapshot =
    getSafeNumber(data?.employeeCountSnapshot)

  const createdBy =
    data?.createdBy as
    | Record<string, unknown>
    | string
    | undefined

  return {
    reportId: docId,
    storeId: cleanString(
      data?.storeId,
      100,
    ),
    tanggal: cleanString(
      data?.tanggal ?? data?.reportDate,
      20,
    ),
    employees,
    totalVisitor,
    totalOmset: totalRevenue,
    jumlahKaryawan:
      employeeCountSnapshot > 0
        ? employeeCountSnapshot
        : employees.length,
    inputBy:
      cleanString(
        data?.inputBy ?? createdBy,
        150,
      ) || cleanString(
        (createdBy as Record<string, unknown> | undefined)
          ?.uid,
        150,
      ),
    inputAt:
      toIsoTimestamp(
        data?.inputAt ?? data?.createdAt,
      ),
    updatedBy:
      cleanString(
        data?.updatedBy,
        150,
      ),
    updatedAt:
      toIsoTimestamp(
        data?.updatedAt,
      ),
  }
}

function errorResponse(
  error: unknown,
) {
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

  if (code === "INVALID_PERIOD") {
    return NextResponse.json(
      {
        success: false,
        message: "Periode tidak valid.",
      },
      { status: 400 },
    )
  }

  if (code === "NOT_FOUND") {
    return NextResponse.json(
      {
        success: false,
        message: "Laporan omset tidak ditemukan.",
      },
      { status: 404 },
    )
  }

  if (code === "DUPLICATE") {
    return NextResponse.json(
      {
        success: false,
        message: "Laporan omset untuk tanggal tersebut sudah ada.",
      },
      { status: 409 },
    )
  }

  if (code === "INVALID_DATE") {
    return NextResponse.json(
      {
        success: false,
        message: "Tanggal laporan tidak valid.",
      },
      { status: 400 },
    )
  }

  if (code === "FORBIDDEN_DATE") {
    return NextResponse.json(
      {
        success: false,
        message: "Hanya laporan pada bulan berjalan atau bulan sebelumnya yang dapat dihapus.",
      },
      { status: 403 },
    )
  }

  console.error(
    "Gagal memproses Kontribusi Omset:",
    error,
  )

  return NextResponse.json(
    {
      success: false,
      message: "Kesalahan tidak terduga. Silakan coba lagi.",
    },
    { status: 500 },
  )
}

async function resolveStoreIds(
  user: KontribusiUser,
  cabangParam: string,
  storeParam: string = "",
): Promise<KontribusiStoreScope> {
  const role =
    user.role.toLowerCase()

  if (role === "store") {
    const storeId =
      user.storeId

    if (!storeId) {
      return {
        storeIds: [],
        invalidStore: true,
      }
    }

    return {
      storeIds: [storeId],
    }
  }

  let cabangId =
    user.cabangId

  if (role === "central_pusat") {
    cabangId =
      normalize(cabangParam)

    if (
      !cabangId ||
      cabangId === "ALL" ||
      cabangId === "__ALL__"
    ) {
      return {
        storeIds: [],
        invalidStore: true,
      }
    }
  }

  if (!cabangId) {
    return {
      storeIds: [],
      invalidStore: true,
    }
  }

  const snapshot =
    await adminDb
      .collection("stores")
      .where("cabangId", "==", cabangId)
      .get()

  const storeIds: string[] = []

  snapshot.docs.forEach(
    (doc) => {
      const data =
        doc.data() ?? {}

      const storeId =
        String(
          data?.storeId ?? doc.id ?? "",
        ).trim()

      if (!storeId) {
        return
      }

      if (
        normalize(data?.cabangId) !==
        cabangId
      ) {
        return
      }

      if (data?.aktif === false) {
        return
      }

      if (
        !storeIds.includes(storeId)
      ) {
        storeIds.push(storeId)
      }
    },
  )

  if (storeParam) {
    const normalizedStoreParam =
      normalize(storeParam)

    if (
      !storeIds.includes(
        normalizedStoreParam,
      )
    ) {
      return {
        storeIds: [],
        invalidStore: true,
      }
    }

    return {
      storeIds: [
        normalizedStoreParam,
      ],
    }
  }

  return {
    storeIds,
    invalidStore: false,
  }
}

export async function GET(
  request: Request,
) {
  try {
    const user =
      await getAuthenticatedUser(
        request,
      )

    const url =
      new URL(request.url)

    const year =
      Number(url.searchParams.get("year") ?? "")

    const month =
      Number(url.searchParams.get("month") ?? "")

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 0 ||
      month > 11
    ) {
      throw new Error("INVALID_PERIOD")
    }

    const {
      periode,
      start,
      end,
    } =
      buildPeriod(
        year,
        month,
      )

    const storeParam =
      cleanString(
        url.searchParams.get("store") ?? "",
        100,
      )

    const cabangParam =
      cleanString(
        url.searchParams.get("cabang") ?? "",
        100,
      )

    const scope =
      await resolveStoreIds(
        user,
        user.role.toLowerCase() === "central_pusat"
          ? cabangParam
          : "",
        user.role.toLowerCase() === "central_pusat"
          ? storeParam
          : "",
      )

    if (scope.invalidStore) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko yang dipilih tidak berada dalam cakupan akun Anda.",
        },
        { status: 403 },
      )
    }

    if (
      storeParam &&
      !scope.storeIds.includes(storeParam)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko yang dipilih tidak berada dalam cakupan akun Anda.",
        },
        { status: 403 },
      )
    }

    const targetStoreIds =
      storeParam
        ? [storeParam]
        : scope.storeIds

    const reports: ReturnType<
      typeof toReportRow
    >[] = []

    for (
      const storeId of targetStoreIds
    ) {
      const snapshot =
        await adminDb
          .collection(
            COLLECTION_NAME,
          )
          .where(
            "storeId",
            "==",
            storeId,
          )
          .get()

      snapshot.docs.forEach(
        (doc) => {
          const data =
            doc.data() ?? {}

          const reportDate =
            cleanString(
              data?.tanggal ??
                data?.reportDate,
              20,
            )

          if (
            !reportDate ||
            reportDate < start ||
            reportDate >= end
          ) {
            return
          }

          reports.push(
            toReportRow(
              doc.id,
              data,
            ),
          )
        },
      )
    }

    reports.sort(
      (a, b) =>
        String(a.tanggal).localeCompare(
          String(b.tanggal),
        ),
    )

    return NextResponse.json(
      {
        success: true,
        periode,
        year,
        month,
        reports,
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

function parseSafeNumber(
  value: unknown,
): number | null {
  const num =
    Number(value)

  if (
    !Number.isFinite(num) ||
    !Number.isInteger(num) ||
    num < 0 ||
    num >= MAX_ANGKA
  ) {
    return null
  }

  return num
}

export async function POST(
  request: Request,
) {
  try {
    const user =
      await getAuthenticatedUser(
        request,
      )

    if (
      user.role.toLowerCase() !==
      "store"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mencatat laporan omset.",
        },
        { status: 403 },
      )
    }

    const storeId =
      user.storeId

    const cabangId =
      user.cabangId

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

    let body:
      Record<string, unknown>

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
      cleanString(body?.tanggal, 20)

    if (
      !isValidDateISO(tanggal)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tanggal laporan tidak valid.",
        },
        { status: 400 },
      )
    }

    const todayJakartaPost = getTodayJakarta()
    const todayStrPost = todayJakartaPost
      ? `${todayJakartaPost.year}-${pad2(todayJakartaPost.month + 1)}-${pad2(todayJakartaPost.date)}`
      : null
    if (todayStrPost && tanggal > todayStrPost) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tanggal mendatang tidak dapat dipilih.",
        },
        { status: 400 },
      )
    }

    const year =
      Number(tanggal.slice(0, 4))

    const month =
      Number(tanggal.slice(5, 7)) - 1

    const {
      periode,
    } =
      buildPeriod(
        year,
        month,
      )

    const rawEmployees =
      Array.isArray(body?.employees)
        ? (body.employees as Record<
          string,
          unknown
        >[])
        : []

    if (
      rawEmployees.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data karyawan wajib diisi.",
        },
        { status: 400 },
      )
    }

    const employees:
      KontribusiEmployee[] = []

    const seen =
      new Set<string>()

    let totalVisitor =
      0

    let totalRevenue =
      0

    for (
      const raw of rawEmployees
    ) {
      const employeeId =
        cleanString(
          raw?.employeeId,
          200,
        )

      if (
        !employeeId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Employee wajib diisi.",
          },
          { status: 400 },
        )
      }

      if (
        seen.has(employeeId)
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Employee duplikat dalam laporan.",
          },
          { status: 400 },
        )
      }

      seen.add(
        employeeId,
      )

      const revenueValue =
        parseSafeNumber(
          raw?.omset ?? raw?.revenueValue,
        )

      const visitorValue =
        parseSafeNumber(
          raw?.visitor ?? raw?.visitorValue,
        )

      if (
        revenueValue === null
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Nominal omset tidak valid.",
          },
          { status: 400 },
        )
      }

      if (
        visitorValue === null
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Jumlah visitor tidak valid.",
          },
          { status: 400 },
        )
      }

      const employee =
        await getEmployeeSnapshot(
          employeeId,
        )

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

      employees.push(
        {
          employeeId,
          employeeNameSnapshot:
            employee.name,
          visitorValue,
          visitorConfirmed:
            raw?.visitorConfirmed === true,
          revenueValue,
          revenueConfirmed:
            raw?.revenueConfirmed === true,
        },
      )

      totalVisitor +=
        visitorValue

      totalRevenue +=
        revenueValue
    }

    const allConfirmed =
      employees.every(
        (employee) =>
          employee.visitorConfirmed &&
          employee.revenueConfirmed,
      )

    const status =
      allConfirmed
        ? "LENGKAP"
        : "BELUM_LENGKAP"

    const reportId =
      getKontribusiOmsetReportId(
        storeId,
        tanggal,
      )

    const created =
      await adminDb.runTransaction(
        async (tx) => {
          const docRef =
            adminDb.collection(
              COLLECTION_NAME,
            ).doc(reportId)

          const docSnapshot =
            await tx.get(
              docRef,
            )

          if (
            docSnapshot.exists
          ) {
            return false
          }

          tx.create(
            docRef,
            {
              storeId,
              cabangId,
              reportDate: tanggal,
              periode,
              status,
              employeeCountSnapshot:
                employees.length,
              totalVisitor,
              totalTransactions:
                totalVisitor,
              totalRevenue,
              averageRevenuePerTransaction:
                totalVisitor > 0
                  ? Math.round(
                    totalRevenue / totalVisitor,
                  )
                  : 0,
              employees: employees.map(
                (employee) => ({
                  ...employee,
                }),
              ),
              createdBy:
                user.uid,
              createdAt:
                FieldValue.serverTimestamp(),
              updatedBy:
                user.uid,
              updatedAt:
                FieldValue.serverTimestamp(),
            },
          )

          return true
        },
      )

    if (!created) {
      throw new Error("DUPLICATE")
    }

    return NextResponse.json(
      {
        success: true,
        id: reportId,
        message:
          "Laporan omset berhasil disimpan.",
      },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(
  request: Request,
) {
  try {
    const user =
      await getAuthenticatedUser(
        request,
      )

    if (
      user.role.toLowerCase() !==
      "store"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mengubah laporan omset.",
        },
        { status: 403 },
      )
    }

    const storeId =
      user.storeId

    const cabangId =
      user.cabangId

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

    let body:
      Record<string, unknown>

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
      cleanString(body?.id, 200)

    const tanggal =
      cleanString(body?.tanggal, 20) ||
      (id
        ? id.split("__")[1] || ""
        : "")

    const reportId =
      id ||
      (tanggal
        ? getKontribusiOmsetReportId(
          storeId,
          tanggal,
        )
        : "")

    if (!reportId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data laporan tidak valid.",
        },
        { status: 400 },
      )
    }

    const docRef =
      adminDb
        .collection(
          COLLECTION_NAME,
        ).doc(reportId)

    const docSnapshot =
      await docRef.get()

    if (!docSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Laporan omset tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const current =
      docSnapshot.data() ?? {}

    if (
      cleanString(
        current?.storeId,
        100,
      ) !== storeId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat mengubah laporan pada toko Anda.",
        },
        { status: 403 },
      )
    }

    const reportTanggal =
      cleanString(
        current?.tanggal ?? current?.reportDate,
        20,
      )

    const effectiveTanggal =
      cleanString(body?.tanggal, 20) || reportTanggal

    if (
      !isValidDateISO(effectiveTanggal)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tanggal laporan tidak valid.",
        },
        { status: 400 },
      )
    }

    const todayJakartaPatch = getTodayJakarta()
    const todayStrPatch = todayJakartaPatch
      ? `${todayJakartaPatch.year}-${pad2(todayJakartaPatch.month + 1)}-${pad2(todayJakartaPatch.date)}`
      : null
    if (todayStrPatch && effectiveTanggal > todayStrPatch) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tanggal mendatang tidak dapat dipilih.",
        },
        { status: 400 },
      )
    }

    const rawEmployees =
      Array.isArray(body?.employees)
        ? (body.employees as Record<
          string,
          unknown
        >[])
        : []

    if (
      rawEmployees.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data karyawan wajib diisi.",
        },
        { status: 400 },
      )
    }

    const employees: KontribusiEmployee[] =
      []

    const seen =
      new Set<string>()

    let totalVisitor =
      0

    let totalRevenue =
      0

    for (
      const raw of rawEmployees
    ) {
      const employeeId =
        cleanString(
          raw?.employeeId,
          200,
        )

      if (
        !employeeId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Employee wajib diisi.",
          },
          { status: 400 },
        )
      }

      if (
        seen.has(employeeId)
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Employee duplikat dalam laporan.",
          },
          { status: 400 },
        )
      }

      seen.add(
        employeeId,
      )

      const revenueValue =
        parseSafeNumber(
          raw?.omset ?? raw?.revenueValue,
        )

      const visitorValue =
        parseSafeNumber(
          raw?.visitor ?? raw?.visitorValue,
        )

      if (
        revenueValue === null
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Nominal omset tidak valid.",
          },
          { status: 400 },
        )
      }

      if (
        visitorValue === null
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Jumlah visitor tidak valid.",
          },
          { status: 400 },
        )
      }

      const employee =
        await getEmployeeSnapshot(
          employeeId,
        )

      if (
        !employee ||
        !employeeAvailableAt(
          employee,
          storeId,
          effectiveTanggal,
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

      employees.push(
        {
          employeeId,
          employeeNameSnapshot:
            employee.name,
          visitorValue,
          visitorConfirmed:
            raw?.visitorConfirmed === true,
          revenueValue,
          revenueConfirmed:
            raw?.revenueConfirmed === true,
        },
      )

      totalVisitor +=
        visitorValue

      totalRevenue +=
        revenueValue
    }

    const allConfirmed =
      employees.every(
        (employee) =>
          employee.visitorConfirmed &&
          employee.revenueConfirmed,
      )

    const status =
      allConfirmed
        ? "LENGKAP"
        : "BELUM_LENGKAP"

    const year =
      Number(effectiveTanggal.slice(0, 4))

    const month =
      Number(effectiveTanggal.slice(5, 7)) - 1

    const {
      periode,
    } =
      buildPeriod(
        year,
        month,
      )

    await docRef.update(
      {
        employees: employees.map(
          (employee) => ({
            ...employee,
          }),
        ),
        employeeCountSnapshot:
          employees.length,
        totalVisitor,
        totalTransactions:
          totalVisitor,
        totalRevenue,
        averageRevenuePerTransaction:
          totalVisitor > 0
            ? Math.round(
              totalRevenue / totalVisitor,
            )
            : 0,
        status,
        updatedBy:
          user.uid,
        updatedAt:
          FieldValue.serverTimestamp(),
      },
    )

    return NextResponse.json(
      {
        success: true,
        id: reportId,
        message:
          "Laporan omset berhasil diperbarui.",
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(
  request: Request,
) {
  try {
    const user =
      await getAuthenticatedUser(
        request,
      )

    if (
      user.role.toLowerCase() !==
      "store"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat menghapus laporan omset.",
        },
        { status: 403 },
      )
    }

    const storeId =
      user.storeId

    const cabangId =
      user.cabangId

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

    let body:
      Record<string, unknown>

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
      cleanString(body?.tanggal, 20)

    if (!isValidDateISO(tanggal)) {
      throw new Error("INVALID_DATE")
    }

    const reportId =
      getKontribusiOmsetReportId(
        storeId,
        tanggal,
      )

    const docRef =
      adminDb
        .collection(
          COLLECTION_NAME,
        ).doc(reportId)

    const docSnapshot =
      await docRef.get()

    if (!docSnapshot.exists) {
      throw new Error("NOT_FOUND")
    }

    const current =
      docSnapshot.data() ?? {}

    if (
      cleanString(
        current?.storeId,
        100,
      ) !== storeId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda hanya dapat menghapus laporan pada toko Anda.",
        },
        { status: 403 },
      )
    }

    const reportTanggal =
      cleanString(
        current?.tanggal ?? current?.reportDate,
        20,
      )

    const year =
      Number(reportTanggal.slice(0, 4))

    const month =
      Number(reportTanggal.slice(5, 7)) - 1

    const todayJakarta =
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())

    const todayYear =
      Number(
        todayJakarta.find((p) => p.type === "year")
          ?.value ?? 0,
      )

    const todayMonth =
      Number(
        todayJakarta.find((p) => p.type === "month")
          ?.value ?? 0,
      ) - 1

    const currentPeriode =
      todayYear * 12 + todayMonth

    const reportPeriode =
      year * 12 + month

    if (
      reportPeriode < currentPeriode - 1
    ) {
      throw new Error("FORBIDDEN_DATE")
    }

    await docRef.delete()

    return NextResponse.json(
      {
        success: true,
        id: reportId,
        message:
          "Laporan omset berhasil dihapus.",
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
