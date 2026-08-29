import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

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

// ============================================================
// IDENTITAS UNIK DOKUMEN JADWAL
// ============================================================

function scheduleId(
  storeId: string,
  tanggal: string,
  employeeId: string,
) {
  return `${storeId}_${tanggal}_${employeeId}`
}

// ============================================================
// DATA AKUN YANG SEDANG LOGIN
// ============================================================

async function getAuthenticatedStore(
  request: Request,
): Promise<{
  storeId: string
  cabangId: string
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

  // ==========================================================
  // VERIFIKASI TOKEN FIREBASE
  // ==========================================================

  const decodedToken =
    await adminAuth.verifyIdToken(idToken)

  const uid = decodedToken.uid

  // ==========================================================
  // AMBIL PROFIL USER DARI FIRESTORE
  // ==========================================================

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
    userSnapshot.data()

  const role =
    data?.role ?? ""

  const aktif =
    data?.aktif === true

  if (
    role !== "store" ||
    !aktif
  ) {
    throw new Error(
      "FORBIDDEN",
    )
  }

  // ==========================================================
  // storeId DAN cabangId SELALU DIAMBIL DARI AKUN,
  // BUKAN DARI REQUEST CLIENT
  // ==========================================================

  const storeId =
    String(data?.storeId ?? "")
      .trim()

  const cabangId =
    String(data?.cabangId ?? "")
      .trim()

  if (!storeId || !cabangId) {
    throw new Error(
      "FORBIDDEN",
    )
  }

  return {
    storeId,
    cabangId,
  }
}

// ============================================================
// VALIDASI TANGGAL DAN BULAN
// ============================================================

function isValidDateISO(
  value: string,
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

// ============================================================
// GET
// Membaca seluruh draft pada bulan tertentu agar dapat
// dilanjutkan oleh BUAT JADWAL SHIFT.
// ============================================================

export async function GET(
  request: Request,
) {
  try {
    const {
      storeId,
      cabangId,
    } =
      await getAuthenticatedStore(
        request,
      )

    const url =
      new URL(
        request.url,
      )

    const year =
      Number(
        url.searchParams.get(
          "year",
        ),
      )

    const month =
      Number(
        url.searchParams.get(
          "month",
        ),
      )

    // bulan dalam GET: 0-11

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Parameter year dan month wajib diisi.",
        },
        {
          status: 400,
        },
      )
    }

    const monthPrefix =
      `${year}-${String(
        month + 1,
      ).padStart(2, "0")}-`

    const snapshot =
      await adminDb
        .collection("schedule_drafts")
        .where(
          "storeId",
          "==",
          storeId,
        )
        .get()

    const drafts =
      snapshot.docs
        .map((doc) => {
          const data =
            doc.data()

          return {
            id: doc.id,
            storeId:
              data?.storeId ?? "",
            cabangId:
              data?.cabangId ?? "",
            employeeId:
              data?.employeeId ?? "",
            tanggal:
              data?.tanggal ?? "",
            status:
              data?.status ?? "",
          }
        })
        .filter(
          (draft) =>
            draft.cabangId ===
              cabangId &&
            draft.tanggal?.startsWith(
              monthPrefix,
            ),
        )

    return NextResponse.json({
      success: true,
      drafts,
    })
  } catch (error: unknown) {
    console.error(
      "GET DRAFT SCHEDULE ERROR:",
      error,
    )

    if (
      error instanceof Error &&
      error.message ===
      "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tidak terautentikasi.",
        },
        {
          status: 401,
        },
      )
    }

    if (
      error instanceof Error &&
      error.message ===
      "FORBIDDEN"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin.",
        },
        {
          status: 403,
        },
      )
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil draft jadwal.",
      },
      {
        status: 500,
      },
    )
  }
}

// ============================================================
// POST
//
// mode=draft     -> menyimpan/memperbarui draft per sel.
// mode=final     -> memfinalkan seluruh bulan ke schedules.
// ============================================================

