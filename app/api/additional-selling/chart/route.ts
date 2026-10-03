import { NextResponse } from "next/server"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// GRAFIK PENCAPAIAN PROGRAM — ENDPOINT KHUSUS CHART
//
// Endpoint ini HANYA melayani satu kebutuhan: data agregat
// per toko untuk Grafik Pencapaian Program pada Dashboard.
//
// DESAIN KEAMANAN (paling penting di file ini):
//   Endpoint ini TIDAK PERNAH mengirim dan TIDAK PERNAH
//   membaca untuk dikirim:
//     - transaksi / detail transaksi
//     - nama karyawan
//     - perEmployee
//     - target individual karyawan
//     - realisasi individual karyawan
//     - progress (persentase)
//
//   Yang dikirim hanya 4 angka agregat per toko per program:
//     totalTarget, totalAchievement, dan identitas toko
//     (storeId + storeName). Itu saja.
//
// ============================================================
// SCOPE
// ============================================================
//
//   STORE          -> seluruh toko pada CABANG AKUN
//                     (user.cabangId). Ini adalah scope khusus
//                     grafik yang sudah disetujui. Endpoint lain
//                     (/api/additional-selling) tidak berubah
//                     dan tetap memakai scopeForRole() yang
//                     sekarang, yaitu satu toko untuk Store.
//   CENTRAL CABANG -> seluruh toko pada user.cabangId
//   CENTRAL PUSAT  -> seluruh toko pada param "cabang".
//                     Cabang WAJIB ada, tidak boleh "ALL" —
//                     mengikuti mekanisme existing.
//
// Cakupan chart SELALU satu cabang. Tidak pernah seluruh
// perusahaan.
//
// scopeForRole() pada /api/additional-selling TIDAK disentuh
// dan tidak direuse di sini: Store membutuhkan daftar toko
// se-CABANG yang memang tidak ada pada scope detail, dan
// bentuk datanya berbeda (agregat chart, bukan rekap+detail).
//
// ============================================================
// SATUAN (tidak ada konversi, tidak ada persen)
// ============================================================
//
//   ADDITIONAL SELLING        -> targetNominal / nominal (Rp)
//   UPSIZE BOTOL              -> targetPcs / pcs (PCS)
//   SELLING EKSKLUSIF PERFUME -> targetPcs / pcs (PCS)
//
// Tidak ada field progress di response. Persentase bukan
// informasi yang dibutuhkan chart.
//
// ============================================================
// ATURAN AGREGASI (SAMA dengan /api/additional-selling)
// ============================================================
//
// Target dan realisasi dijumlahkan per (karyawan + jenis),
// dan hanya karyawan yang SUDAH MEMILIKI target untuk jenis
// tersebut yang dihitung. Ini persis aturan aggregateByJenis
// pada endpoint existing:
//
//   totalTarget      = SUM(target)  untuk key yang punya target
//   totalAchievement = SUM(realisasi) untuk key yang punya target
//
// Realisasi dari karyawan yang belum punya target untuk jenis
// tersebut tidak ikut dihitung, sama seperti endpoint existing.
//
// Dua query per toko memakai pola yang sudah ada (tidak perlu
// index baru):
//   additional_selling          -> storeId + rentang tanggal
//   additional_selling_targets  -> storeId + periode
//
// Jumlah read = 2N + 2 (1 users + 1 stores + N + N).
// Tidak ada write sama sekali.
//
// ============================================================
// PERIODE
// ============================================================
//
// Kontrak parameter TIDAK BERUBAH: "month" adalah 0-11
// (getMonth(), BUKAN getMonth() + 1). periode memakai
// "YYYY-MM" 1-based seperti endpoint existing.

const JENIS_LIST = [
  "ADDITIONAL_SELLING",
  "UPSIZE_BOTOL",
  "SELLING_EKSKLUSIF_PERFUME",
] as const

type PenjualanJenis = (typeof JENIS_LIST)[number]

