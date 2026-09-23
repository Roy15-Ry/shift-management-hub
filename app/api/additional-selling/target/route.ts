import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// ADDITIONAL SELLING — TARGET BULANAN PER EMPLOYEE
//
// Target bersifat: Store + Employee + Bulan (periode YYYY-MM).
// Target disimpan TERPISAH dari transaksi pencatatan.
//
// POST (khusus STORE) — upsert massal target untuk satu periode:
//   - Bila target (employee + periode) sudah ada -> EDIT (perbarui
//     nilai); tidak membuat duplikasi.
//   - Bila belum ada -> buat.
//
// ID dokumen DETERMINISTIK:
//   <storeId>_<employeeId>_<periode>
// sehingga duplikasi target dapat dicegah tanpa kueri composite
// dan tanpa perubahan firestore.indexes.json.
//
// Central tidak dapat mengubah target (belum ada keputusan
// eksplisit dari PRD). Nilai dari client (storeId/cabangId/
// employeeName/createdBy) TIDAK dipercaya — semua diambil dari
// akun dan database.
// ============================================================

type TargetUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
}

// ============================================================
// AUTH
// ============================================================

async function getAuthenticatedUser(
  request: Request,
): Promise<TargetUser> {
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
  const aktif = data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return {
    uid,
    role,
    storeId,
    cabangId,
  }
}

// ============================================================
// HELPERS
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

function isValidPeriode(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value)
  )
}

// Karakter yang aman sebagai Firestore document id.
function sanitizeDocId(value: string): string {
  return value.replace(/[^\w.\-]/g, "_")
}

function toTargetUpserts(
  body: Record<string, unknown>,
):
  | { periode: string; items: { employeeId: string; targetNominal: number }[] }
  | { error: string } {
  const periode = cleanString(body?.periode, 20)

  if (!isValidPeriode(periode)) {
    return { error: "Periode tidak valid." }
  }

  const rawItems = body?.targets

  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0
  ) {
    return { error: "Target tidak boleh kosong." }
  }

  if (rawItems.length > 500) {
    return { error: "Terlalu banyak target dalam satu penyimpanan." }
  }

  const items: { employeeId: string; targetNominal: number }[] = []

  for (const rawItem of rawItems) {
    const item =
      rawItem && typeof rawItem === "object"
        ? (rawItem as Record<string, unknown>)
        : null

    if (!item) {
      return { error: "Data target tidak valid." }
    }

    const employeeId = cleanString(item?.employeeId, 200)
    const targetValue = Number(item?.targetNominal)

    if (!employeeId) {
      return { error: "Employee tidak valid." }
    }

    if (
      !Number.isFinite(targetValue) ||
      !Number.isInteger(targetValue) ||
      targetValue < 0 ||
      targetValue >= 1_000_000_000_000
    ) {
      return { error: "Nilai target harus berupa bilangan bulat Rupiah yang valid." }
    }

    items.push({ employeeId, targetNominal: targetValue })
  }

  return { periode, items }
}

// ============================================================
// POST — UPSERT TARGET (khusus STORE)
// ============================================================

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (user.role.toLowerCase() !== "store") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya akun Store yang dapat mengatur target Additional Selling.",
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

    const parsed = toTargetUpserts(body)

    if ("error" in parsed) {
      return NextResponse.json(
        {
          success: false,
          message: parsed.error,
        },
        { status: 400 },
      )
    }

    // Validate employee: harus milik Store login. Apabila satu
    // employee tidak valid, seluruh request ditolak (atomik).
    const employeePayloads: {
      employeeId: string
      employeeName: string
      targetNominal: number
    }[] = []

    for (const item of parsed.items) {
      const snapshot = await adminDb
        .collection("employees")
        .doc(item.employeeId)
        .get()

      if (!snapshot.exists) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Employee tidak ditemukan di database.",
          },
          { status: 400 },
        )
      }

      const data = snapshot.data() ?? {}

      if (cleanString(data?.storeId, 100) !== storeId) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Anda hanya dapat mengatur target untuk employee pada toko Anda.",
          },
          { status: 403 },
        )
      }

      employeePayloads.push({
        employeeId: item.employeeId,
        employeeName: cleanString(
          data?.name ?? data?.nama ?? "-",
          150,
        ),
        targetNominal: item.targetNominal,
      })
    }

    const docBase = sanitizeDocId(storeId)
    const periode = parsed.periode

    for (const payload of employeePayloads) {
      const docId = `${docBase}_${sanitizeDocId(payload.employeeId)}_${periode}`

      const docRef =
        adminDb
          .collection("additional_selling_targets")
          .doc(docId)

      const existing = await docRef.get()

      if (existing.exists) {
        // EDIT target existing — jangan membuat duplikasi.
        await docRef.update({
          employeeName: payload.employeeName,
          targetNominal: payload.targetNominal,
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        await docRef.set({
          storeId,
          cabangId,
          employeeId: payload.employeeId,
          employeeName: payload.employeeName,
          periode,
          targetNominal: payload.targetNominal,
          createdBy: { uid: null },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        await docRef.update({
          "createdBy.uid": (await getAuthenticatedUser(request)).uid,
        })
      }
    }

    return NextResponse.json({
      success: true,
      periode,
      processed: employeePayloads.length,
      message:
        "Target berhasil disimpan.",
    })
  } catch (error) {
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
      "Gagal menyimpan target Additional Selling:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          "Target gagal disimpan. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }
}