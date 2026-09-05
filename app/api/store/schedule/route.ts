import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

import {
  STATUS_KHUSUS,
  STATUS_KHUSUS_ITEMS,
} from "@/lib/shift-status"

// ============================================================
// STATUS SHIFT YANG SAH
// ============================================================

const VALID_STATUS = new Set<string>([
  "shift_pagi",
  "shift_siang",
  "libur",
  "cuti",
  "izin",
  "sakit",
  STATUS_KHUSUS,
])

// ============================================================
// SUB-JENIS STATUS KHUSUS YANG SAH
// ============================================================

const VALID_STATUS_KHUSUS = new Set<string>(
  STATUS_KHUSUS_ITEMS.map(
    (item) => item.value,
  ),
)

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
// PARSING NILAI SEL JADWAL
//
// Mendukung dua bentuk nilai sel agar tetap kompatibel:
//   - string lama, mis. "shift_pagi"
//   - objek baru, mis. { status: "cuti", cutiJenis: "Cuti Tahunan" }
// sehingga data lama yang hanya berisi status tetap terbaca.
// ============================================================

type ParsedCell = {
  status: string
  cutiJenis?: string
  statusKhusus?: string
  keterangan?: string
  tokoTujuan?: string
}

function parseCellValue(
  raw: unknown,
): ParsedCell | null {
  if (
    typeof raw === "string"
  ) {
    return VALID_STATUS.has(raw)
      ? { status: raw }
      : null
  }

  if (
    raw &&
    typeof raw === "object"
  ) {
    const obj = raw as Record<
      string,
      unknown
    >

    const status =
      typeof obj.status ===
        "string"
        ? obj.status
        : ""

    if (
      !VALID_STATUS.has(status)
    ) {
      return null
    }

    const cutiJenis =
      typeof obj.cutiJenis ===
        "string" &&
        obj.cutiJenis.trim() !==
          ""
        ? obj.cutiJenis.trim()
        : undefined

    // ==================================================
    // STATUS KHUSUS
    //
    // statusKhusus WAJIB valid ketika status adalah
    // status_khusus; nilai di luar daftar ditolak.
    // ==================================================

    if (
      status === STATUS_KHUSUS
    ) {
      const statusKhusus =
        typeof obj.statusKhusus ===
          "string" &&
          obj.statusKhusus.trim() !==
            ""
          ? obj.statusKhusus.trim()
          : ""

      if (
        !VALID_STATUS_KHUSUS.has(
          statusKhusus,
        )
      ) {
        return null
      }

      const keterangan =
        typeof obj.keterangan ===
          "string" &&
          obj.keterangan.trim() !==
            ""
          ? obj.keterangan.trim()
          : undefined

      const tokoTujuan =
        typeof obj.tokoTujuan ===
          "string" &&
          obj.tokoTujuan.trim() !==
            ""
          ? obj.tokoTujuan.trim()
          : undefined

      return {
        status,
        statusKhusus,
        keterangan,
        tokoTujuan,
      }
    }

    return {
      status,
      cutiJenis,
    }
  }

  return null
}

// ============================================================
// BUILDER DATA DOKUMEN JADWAL
//
// Menyusun data yang akan dipersist (draft maupun final) dengan
// cleanup field stale, agar field lama (mis. cutiJenis, field
// status khusus) tidak tertinggal aktif saat status berubah.
//
// Dengan merge:true, field yang tidak dikirim TIDAK terhapus.
// Maka setiap field detail ditulis eksplisit — diisi nilai baru
// atau FieldValue.delete() bila sudah tidak relevan.
// ============================================================

function buildScheduleDocData(
  storeId: string,
  cabangId: string,
  employeeId: string,
  tanggal: string,
  parsed: ParsedCell,
): Record<string, unknown> {
  const docData: Record<
    string,
    unknown
  > = {
    storeId,
    cabangId,
    employeeId,
    tanggal,
    status: parsed.status,
    updatedAt:
      FieldValue.serverTimestamp(),
  }

  // ====================================================
  // CUTI
  // cutiJenis hanya aktif untuk status "cuti".
  // ====================================================

  if (
    parsed.status === "cuti" &&
    parsed.cutiJenis
  ) {
    docData.cutiJenis =
      parsed.cutiJenis
  } else {
    docData.cutiJenis =
      FieldValue.delete()
  }

  // ====================================================
  // STATUS KHUSUS
  // statusKhusus/keterangan/tokoTujuan hanya aktif
  // untuk status "status_khusus".
  // ====================================================

  if (
    parsed.status === STATUS_KHUSUS
  ) {
    if (parsed.statusKhusus) {
      docData.statusKhusus =
        parsed.statusKhusus
    } else {
      docData.statusKhusus =
        FieldValue.delete()
    }

    if (parsed.keterangan) {
      docData.keterangan =
        parsed.keterangan
    } else {
      docData.keterangan =
        FieldValue.delete()
    }

    // tokoTujuan hanya relevan untuk sub-jenis
    // backup_toko_lain.
    if (
      parsed.statusKhusus ===
        "backup_toko_lain" &&
      parsed.tokoTujuan
    ) {
      docData.tokoTujuan =
        parsed.tokoTujuan
    } else {
      docData.tokoTujuan =
        FieldValue.delete()
    }
  } else {
    docData.statusKhusus =
      FieldValue.delete()
    docData.keterangan =
      FieldValue.delete()
    docData.tokoTujuan =
      FieldValue.delete()
  }

  return docData
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

    // Periode bulan yang diminta: [start, end)
    // start = YYYY-MM-01, end = tanggal 1 bulan berikutnya
    // (rollover tahun bila Desember).
    const nextMonth =
      month === 11
        ? month + 1 - 12
        : month + 1

    const nextYear =
      month === 11
        ? year + 1
        : year

    const start =
      `${year}-${String(
        month + 1,
      ).padStart(2, "0")}-01`

    const end =
      `${nextYear}-${String(
        nextMonth + 1,
      ).padStart(2, "0")}-01`

    let query =
      adminDb
        .collection("schedule_drafts")
        .where(
          "storeId",
          "==",
          storeId,
        )
        .where(
          "tanggal",
          ">=",
          start,
        )
        .where(
          "tanggal",
          "<",
          end,
        )

    const snapshot =
      await query.get()

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
            cutiJenis:
              data?.cutiJenis ?? "",
            statusKhusus:
              data?.statusKhusus ?? "",
            keterangan:
              data?.keterangan ?? "",
            tokoTujuan:
              data?.tokoTujuan ?? "",
          }
        })
        .filter(
          (draft) =>
            draft.cabangId ===
              cabangId,
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

          const parsed =
            parseCellValue(
              day[employeeId],
            )

          if (!parsed) {
            continue
          }

          const docData =
            buildScheduleDocData(
              storeId,
              cabangId,
              employeeId,
              tanggal,
              parsed,
            )

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
              .set(docData, {
                merge: true,
              }),
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

        if (
          !employeeId ||
          !isValidDateISO(tanggal)
        ) {
          continue
        }

        const parsed =
          parseCellValue(
            cell?.status,
          )

        if (!parsed) {
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

        const docData =
          buildScheduleDocData(
            storeId,
            cabangId,
            employeeId,
            tanggal,
            parsed,
          )

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
            .set(docData, {
              merge: true,
            }),
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
