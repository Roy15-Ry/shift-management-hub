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

    if (
      obj.cutiJenis != null &&
      typeof obj.cutiJenis !== "string"
    ) {
      return null
    }

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

      if (
        (obj.keterangan != null && typeof obj.keterangan !== "string") ||
        (obj.tokoTujuan != null && typeof obj.tokoTujuan !== "string")
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

      if (
        statusKhusus === "lainnya" &&
        !keterangan
      ) {
        return null
      }

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

type BackupValidationCell = {
  employeeId: string
  tanggal: string
  parsed: ParsedCell
}

function normalizeStoreIdentity(value: unknown): string {
  return String(value ?? "").trim().toUpperCase()
}

function matchesBackupCellContext(
  data: FirebaseFirestore.DocumentData | undefined,
  cell: BackupValidationCell,
  storeId: string,
  cabangId: string,
): boolean {
  return (
    data?.storeId === storeId &&
    data?.cabangId === cabangId &&
    data?.employeeId === cell.employeeId &&
    data?.tanggal === cell.tanggal
  )
}

async function isUnchangedLegacyBackupWithoutTarget(
  cell: BackupValidationCell,
  storeId: string,
  cabangId: string,
): Promise<boolean> {
  async function findCellRecord(collectionName: "schedule_drafts" | "schedules") {
    const snapshot = await adminDb
      .collection(collectionName)
      .where("storeId", "==", storeId)
      .where("tanggal", "==", cell.tanggal)
      .get()
    const matches = snapshot.docs.filter(
      (document) => document.data()?.employeeId === cell.employeeId,
    )

    return matches.length === 1
      ? { data: matches[0].data(), ambiguous: false }
      : { data: undefined, ambiguous: matches.length > 1 }
  }

  const draft = await findCellRecord("schedule_drafts")
  if (draft.ambiguous) return false
  let effectiveData: FirebaseFirestore.DocumentData | undefined

  // Drafts are visible in the editor only when every queried cell identity
  // matches the authenticated context. An invalid/stale draft is not the
  // editor's effective value, so the final schedule remains the fallback.
  if (matchesBackupCellContext(draft.data, cell, storeId, cabangId)) {
    effectiveData = draft.data
  } else {
    const final = await findCellRecord("schedules")
    if (final.ambiguous) return false
    if (matchesBackupCellContext(final.data, cell, storeId, cabangId)) {
      effectiveData = final.data
    }
  }

  return (
    effectiveData?.status === STATUS_KHUSUS &&
    effectiveData?.statusKhusus === "backup_toko_lain" &&
    !String(effectiveData?.tokoTujuan ?? "").trim() &&
    !cell.parsed.tokoTujuan
  )
}

function scheduleCellIdentity(employeeId: string, tanggal: string): string {
  return JSON.stringify([tanggal, employeeId])
}

async function resolveScheduleWriteIds(
  cells: BackupValidationCell[],
  collectionName: "schedule_drafts" | "schedules",
  storeId: string,
  cabangId: string,
): Promise<{ documentIds: Map<string, string> } | { error: string }> {
  const documentIds = new Map<string, string>()
  const recordsByDate = new Map<string, Array<{ id: string; data: FirebaseFirestore.DocumentData }>>()

  for (const tanggal of new Set(cells.map((cell) => cell.tanggal))) {
    const snapshot = await adminDb
      .collection(collectionName)
      .where("storeId", "==", storeId)
      .where("tanggal", "==", tanggal)
      .get()

    recordsByDate.set(
      tanggal,
      snapshot.docs.map((document) => ({
        id: document.id,
        data: document.data(),
      })),
    )
  }

  for (const cell of cells) {
    const identity = scheduleCellIdentity(cell.employeeId, cell.tanggal)
    if (documentIds.has(identity)) {
      return { error: "Request berisi identitas sel jadwal yang berulang." }
    }

    const matches = (recordsByDate.get(cell.tanggal) ?? []).filter(
      (record) =>
        record.data?.storeId === storeId &&
        record.data?.tanggal === cell.tanggal &&
        record.data?.employeeId === cell.employeeId,
    )

    if (matches.length > 1) {
      return { error: "Lebih dari satu dokumen cocok dengan sel jadwal. Tidak ada data yang disimpan." }
    }

    if (matches.length === 1 && matches[0].data?.cabangId !== cabangId) {
      return { error: "Dokumen sel jadwal berada di luar scope cabang akun ini." }
    }

    documentIds.set(
      identity,
      matches[0]?.id ?? scheduleId(storeId, cell.tanggal, cell.employeeId),
    )
  }

  return { documentIds }
}

async function validateScheduleEmployees(
  cells: BackupValidationCell[],
  storeId: string,
): Promise<string | null> {
  const employeeIds = [...new Set(cells.map((cell) => cell.employeeId))]
  if (employeeIds.length === 0) return null

  const snapshot = await adminDb
    .collection("employees")
    .where("storeId", "==", storeId)
    .get()
  const allowedIds = new Set(snapshot.docs.map((doc) => doc.id))

  return employeeIds.every((employeeId) => allowedIds.has(employeeId))
    ? null
    : "Satu atau lebih karyawan tidak terdaftar pada toko akun."
}

async function validateBackupTargets(
  cells: BackupValidationCell[],
  storeId: string,
  cabangId: string,
): Promise<string | null> {
  const backupCells = cells.filter(
    (cell) =>
      cell.parsed.status === STATUS_KHUSUS &&
      cell.parsed.statusKhusus === "backup_toko_lain",
  )
  if (backupCells.length === 0) return null

  const newOrChangedCells: BackupValidationCell[] = []
  for (const cell of backupCells) {
    if (await isUnchangedLegacyBackupWithoutTarget(cell, storeId, cabangId)) continue
    if (!cell.parsed.tokoTujuan) {
      return "Pilih toko tujuan backup yang valid."
    }
    newOrChangedCells.push(cell)
  }
  if (newOrChangedCells.length === 0) return null

  const storesSnapshot = await adminDb
    .collection("stores")
    .where("cabangId", "==", cabangId)
    .get()
  const stores = storesSnapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: String(data.storeId ?? doc.id).trim(),
      cabangId: String(data.cabangId ?? "").trim(),
      aktif: data.aktif !== false,
    }
  })

  const ownStores = stores.filter(
    (store) =>
      normalizeStoreIdentity(store.id) === normalizeStoreIdentity(storeId) &&
      normalizeStoreIdentity(store.cabangId) === normalizeStoreIdentity(cabangId),
  )
  if (ownStores.length !== 1) {
    return "Data toko akun tidak dapat diverifikasi pada cabang yang sama."
  }

  for (const cell of newOrChangedCells) {
    const requestedId = normalizeStoreIdentity(cell.parsed.tokoTujuan)
    const matches = stores.filter(
      (store) => normalizeStoreIdentity(store.id) === requestedId,
    )
    if (
      matches.length !== 1 ||
      !matches[0].aktif ||
      normalizeStoreIdentity(matches[0].cabangId) !== normalizeStoreIdentity(cabangId) ||
      requestedId === normalizeStoreIdentity(storeId)
    ) {
      return "Toko tujuan harus aktif, berada pada cabang yang sama, dan berbeda dari toko Anda."
    }
    // Persist the canonical storeId spelling from the trusted store record.
    cell.parsed.tokoTujuan = matches[0].id
  }

  return null
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

      const parsedCells: BackupValidationCell[] = []

      for (
        const day of days
      ) {
        if (!day || typeof day !== "object" || Array.isArray(day)) {
          return NextResponse.json(
            { success: false, message: "Data sel jadwal tidak valid." },
            { status: 400 },
          )
        }

        const tanggal =
          String(
            day?.tanggal ?? "",
          ).trim()

        if (
          !isValidDateISO(tanggal)
        ) {
          return NextResponse.json(
            { success: false, message: "Tanggal pada data sel jadwal tidak valid." },
            { status: 400 },
          )
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
            return NextResponse.json(
              { success: false, message: "Satu atau lebih sel jadwal tidak valid." },
              { status: 400 },
            )
          }

          parsedCells.push({ employeeId, tanggal, parsed })
        }
      }

      const employeeValidationError = await validateScheduleEmployees(
        parsedCells,
        storeId,
      )
      if (employeeValidationError) {
        return NextResponse.json(
          { success: false, message: employeeValidationError },
          { status: 400 },
        )
      }

      const validationError = await validateBackupTargets(
        parsedCells,
        storeId,
        cabangId,
      )
      if (validationError) {
        return NextResponse.json(
          { success: false, message: validationError },
          { status: 400 },
        )
      }

      const writeResolution = await resolveScheduleWriteIds(
        parsedCells,
        "schedule_drafts",
        storeId,
        cabangId,
      )
      if ("error" in writeResolution) {
        return NextResponse.json(
          { success: false, message: writeResolution.error },
          { status: 409 },
        )
      }

      const writes: Promise<unknown>[] = []
      let wrote = 0
      for (const { employeeId, tanggal, parsed } of parsedCells) {
        const docData = buildScheduleDocData(
          storeId,
          cabangId,
          employeeId,
          tanggal,
          parsed,
        )
        const docId = writeResolution.documentIds.get(
          scheduleCellIdentity(employeeId, tanggal),
        ) ?? scheduleId(storeId, tanggal, employeeId)
        writes.push(
          adminDb
            .collection("schedule_drafts")
            .doc(docId)
            .set(docData, { merge: true }),
        )
        wrote += 1
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

      const parsedCells: BackupValidationCell[] = []

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
          return NextResponse.json(
            { success: false, message: "Identitas karyawan atau tanggal pada sel jadwal tidak valid." },
            { status: 400 },
          )
        }

        const parsed =
          parseCellValue({
            status:
              cell?.status,
            cutiJenis:
              cell?.cutiJenis,
            statusKhusus:
              cell?.statusKhusus,
            keterangan:
              cell?.keterangan,
            tokoTujuan:
              cell?.tokoTujuan,
          })

        if (!parsed) {
          return NextResponse.json(
            { success: false, message: "Satu atau lebih sel jadwal tidak valid." },
            { status: 400 },
          )
        }

        // HANYA memfinalkan tanggal pada bulan target.
        if (
          !tanggal.startsWith(
            monthPrefix,
          )
        ) {
          continue
        }

        parsedCells.push({ employeeId, tanggal, parsed })
      }

      const employeeValidationError = await validateScheduleEmployees(
        parsedCells,
        storeId,
      )
      if (employeeValidationError) {
        return NextResponse.json(
          { success: false, message: employeeValidationError },
          { status: 400 },
        )
      }

      const validationError = await validateBackupTargets(
        parsedCells,
        storeId,
        cabangId,
      )
      if (validationError) {
        return NextResponse.json(
          { success: false, message: validationError },
          { status: 400 },
        )
      }

      const writeResolution = await resolveScheduleWriteIds(
        parsedCells,
        "schedules",
        storeId,
        cabangId,
      )
      if ("error" in writeResolution) {
        return NextResponse.json(
          { success: false, message: writeResolution.error },
          { status: 409 },
        )
      }

      const scheduleWrites: Promise<unknown>[] = []
      let wrote = 0
      for (const { employeeId, tanggal, parsed } of parsedCells) {
        const docData = buildScheduleDocData(
          storeId,
          cabangId,
          employeeId,
          tanggal,
          parsed,
        )

        // UPSERT berdasarkan identitas unik storeId + employeeId + tanggal.
        scheduleWrites.push(
          adminDb
            .collection("schedules")
            .doc(writeResolution.documentIds.get(
              scheduleCellIdentity(employeeId, tanggal),
            ) ?? scheduleId(storeId, tanggal, employeeId))
            .set(docData, { merge: true }),
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
    // MODE: DRAFT-DELETE
    //
    // Menghapus SATU document schedule_drafts untuk satu cell
    // (storeId + tanggal + employeeId). HANYA menyentuh
    // schedule_drafts — TIDAK pernah menyentuh collection
    // "schedules" (data final). storeId/cabangId diambil dari
    // akun (bukan body), sehingga user hanya bisa menghapus
    // draft milik tokonya sendiri.
    // ========================================================

    if (
      mode === "draft-delete"
    ) {
      const employeeId =
        String(
          body?.employeeId ?? "",
        ).trim()

      const tanggal =
        String(
          body?.tanggal ?? "",
        ).trim()

      if (
        !employeeId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "employeeId wajib diisi.",
          },
          {
            status: 400,
          },
        )
      }

      if (
        !isValidDateISO(tanggal)
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Tanggal tidak valid.",
          },
          {
            status: 400,
          },
        )
      }

      // Gunakan field identitas dan scope yang sama dengan GET draft,
      // sehingga dokumen legacy dengan ID berbeda tetap dapat ditemukan.
      const draftsForDate = await adminDb
        .collection("schedule_drafts")
        .where("storeId", "==", storeId)
        .where("tanggal", "==", tanggal)
        .get()
      const matchingDrafts = draftsForDate.docs.filter(
        (draft) => draft.data()?.employeeId === employeeId,
      )

      if (matchingDrafts.length === 0) {
        return NextResponse.json(
          {
            success: false,
            message: "Draft sel tidak ditemukan.",
          },
          { status: 404 },
        )
      }

      if (matchingDrafts.length > 1) {
        return NextResponse.json(
          {
            success: false,
            message: "Lebih dari satu draft cocok dengan sel ini. Tidak ada data yang dihapus.",
          },
          { status: 409 },
        )
      }

      if (matchingDrafts[0].data()?.cabangId !== cabangId) {
        return NextResponse.json(
          {
            success: false,
            message: "Draft sel tidak ditemukan dalam scope cabang akun ini.",
          },
          { status: 404 },
        )
      }

      await matchingDrafts[0].ref.delete()

      return NextResponse.json({
        success: true,
        message:
          "Draft sel berhasil dihapus.",
        deleted: 1,
      })
    }

    // ========================================================
    // MODE: DRAFT-CLEAR
    //
    // Menghapus SELURUH document schedule_drafts milik store
    // yang terautentikasi pada bulan/tahun yang diminta.
    // HANYA menyentuh collection schedule_drafts — TIDAK pernah
    // menyentuh collection "schedules" (data final). storeId/
    // cabangId diambil dari akun (bukan body), sehingga user
    // hanya bisa menghapus draft milik tokonya sendiri.
    // Query dibatasi tanggal bulan aktif (bukan full-scan),
    // sama dengan scope GET.
    // ========================================================

    if (
      mode === "draft-clear"
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
        !Number.isInteger(month) ||
        month < 0 ||
        month > 11
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

      // Periode bulan target: [start, end)
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

      const snapshot =
        await adminDb
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
          .get()

      const draftDeletes: Promise<unknown>[] = []

      for (
        const frame of snapshot.docs
      ) {
        const data =
          frame.data()

        // Hanya hapus draft milik cabang akun ini.
        // Draft cabang lain toko yang sama tidak disentuh.
        if (
          data?.cabangId !==
            cabangId
        ) {
          continue
        }

        draftDeletes.push(
          frame.ref.delete(),
        )
      }

      await Promise.all(draftDeletes)

      // ====================================================
      // ADDITIF: HAPUS DRAFT KEGIATAN BULAN INI
      // schedule_activity_drafts — scope sama (storeId +
      // cabangId + range tanggal). Tidak menyentuh
      // schedule_activities (final).
      // ====================================================

      const activityDraftSnap =
        await adminDb
          .collection(
            "schedule_activity_drafts",
          )
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
          .get()

      const activityDraftDeletes: Promise<unknown>[] =
        []

      for (
        const frame of activityDraftSnap.docs
      ) {
        const data =
          frame.data()

        if (
          data?.cabangId !==
            cabangId
        ) {
          continue
        }

        activityDraftDeletes.push(
          frame.ref.delete(),
        )
      }

      if (activityDraftDeletes.length > 0) {
        await Promise.all(
          activityDraftDeletes,
        )
      }

      return NextResponse.json({
        success: true,
        message:
          "Draft jadwal berhasil dikosongkan.",
        deleted:
          draftDeletes.length +
          activityDraftDeletes.length,
      })
    }

    // ========================================================
    // MODE: FINAL-DELETE
    //
    // Menghapus SCHEDULE FINAL (collection "schedules").
    //
    //   - CELL:  body { employeeId, tanggal } → hapus SATU
    //            dokumen (storeId + tanggal + employeeId).
    //   - BULAN: body { year, month } → hapus SELURUH dokumen
    //            schedules bulan tersebut milik store akun.
    //
    // storeId/cabangId berasal dari akun terautentikasi (bukan
    // body). HANYA store yang boleh — Central Cabang/Pusat tidak
    // memiliki akses ke endpoint ini. Rules schedules tetap
    // client-write false; delete dilakukan via Admin SDK.
    // Status "Selesai" adalah fase UI; tidak ada field status
    // dihapus karena definisinya tidak diubah.
    // ========================================================

    if (
      mode === "final-delete"
    ) {
      const hasCell =
        body?.tanggal != null &&
        body?.employeeId != null

      const hasMonth =
        body?.year != null &&
        body?.month != null

      if (
        !hasCell &&
        !hasMonth
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Parameter (employeeId + tanggal) atau (year + month) wajib diisi.",
          },
          {
            status: 400,
          },
        )
      }

      if (hasCell) {
        const employeeId =
          String(
            body?.employeeId ?? "",
          ).trim()

        const tanggal =
          String(
            body?.tanggal ?? "",
          ).trim()

        if (
          !employeeId
        ) {
          return NextResponse.json(
            {
              success: false,
              message:
                "employeeId wajib diisi.",
            },
            {
              status: 400,
            },
          )
        }

        if (
          !isValidDateISO(tanggal)
        ) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Tanggal tidak valid.",
            },
            {
              status: 400,
            },
          )
        }

        // Gunakan query toko/tanggal seperti jalur Kosongkan Semua, lalu
        // cocokkan employee dan cabang terhadap dokumen yang benar-benar
        // dibaca tabel. Dengan begitu ID dokumen legacy tetap didukung.
        const schedulesForDate = await adminDb
          .collection("schedules")
          .where("storeId", "==", storeId)
          .where("tanggal", "==", tanggal)
          .get()
        const matchingSchedules = schedulesForDate.docs.filter((schedule) => {
          const data = schedule.data()
          return data?.employeeId === employeeId
        })

        if (matchingSchedules.length === 0) {
          return NextResponse.json(
            {
              success: false,
              message: "Jadwal final sel tidak ditemukan.",
            },
            { status: 404 },
          )
        }

        if (matchingSchedules.length > 1) {
          return NextResponse.json(
            {
              success: false,
              message: "Lebih dari satu jadwal final cocok dengan sel ini. Tidak ada data yang dihapus.",
            },
            { status: 409 },
          )
        }

        if (matchingSchedules[0].data()?.cabangId !== cabangId) {
          return NextResponse.json(
            {
              success: false,
              message: "Jadwal final sel tidak ditemukan dalam scope cabang akun ini.",
            },
            { status: 404 },
          )
        }

        await matchingSchedules[0].ref.delete()

        return NextResponse.json({
          success: true,
          message:
            "Jadwal final sel berhasil dihapus.",
          deleted: 1,
        })
      }

      // ----- FINAL-DELETE BULAN -----

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
        !Number.isInteger(month) ||
        month < 0 ||
        month > 11
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

      // Periode bulan target: [start, end)
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
            ">=",
            start,
          )
          .where(
            "tanggal",
            "<",
            end,
          )
          .get()

      const docs =
        snapshot.docs.filter(
          (frame) =>
            frame.data()
              ?.cabangId ===
            cabangId,
        )

      // Batas batch Firestore: 500 operasi. Hapus dalam chunk
      // aman agar jumlah dokumen besar tidak melampaui limit.
      let deleted = 0

      for (
        let offset = 0;
        offset < docs.length;
        offset += 499
      ) {
        const chunk =
          docs.slice(
            offset,
            offset + 499,
          )

        const batch =
          adminDb.batch()

        for (
          const frame of chunk
        ) {
          batch.delete(
            frame.ref,
          )
        }

        await batch.commit()
        deleted +=
          chunk.length
      }

      return NextResponse.json({
        success: true,
        message:
          "Jadwal final bulan ini berhasil dihapus.",
        deleted,
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