export async function POST(
  request: Request,
) {
  try {
    const {
      storeId,
      cabangId,
    } =
      await getAuthenticatedStore(
        request,
      )

    const url =
      new URL(
        request.url,
      )

    const mode =
      url.searchParams.get(
        "mode",
      )

    const body =
      await request.json()

    // ========================================================
    // MODE: DRAFT
    // ========================================================

    if (
      mode === "draft"
    ) {
      const days =
        body?.days

      // days: array of
      // { tanggal, [employeeId]: status }

      if (
        !Array.isArray(days) ||
        days.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Data draft tidak valid.",
          },
          {
            status: 400,
          },
        )
      }

      const writes: Promise<unknown>[] = []
      let wrote = 0

      for (
        const day of days
      ) {
        const tanggal =
          String(
            day?.tanggal ?? "",
          ).trim()

        if (
          !isValidDateISO(tanggal)
        ) {
          continue
        }

        for (
          const employeeId of Object.keys(
            day,
          )
        ) {
          if (
            employeeId ===
            "tanggal"
          ) {
            continue
          }

          const status =
            day[employeeId]

          if (
            typeof status !==
              "string" ||
            !VALID_STATUS.has(
              status,
            )
          ) {
            continue
          }

          const docId =
            scheduleId(
              storeId,
              tanggal,
              employeeId,
            )

          writes.push(
            adminDb
              .collection(
                "schedule_drafts",
              )
              .doc(docId)
              .set(
                {
                  storeId,
                  cabangId,
                  employeeId,
                  tanggal,
                  status,
                  updatedAt:
                    FieldValue.serverTimestamp(),
                },
                {
                  merge: true,
                },
              ),
          )

          wrote += 1
        }
      }

      if (wrote === 0) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Tidak ada sel draft yang valid untuk disimpan.",
          },
          {
            status: 400,
          },
        )
      }

      await Promise.all(writes)

      return NextResponse.json({
        success: true,
        message:
          "Draft jadwal berhasil disimpan.",
        count: wrote,
      })
    }

    // ========================================================
    // MODE: FINAL
    // Memfinalkan seluruh bulan ke collection schedules.
    // ========================================================

    if (
      mode === "final"
    ) {
      const year =
        Number(
          body?.year,
        )

      const month =
        Number(
          body?.month,
        )

      // bulan dalam POST: 0-11

      if (
        !Number.isInteger(year) ||
        !Number.isInteger(month)
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Parameter year dan month wajib diisi.",
          },
          {
            status: 400,
          },
        )
      }

      const cells =
        Array.isArray(
          body?.cells,
        )
          ? body.cells
          : []

      if (cells.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Jadwal bulanan kosong.",
          },
          {
            status: 400,
          },
        )
      }

      const monthPrefix =
        `${year}-${String(
          month + 1,
        ).padStart(2, "0")}-`

      const scheduleWrites: Promise<unknown>[] = []
      let wrote = 0

      for (
        const cell of cells
      ) {
        const employeeId =
          String(
            cell?.employeeId ??
              "",
          ).trim()

        const tanggal =
          String(
            cell?.tanggal ?? "",
          ).trim()

        const status =
          cell?.status

        if (
          !employeeId ||
          !isValidDateISO(tanggal)
        ) {
          continue
        }

        // HANYA memfinalkan tanggal pada bulan target.
        if (
          !tanggal.startsWith(
            monthPrefix,
          )
        ) {
          continue
        }

        if (
          typeof status !==
            "string" ||
          !VALID_STATUS.has(
            status,
          )
        ) {
          continue
        }

        // UPSERT berdasarkan identitas unik
        // storeId + employeeId + tanggal.
        // Tidak menduplikasi, tidak menghapus milik
        // toko/bulan lain.
        scheduleWrites.push(
          adminDb
            .collection("schedules")
            .doc(
              scheduleId(
                storeId,
                tanggal,
                employeeId,
              ),
            )
            .set(
              {
                storeId,
                cabangId,
                employeeId,
                tanggal,
                status,
                updatedAt:
                  FieldValue.serverTimestamp(),
              },
              {
                merge: true,
              },
            ),
        )

        wrote += 1
      }

      if (wrote === 0) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Tidak ada sel jadwal valid untuk difinalkan.",
          },
          {
            status: 400,
          },
        )
      }

      // ======================================================
      // HAPUS DRAFT BULAN INI YANG SUDAH DIFINALKAN
      // agar tidak tertinggal sebagai draft aktif.
      // ======================================================

      await Promise.all(scheduleWrites)

      const draftSnapshot =
        await adminDb
          .collection("schedule_drafts")
          .where(
            "storeId",
            "==",
            storeId,
          )
          .get()

      const draftDeletes: Promise<unknown>[] = []

      for (
        const frame of draftSnapshot.docs
      ) {
        const data =
          frame.data()

        if (
          data?.cabangId !==
            cabangId ||
          String(
            data?.tanggal ?? "",
          ).startsWith(
            monthPrefix,
          )
        ) {
          draftDeletes.push(
            frame.ref.delete(),
          )
        }
      }

      await Promise.all(draftDeletes)

      return NextResponse.json({
        success: true,
        message:
          "Jadwal bulan berhasil difinalkan.",
        count: wrote,
        deletedDraft:
          draftDeletes.length,
      })
    }

    // ========================================================
    // MODE TIDAK DIKENAL
    // ========================================================

    return NextResponse.json(
      {
        success: false,
        message:
          "Mode tidak dikenali.",
      },
      {
        status: 400,
      },
    )
  } catch (error: unknown) {
    console.error(
      "POST SCHEDULE ERROR:",
      error,
    )

    if (
      error instanceof Error &&
      error.message ===
      "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tidak terautentikasi.",
        },
        {
          status: 401,
        },
      )
    }

    if (
      error instanceof Error &&
      error.message ===
      "FORBIDDEN"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin.",
        },
        {
          status: 403,
        },
      )
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menyimpan jadwal.",
      },
      {
        status: 500,
      },
    )
  }
}
