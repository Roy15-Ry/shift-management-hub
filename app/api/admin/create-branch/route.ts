import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"

export async function POST(request: Request) {
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
    // HANYA CENTRAL PUSAT
    // YANG BOLEH MEMBUAT CABANG
    // =====================================================

    if (
      currentUser?.role !==
        "central_pusat" ||
      currentUser?.aktif !== true
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Hanya Central Pusat yang dapat membuat cabang.",
        },
        { status: 403 },
      )
    }

    // =====================================================
    // AMBIL DATA
    // =====================================================

    const body =
      await request.json()

    const {
      cabangId,
      nama,
    } = body

    // =====================================================
    // VALIDASI
    // =====================================================

    if (!cabangId || !nama) {
      return NextResponse.json(
        {
          success: false,
          message:
            "cabangId dan nama wajib diisi.",
        },
        { status: 400 },
      )
    }

    // =====================================================
    // NORMALISASI ID CABANG
    // =====================================================

    const normalizedCabangId =
      String(cabangId)
        .trim()
        .toUpperCase()

    const normalizedNama =
      String(nama).trim()

    // =====================================================
    // CEK APAKAH CABANG SUDAH ADA
    // =====================================================

    const branchRef =
      adminDb
        .collection("branches")
        .doc(normalizedCabangId)

    const branchSnapshot =
      await branchRef.get()

    if (branchSnapshot.exists) {
      return NextResponse.json(
        {
          success: false,
          message:
            "ID cabang sudah digunakan.",
        },
        { status: 409 },
      )
    }

    // =====================================================
    // SIMPAN CABANG
    // =====================================================

    await branchRef.set({
      cabangId: normalizedCabangId,
      nama: normalizedNama,
      aktif: true,
      createdAt:
        new Date(),
    })

    // =====================================================
    // BERHASIL
    // =====================================================

    return NextResponse.json({
      success: true,
      message:
        "Cabang berhasil dibuat.",
      cabang: {
        cabangId:
          normalizedCabangId,
        nama: normalizedNama,
        aktif: true,
      },
    })
  } catch (error: unknown) {
    console.error(
      "CREATE BRANCH ERROR:",
      error,
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal membuat cabang.",
      },
      { status: 500 },
    )
  }
}