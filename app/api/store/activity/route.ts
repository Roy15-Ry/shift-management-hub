import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// ACTIVITY DOCUMENT ID
// ============================================================

function activityId(
  storeId: string,
  tanggal: string,
  row: 1 | 2,
) {
  return `${storeId}_${tanggal}_a${row}`
}

// ============================================================
// VALIDASI TANGGAL ISO YYYY-MM-DD
// ============================================================

function isValidDateISO(
  value: string,
): boolean {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false
  }

  const [
    year,
    month,
    day,
  ] = value.split("-").map(Number)

  const date = new Date(
    year,
    month - 1,
    day,
  )

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

// ============================================================
// AUTH — HANYA STORE
// ============================================================

async function getAuthenticatedStore(
  request: Request,
): Promise<{
  storeId: string
  cabangId: string
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
    await adminDb.collection("users").doc(uid).get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data = userSnapshot.data()
  const role = data?.role ?? ""
  const aktif = data?.aktif === true

  if (role !== "store" || !aktif) {
    throw new Error("FORBIDDEN")
  }

  const storeId = String(data?.storeId ?? "").trim()
  const cabangId = String(data?.cabangId ?? "").trim()

  if (!storeId || !cabangId) {
    throw new Error("FORBIDDEN")
  }

  return { storeId, cabangId }
}

// ============================================================
// HELPER — RANGE BULAN
// ============================================================

function monthRange(
  year: number,
  month: number,
) {
  const nextMonth =
    month === 11 ? month + 1 - 12 : month + 1
  const nextYear = month === 11 ? year + 1 : year

  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`
  const end = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`

  return { start, end }
}

// ============================================================
// HELPER — CLEAN TEXT
// ============================================================

function cleanText(
  raw: unknown,
  max = 200,
): string {
  if (typeof raw !== "string") return ""
  return raw.trim().slice(0, max)
}

// ============================================================
// GET
// Mengembalikan drafts dan finals untuk bulan tertentu.
// Scope: authenticated store + bulan + cabang.
// ============================================================

export async function GET(
  request: Request,
) {
  try {
    const { storeId, cabangId } =
      await getAuthenticatedStore(request)

    const url = new URL(request.url)
    const year = Number(url.searchParams.get("year"))
    const month = Number(url.searchParams.get("month"))

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month)
    ) {
      return NextResponse.json(
        { success: false, message: "Parameter year dan month wajib diisi." },
        { status: 400 },
      )
    }

    const { start, end } = monthRange(year, month)

    const [draftSnap, finalSnap] =
      await Promise.all([
        adminDb
          .collection("schedule_activity_drafts")
          .where("storeId", "==", storeId)
          .where("tanggal", ">=", start)
          .where("tanggal", "<", end)
          .get(),
        adminDb
          .collection("schedule_activities")
          .where("storeId", "==", storeId)
          .where("tanggal", ">=", start)
          .where("tanggal", "<", end)
          .get(),
      ])

    const drafts = draftSnap.docs
      .map((doc) => {
        const d = doc.data()
        return {
          id: doc.id,
          storeId: d?.storeId ?? "",
          cabangId: d?.cabangId ?? "",
          row: d?.row ?? 1,
          tanggal: d?.tanggal ?? "",
          teks: d?.teks ?? "",
        }
      })
      .filter((a) => a.cabangId === cabangId)

    const finals = finalSnap.docs
      .map((doc) => {
        const d = doc.data()
        return {
          id: doc.id,
          storeId: d?.storeId ?? "",
          cabangId: d?.cabangId ?? "",
          row: d?.row ?? 1,
          tanggal: d?.tanggal ?? "",
          teks: d?.teks ?? "",
        }
      })
      .filter((a) => a.cabangId === cabangId)

    return NextResponse.json({
      success: true,
      drafts,
      finals,
    })
  } catch (error: unknown) {
    console.error("GET ACTIVITY ERROR:", error)

    if (
      error instanceof Error &&
      error.message === "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        { success: false, message: "Tidak terautentikasi." },
        { status: 401 },
      )
    }

    if (
      error instanceof Error &&
      error.message === "FORBIDDEN"
    ) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal mengambil data kegiatan." },
      { status: 500 },
    )
  }
}

// ============================================================
// POST
// mode=draft   — simpan draft activity
// mode=delete  — hapus draft activity (1 cell)
// mode=final   — finalisasi: copy draft → final, hapus draft
// ============================================================

