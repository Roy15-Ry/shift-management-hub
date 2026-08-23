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
            request.headers.get(
                "authorization",
            )

        if (
            !authorization ||
            !authorization.startsWith(
                "Bearer ",
            )
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

        const idToken =
            authorization.substring(7)

        // =====================================================
        // VERIFIKASI TOKEN
        // =====================================================

        const decodedToken =
            await adminAuth.verifyIdToken(
                idToken,
            )

        const uid =
            decodedToken.uid

        // =====================================================
        // AMBIL PROFIL USER YANG LOGIN
        // =====================================================

        const currentUserSnapshot =
            await adminDb
                .collection("users")
                .doc(uid)
                .get()

        if (
            !currentUserSnapshot.exists
        ) {
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
            currentUserSnapshot.data()

        const role =
            currentUser?.role

        const currentCabangId =
            currentUser?.cabangId

        const currentStoreId =
            currentUser?.storeId

        // =====================================================
        // CEK HAK AKSES
        // =====================================================

        if (
            role !==
            "central_pusat" &&
            role !==
            "central_cabang" &&
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
        // AMBIL DATA STORE
        // =====================================================

        const storesSnapshot =
            await adminDb
                .collection("stores")
                .get()

        let stores =
            storesSnapshot.docs.map(
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
        // FILTER CENTRAL CABANG
        // HANYA CABANG MILIKNYA
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
        // FILTER STORE
        // HANYA STORE SENDIRI
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
        // AMBIL AKUN STORE
        // DARI COLLECTION USERS
        // =====================================================

        const usersSnapshot =
            await adminDb
                .collection("users")
                .get()

        const storeAccounts =
            usersSnapshot.docs
                .map(
                    (doc) => {
                        const data =
                            doc.data()

                        return {
                            uid: doc.id,

                            nama:
                                data.nama ??
                                "",

                            email:
                                data.email ??
                                "",

                            role:
                                data.role ??
                                "",

                            storeId:
                                data.storeId ??
                                null,

                            cabangId:
                                data.cabangId ??
                                null,

                            aktif:
                                data.aktif === true,
                        }
                    },
                )
                .filter(
                    (user) =>
                        user.role ===
                        "store" &&
                        Boolean(
                            user.storeId,
                        ),
                )

        // =====================================================
        // GABUNGKAN DATA STORE
        // DENGAN DATA AKUN STORE
        // =====================================================

        const storesWithAccounts =
            stores.map(
                (store) => {
                    const account =
                        storeAccounts.find(
                            (user) =>
                                user.storeId ===
                                store.storeId,
                        )

                    return {
                        ...store,

                        akunUid:
                            account?.uid ??
                            null,

                        akunNama:
                            account?.nama ??
                            null,

                        akunEmail:
                            account?.email ??
                            null,

                        akunAktif:
                            account
                                ? account.aktif
                                : null,
                    }
                },
            )

        // =====================================================
        // URUTKAN
        // =====================================================

        storesWithAccounts.sort(
            (a, b) =>
                String(
                    a.namaStore,
                ).localeCompare(
                    String(
                        b.namaStore,
                    ),
                ),
        )

        // =====================================================
        // BERHASIL
        // =====================================================

        return NextResponse.json({
            success: true,
            stores:
                storesWithAccounts,
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