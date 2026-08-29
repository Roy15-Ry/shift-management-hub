import { NextResponse } from "next/server"
import {
  FieldValue,
} from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// ============================================================
// REVISI STATUS WORKFLOW
// ============================================================

const REVISI_STATUS = new Set([
  "BARU",
  "PROSES",
  "SELESAI",
])

// Transisi massal yang diizinkan.
// PROSES SEMUA  : BARU  -> PROSES
// SELESAIKAN   : PROSES -> SELESAI
const MASS_TRANSITIONS: Record<
  string,
  string
> = {
  PROSES: "BARU",
  SELESAI: "PROSES",
}

// Batas operasi per batch Firestore (maks 500).
const BATCH_LIMIT = 400

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

function isCentralRole(
  role: string,
) {
  return (
    role === "central_cabang" ||
    role === "central_pusat"
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
// POST
// Memproses seluruh pengajuan dalam scope user secara massal.
//
//   to = "PROSES"  -> semua BARU  menjadi PROSES
//   to = "SELESAI" -> semua PROSES menjadi SELESAI
//
// Scope ditentukan dari akun yang login (role + cabangId),
// BUKAN dari body request.
// ============================================================

export async function POST(
  request: Request,
) {
  try {
    const {
      uid,
      role,
      data: userData,
    } =
      await getAuthenticatedUser(
        request,
      )

    // Massal hanya untuk Central.
    if (!isCentralRole(role)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Aksi massal hanya dapat dilakukan oleh Central.",
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

    const to =
      cleanString(
        body?.to,
        20,
      )

    const from =
      MASS_TRANSITIONS[to]

    if (
      !REVISI_STATUS.has(to) ||
      !from
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Target status tidak valid.",
        },
        { status: 400 },
      )
    }

    // =====================================================
    // VALIDASI STORE & SCOPE (SERVER-SIDE)
    //
    // storeId diambil dari body, tetapi TIDAK dipercaya
    // begitu saja. Store diperiksa benar-benar berada dalam
    // kewenangan user (via cabangId akun pada role cabang).
    //
    // CENTRAL CABANG -> store.cabangId harus == cabangId akun.
    // CENTRAL PUSAT  -> store harus ada (scope penuh).
    // =====================================================

    const targetStoreId =
      cleanString(
        body?.storeId,
        100,
      )

    if (!targetStoreId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko tidak dipilih.",
        },
        { status: 400 },
      )
    }

    const storeSnapshot =
      await adminDb
        .collection("stores")
        .where(
          "storeId",
          "==",
          targetStoreId,
        )
        .limit(1)
        .get()

    const storeDoc =
      storeSnapshot.docs[0]

    if (!storeDoc) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Toko tidak ditemukan.",
        },
        { status: 404 },
      )
    }

    const storeCabangId =
      cleanString(
        storeDoc.data().cabangId ??
          storeDoc.data().id ??
          "",
        100,
      )

    if (role === "central_cabang") {
      const userCabangId =
        cleanString(
          userData?.cabangId,
          100,
        )

      // Cabang user harus cocok dengan cabang toko.
      if (
        !userCabangId ||
        storeCabangId !== userCabangId
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Anda hanya dapat memproses toko pada cabang Anda.",
          },
          { status: 403 },
        )
      }
    }

    // =====================================================
    // QUERY: hanya pengajuan TOKO YANG DIPILIH
    // =====================================================

    const revisiRef =
      adminDb.collection("revisi")

    const query = revisiRef
      .where(
        "storeId",
        "==",
        targetStoreId,
      )
      .where(
        "status",
        "==",
        from,
      )

    const snapshot =
      await query.get()

    if (snapshot.empty) {
      return NextResponse.json(
        {
          success: true,
          processed: 0,
          message:
            "Tidak ada pengajuan yang perlu diproses.",
        },
      )
    }

    const adminName =
      cleanString(
        userData?.nama ??
          userData?.email ??
          "Central",
        150,
      )

    const now = fmtDateTime()

    const docRefs =
      snapshot.docs.map(
        (doc) => doc.ref,
      )

    const ids =
      snapshot.docs.map(
        (doc) => doc.id,
      )

    // =====================================================
    // BATCH WRITE (dipecah per 400 operasi agar aman)
    // =====================================================

    const commits: Promise<unknown>[] = []

    for (
      let i = 0;
      i < docRefs.length;
      i += BATCH_LIMIT
    ) {
      const group =
        docRefs.slice(
          i,
          i + BATCH_LIMIT,
        )

      const batch =
        adminDb.batch()

      group.forEach(
        (ref) => {
          batch.update(ref, {
            status: to,
            prosesAt: now,
            prosesOleh: adminName,
            prosesUid: uid,
            batchMass: true,
            updatedAt:
              FieldValue.serverTimestamp(),
          })
        },
      )

      commits.push(
        batch.commit(),
      )
    }

    await Promise.all(commits)

    return NextResponse.json(
      {
        success: true,
        processed: ids.length,
        message: `${ids.length} pengajuan diproses menjadi ${to}.`,
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
      "Gagal memproses revisi massal:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          "Aksi massal gagal. Silakan coba lagi.",
      },
      { status: 500 },
    )
  }
}
