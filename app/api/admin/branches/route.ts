import { NextResponse } from "next/server"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

export async function GET(
  request: Request,
) {
  try {
    // =====================================================
    // AMBIL TOKEN
    // =====================================================

    const authorization =
      request.headers.get("authorization")

    if (
      !authorization ||
      !authorization.startsWith("Bearer ")
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Tidak terautentikasi.",
        },
        { status: 401 },
      )
    }

    const idToken =
      authorization.substring(7)

    // =====================================================
    // VERIFIKASI TOKEN
    // =====================================================

    const decodedToken =
      await adminAuth.verifyIdToken(idToken)

    const uid = decodedToken.uid

    // =====================================================
    // CEK PROFIL USER
    // =====================================================

    const userSnapshot =
      await adminDb
        .collection("users")
        .doc(uid)
        .get()

    if (!userSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Profil pengguna tidak ditemukan.",
        },
        { status: 403 },
      )
    }

    const currentUser =
      userSnapshot.data()

    // =====================================================
    // CENTRAL PUSAT DAN CENTRAL CABANG
    // BOLEH MELIHAT DATA CABANG
    // =====================================================

    if (
      currentUser?.role !==
        "central_pusat" &&
      currentUser?.role !==
        "central_cabang"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin melihat data cabang.",
        },
        { status: 403 },
      )
    }

    // =====================================================
    // AMBIL DATA CABANG
    // =====================================================

    const snapshot =
      await adminDb
        .collection("branches")
        .get()

    let branches =
      snapshot.docs.map(
        (doc) => doc.data(),
      )

    // =====================================================
    // CENTRAL CABANG HANYA MELIHAT CABANG SENDIRI
    // =====================================================

    if (
      currentUser?.role ===
        "central_cabang"
    ) {
      branches =
        branches.filter(
          (branch) =>
            branch.cabangId ===
            currentUser.cabangId,
        )
    }

    // =====================================================
    // URUTKAN BERDASARKAN ID CABANG
    // =====================================================

    branches.sort(
      (a, b) =>
        String(a.cabangId).localeCompare(
          String(b.cabangId),
        ),
    )

    return NextResponse.json({
      success: true,
      branches,
    })
  } catch (error: unknown) {
    console.error(
      "GET BRANCHES ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil data cabang.",
      },
      { status: 500 },
    )
  }
}