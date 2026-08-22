import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

export async function POST(
  request: Request,
) {
  try {
    // =====================================================
    // AMBIL TOKEN LOGIN DARI HEADER
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
        {
          status: 401,
        },
      )
    }

    const idToken =
      authorization.substring(7)

    // =====================================================
    // VERIFIKASI TOKEN FIREBASE
    // =====================================================

    const decodedToken =
      await adminAuth.verifyIdToken(idToken)

    const uid = decodedToken.uid

    // =====================================================
    // AMBIL DATA USER YANG SEDANG LOGIN
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
        {
          status: 403,
        },
      )
    }

    const currentUser =
      userSnapshot.data()

    const currentRole =
      currentUser?.role

    const currentCabangId =
      currentUser?.cabangId

    // =====================================================
    // CEK HAK AKSES
    //
    // CENTRAL PUSAT  → BOLEH MEMBUAT STORE
    // CENTRAL CABANG  → BOLEH MEMBUAT STORE
    // STORE           → DITOLAK
    // =====================================================

    if (
      currentRole !== "central_pusat" &&
      currentRole !== "central_cabang"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin untuk membuat akun Store.",
        },
        {
          status: 403,
        },
      )
    }

    // =====================================================
    // AMBIL DATA STORE BARU
    // =====================================================

    const body =
      await request.json()

    const {
      email,
      password,
      nama,
      cabangId,
    } = body

    // =====================================================
    // VALIDASI
    // =====================================================

    if (
      !email ||
      !password ||
      !nama ||
      !cabangId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Email, password, nama, dan cabangId wajib diisi.",
        },
        {
          status: 400,
        },
      )
    }

    // =====================================================
    // CENTRAL CABANG HANYA BOLEH MEMBUAT STORE
    // DI CABANG MILIKNYA SENDIRI
    // =====================================================

    if (
      currentRole === "central_cabang" &&
      currentCabangId !== cabangId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Central Cabang hanya dapat membuat akun Store untuk cabangnya sendiri.",
        },
        {
          status: 403,
        },
      )
    }

    // =====================================================
    // BUAT AKUN FIREBASE AUTH
    // =====================================================

    const userRecord =
      await adminAuth.createUser({
        email,
        password,
        displayName: nama,
      })

    // =====================================================
    // SIMPAN PROFIL STORE KE FIRESTORE
    // =====================================================

    await adminDb
      .collection("users")
      .doc(userRecord.uid)
      .set({
        uid: userRecord.uid,
        email,
        nama,
        role: "store",
        cabangId,
        aktif: true,
        createdAt:
          FieldValue.serverTimestamp(),
      })

    // =====================================================
    // BERHASIL
    // =====================================================

    return NextResponse.json({
      success: true,
      message:
        "Akun Store berhasil dibuat.",
      uid: userRecord.uid,
    })
  } catch (error: unknown) {
    console.error(
      "CREATE STORE ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal membuat akun Store.",
      },
      {
        status: 500,
      },
    )
  }
}