export async function POST(
  request: Request,
) {
  try {
    const { storeId, cabangId } =
      await getAuthenticatedStore(request)

    const url = new URL(request.url)
    const mode = url.searchParams.get("mode")
    const body = await request.json()

    // ========================================================
    // MODE: DRAFT
    // ========================================================

    if (mode === "draft") {
      const activities = Array.isArray(body?.activities)
        ? body.activities
        : []

      if (activities.length === 0) {
        return NextResponse.json(
          { success: false, message: "Data kegiatan tidak valid." },
          { status: 400 },
        )
      }

      const writes: Promise<unknown>[] = []
      let wrote = 0

      for (const item of activities) {
        const tanggal = String(item?.tanggal ?? "").trim()
        const row = Number(item?.row)

        if (
          !isValidDateISO(tanggal) ||
          (row !== 1 && row !== 2)
        ) {
          continue
        }

        const teks = cleanText(item?.teks)

        if (teks.length === 0) {
          continue
        }

        const docId = activityId(storeId, tanggal, row as 1 | 2)

        writes.push(
          adminDb
            .collection("schedule_activity_drafts")
            .doc(docId)
            .set(
              {
                storeId,
                cabangId,
                row,
                tanggal,
                teks,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            ),
        )

        wrote += 1
      }

      if (wrote === 0) {
        return NextResponse.json(
          { success: false, message: "Tidak ada kegiatan valid untuk disimpan." },
          { status: 400 },
        )
      }

      await Promise.all(writes)

      return NextResponse.json({
        success: true,
        message: "Draft kegiatan berhasil disimpan.",
        count: wrote,
      })
    }

    // ========================================================
    // MODE: DELETE
    // Menghapus SATU document draft activity.
    // Hanya menyentuh schedule_activity_drafts.
    // ========================================================

    if (mode === "delete") {
      const tanggal = String(body?.tanggal ?? "").trim()
      const row = Number(body?.row)

      if (
        !isValidDateISO(tanggal) ||
        (row !== 1 && row !== 2)
      ) {
        return NextResponse.json(
          { success: false, message: "Data tidak valid." },
          { status: 400 },
        )
      }

      const docId = activityId(storeId, tanggal, row as 1 | 2)

      await adminDb
        .collection("schedule_activity_drafts")
        .doc(docId)
        .delete()

      return NextResponse.json({
        success: true,
        message: "Draft kegiatan berhasil dihapus.",
      })
    }

    // ========================================================
    // MODE: FINAL
    // Copy draft → final (merge). Hapus draft bulan ini.
    // Idempotent — jika draft kosong, return finals tanpa
    // menulis apapun.
    // ========================================================

    if (mode === "final") {
      const year = Number(body?.year)
      const month = Number(body?.month)

      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month)
      ) {
        return NextResponse.json(
          { success: false, message: "Parameter year dan month wajib diisi." },
          { status: 400 },
        )
      }

      const { start, end } = monthRange(year, month)

      const draftSnap =
        await adminDb
          .collection("schedule_activity_drafts")
          .where("storeId", "==", storeId)
          .where("tanggal", ">=", start)
          .where("tanggal", "<", end)
          .get()

      const monthDrafts = draftSnap.docs.filter(
        (doc) => doc.data()?.cabangId === cabangId,
      )

      if (monthDrafts.length > 0) {
        const writes: Promise<unknown>[] = []

        for (const doc of monthDrafts) {
          const d = doc.data()
          const tanggal = d?.tanggal ?? ""
          const row = d?.row ?? 1
          const teks = d?.teks ?? ""

          const finalId = activityId(
            storeId,
            tanggal,
            row as 1 | 2,
          )

          writes.push(
            adminDb
              .collection("schedule_activities")
              .doc(finalId)
              .set(
                {
                  storeId,
                  cabangId,
                  row,
                  tanggal,
                  teks,
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true },
              ),
          )

          writes.push(doc.ref.delete())
        }

        await Promise.all(writes)
      }

      const finalSnap =
        await adminDb
          .collection("schedule_activities")
          .where("storeId", "==", storeId)
          .where("tanggal", ">=", start)
          .where("tanggal", "<", end)
          .get()

      const finals = finalSnap.docs
        .map((doc) => {
          const d = doc.data()
          return {
            id: doc.id,
            storeId: d?.storeId ?? "",
            cabangId: d?.cabangId ?? "",
            row: d?.row ?? 1,
            tanggal: d?.tanggal ?? "",
            teks: d?.teks ?? "",
          }
        })
        .filter((a) => a.cabangId === cabangId)

      return NextResponse.json({
        success: true,
        message: "Kegiatan berhasil difinalkan.",
        finals,
      })
    }

    // ========================================================
    // MODE TIDAK DIKENAL
    // ========================================================

    return NextResponse.json(
      { success: false, message: "Mode tidak dikenali." },
      { status: 400 },
    )
  } catch (error: unknown) {
    console.error("POST ACTIVITY ERROR:", error)

    if (
      error instanceof Error &&
      error.message === "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        { success: false, message: "Tidak terautentikasi." },
        { status: 401 },
      )
    }

    if (
      error instanceof Error &&
      error.message === "FORBIDDEN"
    ) {
      return NextResponse.json(
        { success: false, message: "Anda tidak memiliki izin." },
        { status: 403 },
      )
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal memproses kegiatan." },
      { status: 500 },
    )
  }
}
