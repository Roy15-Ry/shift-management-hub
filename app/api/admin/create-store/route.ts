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
    // CENTRAL PUSAT   → BOLEH MEMBUAT STORE
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
      storeId,
      namaStore,
      cabangId,
    } = body

    // =====================================================
    // NORMALISASI DATA
    // =====================================================

    const cleanEmail =
      String(email ?? "")
        .trim()
        .toLowerCase()

    const cleanNama =
      String(nama ?? "")
        .trim()

    const cleanStoreId =
      String(storeId ?? "")
        .trim()
        .toUpperCase()

    const cleanNamaStore =
      String(namaStore ?? "")
        .trim()

    const cleanCabangId =
      String(cabangId ?? "")
        .trim()
        .toUpperCase()

    // =====================================================
    // VALIDASI
    // =====================================================

    if (
      !cleanEmail ||
      !password ||
      !cleanNama ||
      !cleanStoreId ||
      !cleanNamaStore ||
      !cleanCabangId
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nama, email, password, ID Store, nama Store, dan cabang wajib diisi.",
        },
        {
          status: 400,
        },
      )
    }

    if (
      String(password).length < 6
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Password minimal 6 karakter.",
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
      currentCabangId !== cleanCabangId
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
    // PASTIKAN CABANG ADA
    // =====================================================

    const branchSnapshot =
      await adminDb
        .collection("branches")
        .doc(cleanCabangId)
        .get()

    if (!branchSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Data cabang tidak ditemukan.",
        },
        {
          status: 400,
        },
      )
    }

    const branchData =
      branchSnapshot.data()

    if (
      branchData?.aktif === false
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Cabang tersebut sedang tidak aktif.",
        },
        {
          status: 400,
        },
      )
    }

    // =====================================================
    // CEK ID STORE SUDAH ADA ATAU BELUM
    // =====================================================

    const existingStore =
      await adminDb
        .collection("stores")
        .doc(cleanStoreId)
        .get()

    if (existingStore.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "ID Store sudah digunakan.",
        },
        {
          status: 400,
        },
      )
    }

    // =====================================================
    // BUAT AKUN FIREBASE AUTH
    // =====================================================

    const userRecord =
      await adminAuth.createUser({
        email: cleanEmail,
        password,
        displayName: cleanNama,
      })

    try {
      // ===================================================
      // SIMPAN DATA STORE
      // ===================================================

      await adminDb
        .collection("stores")
        .doc(cleanStoreId)
        .set({
          storeId: cleanStoreId,
          namaStore: cleanNamaStore,
          cabangId: cleanCabangId,
          aktif: true,
          createdAt:
            FieldValue.serverTimestamp(),
        })

      // ===================================================
      // SIMPAN PROFIL USER
      // ===================================================

      await adminDb
        .collection("users")
        .doc(userRecord.uid)
        .set({
          uid: userRecord.uid,
          email: cleanEmail,
          nama: cleanNama,
          role: "store",
          cabangId: cleanCabangId,
          storeId: cleanStoreId,
          namaStore: cleanNamaStore,
          aktif: true,
          createdAt:
            FieldValue.serverTimestamp(),
        })
    } catch (firestoreError) {
      // ===================================================
      // JIKA FIRESTORE GAGAL,
      // HAPUS USER AUTH YANG BARU DIBUAT
      // ===================================================

      try {
        await adminAuth.deleteUser(
          userRecord.uid,
        )
      } catch (deleteError) {
        console.error(
          "ROLLBACK AUTH ERROR:",
          deleteError,
        )
      }

      throw firestoreError
    }

    // =====================================================
    // BERHASIL
    // =====================================================

    return NextResponse.json({
      success: true,
      message:
        "Akun Store berhasil dibuat.",
      uid: userRecord.uid,
      storeId: cleanStoreId,
      cabangId: cleanCabangId,
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