type ChartUser = {
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
): Promise<ChartUser> {
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

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(decodedToken.uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data = userSnapshot.data() ?? {}

  const role = String(data?.role ?? "").trim()
  const storeId = String(
    data?.storeId ?? "",
  ).trim()
  const cabangId = String(
    data?.cabangId ?? "",
  ).trim()

  if (data?.aktif !== true || !role) {
    throw new Error("FORBIDDEN")
  }

  return {
    uid: decodedToken.uid,
    role,
    storeId,
    cabangId,
  }
}

// ============================================================
// HELPER
// ============================================================

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
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

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && error.message
      ? error.message
      : ""

  if (code === "AUTH_REQUIRED") {
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
    "Gagal memproses data grafik pencapaian:",
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
// PERIODE — KONTRAK 0-11 (SAMA dengan endpoint existing)
// ============================================================

function buildPeriod(
  year: number,
  month: number,
): {
  periode: string
  start: string
  end: string
} {
  const periode = `${year}-${pad2(month + 1)}`
  const start = `${periode}-01`

  const endYear = month === 11 ? year + 1 : year
  const endMonth = month === 11 ? 0 : month + 1
  const end = `${endYear}-${pad2(endMonth + 1)}-01`

  return { periode, start, end }
}

// ============================================================
// JENIS — DOKUMEN LAMA TANPA "jenis" = ADDITIONAL_SELLING
// ============================================================

function resolveJenis(value: unknown): PenjualanJenis {
  const jenis = normalize(
    value ?? "ADDITIONAL_SELLING",
  )

  return (JENIS_LIST as readonly string[]).includes(
    jenis,
  )
    ? (jenis as PenjualanJenis)
    : "ADDITIONAL_SELLING"
}

// ============================================================
// SCOPE CHART — KHUSUS ENDPOINT INI
// ============================================================

async function getChartStores(
  cabangId: string,
): Promise<
  {
    storeId: string
    storeName: string
  }[]
> {
  const normalizedCabangId = normalize(cabangId)

  if (!normalizedCabangId) {
    return []
  }

  const snapshot =
    await adminDb
      .collection("stores")
      .where(
        "cabangId",
        "==",
        normalizedCabangId,
      )
      .get()

  const stores: {
    storeId: string
    storeName: string
  }[] = []

  snapshot.docs.forEach((doc) => {
    const data = doc.data()

    // Toko non-aktif tidak masuk grafik. Filter ini hanya
    // berlaku untuk endpoint chart dan TIDAK mengubah
    // helper global getAllStoresByCabang() maupun endpoint
    // existing.
    if (data?.aktif === false) {
      return
    }

    const storeId = cleanString(
      data?.storeId ?? doc.id ?? "",
      100,
    )

    if (!storeId) {
      return
    }

    stores.push({
      storeId,
      storeName:
        cleanString(
          data?.namaStore ?? data?.nama ?? "",
          120,
        ) || storeId,
    })
  })

  stores.sort((a, b) =>
    (a.storeName || a.storeId).localeCompare(
      b.storeName || b.storeId,
      "id",
      { sensitivity: "base" },
    ),
  )

  return stores
}

// ============================================================
// PEMBACAAN PER TOKO
// ============================================================

async function readStoreTransactions(
  storeId: string,
  start: string,
  end: string,
): Promise<
  {
    employeeId: string
    jenis: PenjualanJenis
    nominal: number
    pcs: number
  }[]
> {
  const snapshot =
    await adminDb
      .collection("additional_selling")
      .where("storeId", "==", storeId)
      .where("tanggal", ">=", start)
      .where("tanggal", "<", end)
      .get()

  const rows: {
    employeeId: string
    jenis: PenjualanJenis
    nominal: number
    pcs: number
  }[] = []

  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const jenis = resolveJenis(data?.jenis)

    rows.push({
      employeeId: cleanString(
        data?.employeeId,
        200,
      ),
      jenis,
      nominal:
        jenis === "ADDITIONAL_SELLING" &&
        typeof data?.nominal === "number"
          ? data.nominal
          : 0,
      pcs:
        jenis !== "ADDITIONAL_SELLING" &&
        typeof data?.pcs === "number"
          ? data.pcs
          : 0,
    })
  })

  return rows
}

async function readStoreTargets(
  storeId: string,
  periode: string,
): Promise<
  {
    employeeId: string
    jenis: PenjualanJenis
    targetNominal: number
    targetPcs: number
  }[]
> {
  const snapshot =
    await adminDb
      .collection("additional_selling_targets")
      .where("storeId", "==", storeId)
      .where("periode", "==", periode)
      .get()

  const rows: {
    employeeId: string
    jenis: PenjualanJenis
    targetNominal: number
    targetPcs: number
  }[] = []

  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    const jenis = resolveJenis(data?.jenis)

    rows.push({
      employeeId: cleanString(
        data?.employeeId,
        200,
      ),
      jenis,
      targetNominal:
        jenis === "ADDITIONAL_SELLING" &&
        typeof data?.targetNominal === "number"
          ? data.targetNominal
          : 0,
      targetPcs:
        jenis !== "ADDITIONAL_SELLING" &&
        typeof data?.targetPcs === "number"
          ? data.targetPcs
          : 0,
    })
  })

  return rows
}

