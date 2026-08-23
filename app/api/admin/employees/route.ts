import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import {
    adminAuth,
    adminDb,
} from "@/lib/firebase-admin"

type CurrentUser = {
    uid: string
    role: string
    cabangId?: string | null
    storeId?: string | null
}

type StoreData = {
    cabangId?: string | null
    aktif?: boolean
    [key: string]: unknown
}

// =====================================================
// AUTH USER
// =====================================================

async function getCurrentUser(
    request: Request,
): Promise<CurrentUser> {
    const authorization =
        request.headers.get("authorization")

    if (
        !authorization ||
        !authorization.startsWith("Bearer ")
    ) {
        throw new Error("AUTH_REQUIRED")
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
        userSnapshot.data()

    return {
        uid,
        role: data?.role ?? "",
        cabangId:
            data?.cabangId ?? null,
        storeId:
            data?.storeId ?? null,
    }
}

// =====================================================
// NORMALIZER
// =====================================================

function normalizeText(
    value: unknown,
): string {
    return String(value ?? "").trim()
}

function normalizeNik(
    value: unknown,
): string {
    return normalizeText(value)
        .toUpperCase()
        .replace(/\s/g, "")
}

// =====================================================
// CEK ROLE CENTRAL
// =====================================================

function isCentralRole(
    role: string,
): boolean {
    return (
        role === "central_pusat" ||
        role === "central_cabang"
    )
}

// =====================================================
// AMBIL DATA STORE
// =====================================================

async function getStoreData(
    storeId: string,
): Promise<StoreData | null> {
    const storeSnapshot =
        await adminDb
            .collection("stores")
            .doc(storeId)
            .get()

    if (!storeSnapshot.exists) {
        return null
    }

    return (
        storeSnapshot.data() as StoreData
    )
}

// =====================================================
// CEK HAK AKSES STORE
//
// CENTRAL PUSAT
// → semua Store
//
// CENTRAL CABANG
// → Store dalam cabangnya
//
// STORE
// → hanya Store miliknya sendiri
// =====================================================

async function canAccessStore(
    user: CurrentUser,
    storeId: string,
): Promise<boolean> {
    const normalizedStoreId =
        normalizeText(
            storeId,
        ).toUpperCase()

    if (!normalizedStoreId) {
        return false
    }

    // -------------------------------------------------
    // CENTRAL PUSAT
    // -------------------------------------------------

    if (
        user.role ===
        "central_pusat"
    ) {
        return true
    }

    // -------------------------------------------------
    // STORE
    // -------------------------------------------------

    if (
        user.role === "store"
    ) {
        return (
            normalizeText(
                user.storeId,
            ).toUpperCase() ===
            normalizedStoreId
        )
    }

    // -------------------------------------------------
    // CENTRAL CABANG
    // -------------------------------------------------

    if (
        user.role ===
        "central_cabang"
    ) {
        const storeData =
            await getStoreData(
                normalizedStoreId,
            )

        if (!storeData) {
            return false
        }

        const storeCabangId =
            normalizeText(
                storeData.cabangId,
            ).toUpperCase()

        const userCabangId =
            normalizeText(
                user.cabangId,
            ).toUpperCase()

        return (
            Boolean(
                userCabangId,
            ) &&
            storeCabangId ===
                userCabangId
        )
    }

    return false
}

// =====================================================
// CEK HAK MODIFIKASI KARYAWAN
//
// HANYA:
// - central_pusat
// - central_cabang
//
// STORE TIDAK BOLEH.
// =====================================================

function canManageEmployees(
    user: CurrentUser,
): boolean {
    return isCentralRole(
        user.role,
    )
}

// =====================================================
// ERROR RESPONSE
// =====================================================

function handleAuthError(
    error: unknown,
) {
    if (
        error instanceof Error &&
        error.message ===
            "AUTH_REQUIRED"
    ) {
        return NextResponse.json(
            {
                success: false,
                message:
                    "Tidak terautentikasi.",
            },
            { status: 401 },
        )
    }

    if (
        error instanceof Error &&
        error.message ===
            "USER_PROFILE_NOT_FOUND"
    ) {
        return NextResponse.json(
            {
                success: false,
                message:
                    "Profil pengguna tidak ditemukan.",
            },
            { status: 403 },
        )
    }

    return null
}

// =====================================================
// GET
//
// CENTRAL PUSAT
// → semua karyawan
//
// CENTRAL CABANG
// → karyawan pada cabangnya
//
// STORE
// → hanya karyawan Store sendiri
//
// GET tetap boleh untuk STORE.
// =====================================================

export async function GET(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(
                request,
            )

        if (
            user.role !==
                "central_pusat" &&
            user.role !==
                "central_cabang" &&
            user.role !== "store"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin melihat data karyawan.",
                },
                { status: 403 },
            )
        }

        const url =
            new URL(
                request.url,
            )

        const requestedStoreId =
            normalizeText(
                url.searchParams.get(
                    "storeId",
                ),
            ).toUpperCase()

        // =================================================
        // AMBIL DATA STORE
        // =================================================

        const storesSnapshot =
            await adminDb
                .collection("stores")
                .get()

        const storeMap =
            new Map<
                string,
                StoreData
            >()

        storesSnapshot.docs.forEach(
            (doc) => {
                storeMap.set(
                    doc.id.toUpperCase(),
                    doc.data() as StoreData,
                )
            },
        )

        // =================================================
        // CEK STORE YANG DIMINTA
        // =================================================

        if (
            requestedStoreId
        ) {
            const allowed =
                await canAccessStore(
                    user,
                    requestedStoreId,
                )

            if (!allowed) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Anda tidak memiliki izin mengakses Store tersebut.",
                    },
                    { status: 403 },
                )
            }
        }

        // =================================================
        // AMBIL EMPLOYEES
        // =================================================

        const snapshot =
            await adminDb
                .collection(
                    "employees",
                )
                .get()

        let employees =
            snapshot.docs.map(
                (doc) => {
                    const data =
                        doc.data()

                    return {
                        id: doc.id,
                        name:
                            data.name ??
                            "",
                        nik:
                            data.nik ??
                            "",
                        posisi:
                            data.posisi ??
                            "",
                        storeId:
                            data.storeId ??
                            "",
                        cabangId:
                            data.cabangId ??
                            "",
                        aktif:
                            data.aktif ===
                            true,
                    }
                },
            )

        // =================================================
        // FILTER CENTRAL CABANG
        // =================================================

        if (
            user.role ===
            "central_cabang"
        ) {
            const userCabangId =
                normalizeText(
                    user.cabangId,
                ).toUpperCase()

            employees =
                employees.filter(
                    (employee) => {
                        const employeeStoreId =
                            normalizeText(
                                employee.storeId,
                            ).toUpperCase()

                        const storeData =
                            storeMap.get(
                                employeeStoreId,
                            )

                        if (
                            !storeData
                        ) {
                            return false
                        }

                        const storeCabangId =
                            normalizeText(
                                storeData.cabangId,
                            ).toUpperCase()

                        return (
                            storeCabangId ===
                            userCabangId
                        )
                    },
                )
        }

        // =================================================
        // FILTER STORE
        // =================================================

        if (
            user.role === "store"
        ) {
            const userStoreId =
                normalizeText(
                    user.storeId,
                ).toUpperCase()

            employees =
                employees.filter(
                    (employee) =>
                        normalizeText(
                            employee.storeId,
                        ).toUpperCase() ===
                        userStoreId,
                )
        }

        // =================================================
        // FILTER STORE REQUEST
        // =================================================

        if (
            requestedStoreId
        ) {
            employees =
                employees.filter(
                    (employee) =>
                        normalizeText(
                            employee.storeId,
                        ).toUpperCase() ===
                        requestedStoreId,
                )
        }

        // =================================================
        // URUTKAN
        // =================================================

        employees.sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name,
                ),
        )

        return NextResponse.json({
            success: true,
            employees,
        })
    } catch (error: unknown) {
        console.error(
            "GET EMPLOYEES ERROR:",
            error,
        )

        const authError =
            handleAuthError(
                error,
            )

        if (authError) {
            return authError
        }

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Gagal mengambil data karyawan.",
            },
            { status: 500 },
        )
    }
}

