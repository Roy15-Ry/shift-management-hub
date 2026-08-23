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
                {
                    status: 401,
                },
            )
        }

        const idToken =
            authorization.substring(7)

        // =====================================================
        // VERIFIKASI TOKEN
        // =====================================================

        const decodedToken =
            await adminAuth.verifyIdToken(idToken)

        const uid =
            decodedToken.uid

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
                {
                    status: 403,
                },
            )
        }

        const currentUser =
            userSnapshot.data()

        const role =
            currentUser?.role

        const currentCabangId =
            currentUser?.cabangId

        const currentStoreId =
            currentUser?.storeId

        // =====================================================
        // ROLE YANG DIIZINKAN
        // =====================================================

        if (
            role !== "central_pusat" &&
            role !== "central_cabang" &&
            role !== "store"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin melihat data Store.",
                },
                {
                    status: 403,
                },
            )
        }

        // =====================================================
        // AMBIL SEMUA STORE
        // =====================================================

        const snapshot =
            await adminDb
                .collection("stores")
                .get()

        let stores =
            snapshot.docs.map(
                (doc) => {
                    const data =
                        doc.data()

                    return {
                        storeId:
                            data.storeId ??
                            doc.id,

                        namaStore:
                            data.namaStore ??
                            "",

                        cabangId:
                            data.cabangId ??
                            null,

                        aktif:
                            data.aktif === true,
                    }
                },
            )

        // =====================================================
        // CENTRAL CABANG
        // HANYA BOLEH MELIHAT STORE CABANG SENDIRI
        // =====================================================

        if (
            role ===
            "central_cabang"
        ) {
            stores =
                stores.filter(
                    (store) =>
                        store.cabangId ===
                        currentCabangId,
                )
        }

        // =====================================================
        // STORE
        // HANYA MELIHAT STORE SENDIRI
        // =====================================================

        if (
            role === "store"
        ) {
            stores =
                stores.filter(
                    (store) =>
                        store.storeId ===
                        currentStoreId,
                )
        }

        // =====================================================
        // URUTKAN
        // =====================================================

        stores.sort(
            (a, b) =>
                String(
                    a.namaStore,
                ).localeCompare(
                    String(
                        b.namaStore,
                    ),
                ),
        )

        return NextResponse.json({
            success: true,
            stores,
        })
    } catch (error: unknown) {
        console.error(
            "GET STORES ERROR:",
            error,
        )

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Gagal mengambil data Store.",
            },
            {
                status: 500,
            },
        )
    }
}