// ============================================================
// AGREGASI — SATUAN ASLI, TANPA PERSEN
// ============================================================

function aggregateChart(
  transactions: Awaited<
    ReturnType<typeof readStoreTransactions>
  >,
  targets: Awaited<
    ReturnType<typeof readStoreTargets>
  >,
): Record<
  PenjualanJenis,
  {
    totalTarget: number
    totalAchievement: number
  }
> {
  // Target per (karyawan + jenis). Dokumen target ganda untuk
  // key yang sama ditimpa, sama seperti endpoint existing.
  const targetByKey = new Map<string, number>()

  for (const target of targets) {
    const employeeId = target.employeeId

    if (!employeeId) {
      continue
    }

    targetByKey.set(
      `${employeeId}|${target.jenis}`,
      target.jenis === "ADDITIONAL_SELLING"
        ? target.targetNominal
        : target.targetPcs,
    )
  }

  // Realisasi per (karyawan + jenis).
  const achievementByKey = new Map<string, number>()

  for (const txn of transactions) {
    const employeeId = txn.employeeId

    if (!employeeId) {
      continue
    }

    const key = `${employeeId}|${txn.jenis}`
    const achievement =
      txn.jenis === "ADDITIONAL_SELLING"
        ? txn.nominal
        : txn.pcs

    achievementByKey.set(
      key,
      (achievementByKey.get(key) ?? 0) +
        achievement,
    )
  }

  // Hanya karyawan yang SUDAH punya target untuk jenis
  // tersebut yang dihitung — identik dengan aturan
  // aggregateByJenis pada endpoint existing.
  const totals: Record<
    PenjualanJenis,
    {
      totalTarget: number
      totalAchievement: number
    }
  > = {
    ADDITIONAL_SELLING: {
      totalTarget: 0,
      totalAchievement: 0,
    },
    UPSIZE_BOTOL: {
      totalTarget: 0,
      totalAchievement: 0,
    },
    SELLING_EKSKLUSIF_PERFUME: {
      totalTarget: 0,
      totalAchievement: 0,
    },
  }

  for (const [key, target] of targetByKey) {
    const jenis = key.slice(
      key.lastIndexOf("|") + 1,
    ) as PenjualanJenis

    const bucket = totals[jenis]

    if (!bucket) {
      continue
    }

    bucket.totalTarget += target
    bucket.totalAchievement +=
      achievementByKey.get(key) ?? 0
  }

  return totals
}

// ============================================================
// GET — DATA AGREGAT PER TOKO UNTUK GRAFIK
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

    const { periode, start, end } = buildPeriod(
      year,
      month,
    )

    // =====================================================
    // CABANG DALAM SCOPE
    // =====================================================
    //
    // store + central_cabang -> cabang dari AKUN (tidak
    // pernah dari client). central_pusat -> param "cabang"
    // yang wajib, mengikuti mekanisme existing (tidak ada
    // "Semua Cabang").

    let scopeCabangId = ""

    if (role === "central_pusat") {
      scopeCabangId = normalize(
        url.searchParams.get("cabang") ?? "",
      )

      if (
        !scopeCabangId ||
        scopeCabangId === "ALL" ||
        scopeCabangId === "__ALL__"
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Central Pusat wajib memilih satu cabang untuk melihat grafik pencapaian.",
          },
          { status: 400 },
        )
      }
    } else {
      scopeCabangId = normalize(user.cabangId)
    }

    const stores =
      await getChartStores(scopeCabangId)

    // =====================================================
    // AGREGASI PER TOKO
    // =====================================================
    //
    // Dua query per toko, dijalankan bersama agar tidak
    // menumpuk latency. Jumlah read tetap 2N + 2.

    const rows = await Promise.all(
      stores.map(async (store) => {
        const [transactions, targets] =
          await Promise.all([
            readStoreTransactions(
              store.storeId,
              start,
              end,
            ),
            readStoreTargets(
              store.storeId,
              periode,
            ),
          ])

        return {
          storeId: store.storeId,
          storeName: store.storeName,
          byJenis: aggregateChart(
            transactions,
            targets,
          ),
        }
      }),
    )

    return NextResponse.json({
      success: true,
      periode,
      scope: {
        role,
        cabangId: scopeCabangId,
        totalStores: rows.length,
      },
      stores: rows,
    })
  } catch (error) {
    return errorResponse(error)
  }
}