// =====================================================
// POST
//
// HANYA CENTRAL
// =====================================================

export async function POST(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(
                request,
            )

        // =================================================
        // STORE DILARANG MENAMBAH
        // =================================================

        if (
            !canManageEmployees(
                user,
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Akun Store hanya dapat melihat data karyawan. Anda tidak memiliki izin menambah karyawan.",
                },
                { status: 403 },
            )
        }

        const body =
            await request.json()

        const name =
            normalizeText(
                body.name,
            )

        const nik =
            normalizeNik(
                body.nik,
            )

        const posisi =
            normalizeText(
                body.posisi,
            )

        const storeId =
            normalizeText(
                body.storeId,
            ).toUpperCase()

        if (
            !name ||
            !nik ||
            !posisi ||
            !storeId
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Nama, NIK, posisi, dan storeId wajib diisi.",
                },
                { status: 400 },
            )
        }

        // =================================================
        // CEK AKSES STORE
        // =================================================

        if (
            !(
                await canAccessStore(
                    user,
                    storeId,
                )
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin menambah karyawan di Store tersebut.",
                },
                { status: 403 },
            )
        }

        // =================================================
        // CEK STORE
        // =================================================

        const storeData =
            await getStoreData(
                storeId,
            )

        if (!storeData) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Store tidak ditemukan.",
                },
                { status: 400 },
            )
        }

        if (
            storeData.aktif ===
            false
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Store sedang tidak aktif.",
                },
                { status: 400 },
            )
        }

        const cabangId =
            normalizeText(
                storeData.cabangId,
            ).toUpperCase()

        // =================================================
        // CEK NIK DUPLIKAT
        // =================================================

        const duplicateSnapshot =
            await adminDb
                .collection(
                    "employees",
                )
                .where(
                    "storeId",
                    "==",
                    storeId,
                )
                .where(
                    "nik",
                    "==",
                    nik,
                )
                .limit(1)
                .get()

        if (
            !duplicateSnapshot.empty
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        `NIK "${nik}" sudah digunakan oleh karyawan lain di Store tersebut.`,
                },
                { status: 409 },
            )
        }

        // =================================================
        // BUAT KARYAWAN
        // =================================================

        const employeeRef =
            adminDb
                .collection(
                    "employees",
                )
                .doc()

        await employeeRef.set({
            id: employeeRef.id,
            name,
            nik,
            posisi,
            storeId,
            cabangId,
            aktif: true,
            createdAt:
                FieldValue.serverTimestamp(),
        })

        return NextResponse.json({
            success: true,
            message:
                "Karyawan berhasil ditambahkan.",
            employee: {
                id: employeeRef.id,
                name,
                nik,
                posisi,
                storeId,
                cabangId,
                aktif: true,
            },
        })
    } catch (error: unknown) {
        console.error(
            "CREATE EMPLOYEE ERROR:",
            error,
        )

        const authError =
            handleAuthError(
                error,
            )

        if (authError) {
            return authError
        }

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Gagal menambahkan karyawan.",
            },
            { status: 500 },
        )
    }
}

