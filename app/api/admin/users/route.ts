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
    // AMBIL TOKEN LOGIN
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
    // AMBIL PROFIL USER
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
    // HANYA CENTRAL PUSAT DAN CENTRAL CABANG
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
            "Anda tidak memiliki izin melihat akun.",
        },
        { status: 403 },
      )
    }

    // =====================================================
    // AMBIL SEMUA USER DARI FIRESTORE
    // =====================================================

    const snapshot =
      await adminDb
        .collection("users")
        .get()

    let users =
      snapshot.docs.map((doc) => {
        const data = doc.data()

        return {
          uid: doc.id,
          nama: data.nama ?? "",
          email: data.email ?? "",
          role: data.role ?? "",
          cabangId:
            data.cabangId ?? null,
          aktif:
            data.aktif === true,
        }
      })

    // =====================================================
    // CENTRAL CABANG HANYA MELIHAT AKUN
    // DI CABANGNYA SENDIRI
    // =====================================================

    if (
      currentUser?.role ===
      "central_cabang"
    ) {
      users =
        users.filter(
          (user) =>
            user.cabangId ===
            currentUser.cabangId,
        )
    }

    // =====================================================
    // URUTAN
    // =====================================================

    users.sort((a, b) =>
      a.nama.localeCompare(
        b.nama,
      ),
    )

    return NextResponse.json({
      success: true,
      users,
    })
  } catch (error: unknown) {
    console.error(
      "GET USERS ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil daftar akun.",
      },
      { status: 500 },
    )
  }
}