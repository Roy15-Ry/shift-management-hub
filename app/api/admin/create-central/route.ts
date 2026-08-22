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
        // AMBIL DATA USER DARI FIRESTORE
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

        // =====================================================
        // CEK ROLE CENTRAL PUSAT
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
                        "Anda tidak memiliki izin untuk membuat akun Central Cabang.",
                },
                {
                    status: 403,
                },
            )
        }

        // =====================================================
        // AMBIL DATA AKUN BARU
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
        // BUAT AKUN FIREBASE AUTH
        // =====================================================

        const userRecord =
            await adminAuth.createUser({
                email,
                password,
                displayName: nama,
            })

        // =====================================================
        // SIMPAN PROFIL USER
        // =====================================================

        await adminDb
            .collection("users")
            .doc(userRecord.uid)
            .set({
                uid: userRecord.uid,
                email,
                nama,
                role: "central_cabang",
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
                "Akun Central Cabang berhasil dibuat.",
            uid: userRecord.uid,
        })
    } catch (error: unknown) {
        console.error(
            "CREATE CENTRAL ERROR:",
            error,
        )

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Gagal membuat akun.",
            },
            {
                status: 500,
            },
        )
    }
}