// =====================================================
// PATCH
//
// HANYA CENTRAL
// =====================================================

export async function PATCH(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(
                request,
            )

        // =================================================
        // STORE DILARANG EDIT
        // =================================================

        if (
            !canManageEmployees(
                user,
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Akun Store hanya dapat melihat data karyawan. Anda tidak memiliki izin mengubah data karyawan.",
                },
                { status: 403 },
            )
        }

        const body =
            await request.json()

        const employeeId =
            normalizeText(
                body.employeeId,
            )

        if (!employeeId) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "employeeId wajib diisi.",
                },
                { status: 400 },
            )
        }

        const employeeRef =
            adminDb
                .collection(
                    "employees",
                )
                .doc(employeeId)

        const employeeSnapshot =
            await employeeRef.get()

        if (
            !employeeSnapshot.exists
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Karyawan tidak ditemukan.",
                },
                { status: 404 },
            )
        }

        const existing =
            employeeSnapshot.data()

        const storeId =
            normalizeText(
                existing?.storeId,
            ).toUpperCase()

        // =================================================
        // CEK AKSES STORE
        // =================================================

        if (
            !(
                await canAccessStore(
                    user,
                    storeId,
                )
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin mengubah karyawan tersebut.",
                },
                { status: 403 },
            )
        }

        const name =
            normalizeText(
                body.name ??
                    existing?.name,
            )

        const nik =
            normalizeNik(
                body.nik ??
                    existing?.nik,
            )

        const posisi =
            normalizeText(
                body.posisi ??
                    existing?.posisi,
            )

        const aktif =
            typeof body.aktif ===
            "boolean"
                ? body.aktif
                : existing?.aktif ===
                  true

        if (
            !name ||
            !nik ||
            !posisi
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Nama, NIK, dan posisi wajib diisi.",
                },
                { status: 400 },
            )
        }

        // =================================================
        // CEK NIK DUPLIKAT
        // =================================================

        const duplicateSnapshot =
            await adminDb
                .collection(
                    "employees",
                )
                .where(
                    "storeId",
                    "==",
                    storeId,
                )
                .where(
                    "nik",
                    "==",
                    nik,
                )
                .get()

        const duplicateExists =
            duplicateSnapshot.docs.some(
                (doc) =>
                    doc.id !==
                    employeeId,
            )

        if (
            duplicateExists
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        `NIK "${nik}" sudah digunakan oleh karyawan lain di Store tersebut.`,
                },
                { status: 409 },
            )
        }

        await employeeRef.update({
            name,
            nik,
            posisi,
            aktif,
            updatedAt:
                FieldValue.serverTimestamp(),
        })

        return NextResponse.json({
            success: true,
            message:
                "Data karyawan berhasil diperbarui.",
            employee: {
                id: employeeId,
                name,
                nik,
                posisi,
                storeId,
                cabangId:
                    existing?.cabangId ??
                    null,
                aktif,
            },
        })
    } catch (error: unknown) {
        console.error(
            "UPDATE EMPLOYEE ERROR:",
            error,
        )

        const authError =
            handleAuthError(
                error,
            )

        if (authError) {
            return authError
        }

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Gagal memperbarui karyawan.",
            },
            { status: 500 },
        )
    }
}

