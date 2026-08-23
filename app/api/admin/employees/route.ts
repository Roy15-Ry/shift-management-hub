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

function canAccessStore(
    user: CurrentUser,
    storeId: string,
): boolean {
    if (
        user.role === "central_pusat"
    ) {
        return true
    }

    if (
        user.role === "central_cabang"
    ) {
        return (
            Boolean(user.cabangId) &&
            storeId.startsWith(
                `${user.cabangId}-`,
            )
        )
    }

    if (user.role === "store") {
        return (
            user.storeId === storeId
        )
    }

    return false
}

async function getStoreData(
    storeId: string,
) {
    const storeSnapshot =
        await adminDb
            .collection("stores")
            .doc(storeId)
            .get()

    if (!storeSnapshot.exists) {
        return null
    }

    return storeSnapshot.data()
}

// =====================================================
// GET
// =====================================================

export async function GET(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(request)

        if (
            user.role !== "central_pusat" &&
            user.role !== "central_cabang" &&
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
            new URL(request.url)

        const requestedStoreId =
            normalizeText(
                url.searchParams.get(
                    "storeId",
                ),
            )

        const snapshot =
            await adminDb
                .collection("employees")
                .get()

        let employees =
            snapshot.docs.map(
                (doc) => {
                    const data =
                        doc.data()

                    return {
                        id: doc.id,
                        name:
                            data.name ?? "",
                        nik:
                            data.nik ?? "",
                        posisi:
                            data.posisi ?? "",
                        storeId:
                            data.storeId ?? "",
                        cabangId:
                            data.cabangId ?? "",
                        aktif:
                            data.aktif === true,
                    }
                },
            )

        // =================================================
        // FILTER BERDASARKAN ROLE
        // =================================================

        if (
            user.role === "store"
        ) {
            employees =
                employees.filter(
                    (employee) =>
                        employee.storeId ===
                        user.storeId,
                )
        }

        if (
            user.role === "central_cabang"
        ) {
            employees =
                employees.filter(
                    (employee) =>
                        employee.cabangId ===
                        user.cabangId,
                )
        }

        // =================================================
        // FILTER STORE TAMBAHAN
        // =================================================

        if (
            requestedStoreId
        ) {
            if (
                !canAccessStore(
                    user,
                    requestedStoreId,
                )
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Anda tidak memiliki izin mengakses Store tersebut.",
                    },
                    { status: 403 },
                )
            }

            employees =
                employees.filter(
                    (employee) =>
                        employee.storeId ===
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
// =====================================================

export async function POST(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(request)

        if (
            user.role !== "central_pusat" &&
            user.role !== "central_cabang" &&
            user.role !== "store"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin menambah karyawan.",
                },
                { status: 403 },
            )
        }

        const body =
            await request.json()

        const name =
            normalizeText(body.name)

        const nik =
            normalizeNik(body.nik)

        const posisi =
            normalizeText(body.posisi)

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

        if (
            !canAccessStore(
                user,
                storeId,
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
            storeData.aktif === false
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
        // CEK NIK DUPLIKAT DALAM STORE
        // =================================================

        const duplicateSnapshot =
            await adminDb
                .collection("employees")
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
        // BUAT ID KARYAWAN
        // =================================================

        const employeeRef =
            adminDb
                .collection("employees")
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
// =====================================================

export async function PATCH(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(request)

        if (
            user.role !== "central_pusat" &&
            user.role !== "central_cabang" &&
            user.role !== "store"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin mengubah karyawan.",
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
                .collection("employees")
                .doc(employeeId)

        const employeeSnapshot =
            await employeeRef.get()

        if (!employeeSnapshot.exists) {
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

        if (
            !canAccessStore(
                user,
                storeId,
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
                : existing?.aktif === true

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

        const duplicateSnapshot =
            await adminDb
                .collection("employees")
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
                    doc.id !== employeeId,
            )

        if (duplicateExists) {
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
// =====================================================

export async function DELETE(
    request: Request,
) {
    try {
        const user =
            await getCurrentUser(request)

        if (
            user.role !== "central_pusat" &&
            user.role !== "central_cabang" &&
            user.role !== "store"
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "Anda tidak memiliki izin menghapus karyawan.",
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
                .collection("employees")
                .doc(employeeId)

        const employeeSnapshot =
            await employeeRef.get()

        if (!employeeSnapshot.exists) {
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

        if (
            !canAccessStore(
                user,
                storeId,
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