// =====================================================
// DELETE
//
// HANYA CENTRAL
// =====================================================

export async function DELETE(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(
                request,
            )

        // =================================================
        // STORE DILARANG HAPUS
        // =================================================

        if (
            !canManageEmployees(
                user,
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Akun Store hanya dapat melihat data karyawan. Anda tidak memiliki izin menghapus karyawan.",
                },
                { status: 403 },
            )
        }

        const body =
            await request.json()

        const employeeId =
            normalizeText(
                body.employeeId,
            )

        if (!employeeId) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "employeeId wajib diisi.",
                },
                { status: 400 },
            )
        }

        const employeeRef =
            adminDb
                .collection(
                    "employees",
                )
                .doc(employeeId)

        const employeeSnapshot =
            await employeeRef.get()

        if (
            !employeeSnapshot.exists
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Karyawan tidak ditemukan.",
                },
                { status: 404 },
            )
        }

        const employee =
            employeeSnapshot.data()

        const storeId =
            normalizeText(
                employee?.storeId,
            ).toUpperCase()

        // =================================================
        // CEK AKSES STORE
        // =================================================

        if (
            !(
                await canAccessStore(
                    user,
                    storeId,
                )
            )
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin menghapus karyawan tersebut.",
                },
                { status: 403 },
            )
        }

        await employeeRef.delete()

        return NextResponse.json({
            success: true,
            message:
                "Karyawan berhasil dihapus.",
        })
    } catch (error: unknown) {
        console.error(
            "DELETE EMPLOYEE ERROR:",
            error,
        )

        const authError =
            handleAuthError(
                error,
            )

        if (authError) {
            return authError
        }

        return NextResponse.json(
            {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Gagal menghapus karyawan.",
            },
            { status: 500 },
        )
    }
}