import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth"

import {
    doc,
    getDoc,
} from "firebase/firestore"

import { firebaseApp, db } from "@/lib/firebase"

// ============================================================
// FIREBASE AUTH
// ============================================================

export const auth = getAuth(firebaseApp)

// ============================================================
// USER PROFILE
// ============================================================

export async function getUserProfile(
    uid: string,
) {
    const userRef = doc(
        db,
        "users",
        uid,
    )

    const userSnap =
        await getDoc(userRef)

    if (!userSnap.exists()) {
        return null
    }

    return {
        id: userSnap.id,
        ...userSnap.data(),
    }
}

// ============================================================
// LOGIN USER
// ============================================================

export async function loginUser(
    email: string,
    password: string,
) {
    try {
        // =====================================================
        // LOGIN KE FIREBASE AUTHENTICATION
        // =====================================================

        const credential =
            await signInWithEmailAndPassword(
                auth,
                email,
                password,
            )

        // =====================================================
        // CEK PROFIL USER DI FIRESTORE
        // =====================================================

        const userProfile =
            await getUserProfile(
                credential.user.uid,
            )

        // =====================================================
        // PROFIL TIDAK DITEMUKAN
        // =====================================================

        if (!userProfile) {
            await signOut(auth)

            throw new Error(
                "USER_PROFILE_NOT_FOUND",
            )
        }

        // =====================================================
        // CEK STATUS AKUN
        // =====================================================

        if (
            userProfile.aktif === false
        ) {
            await signOut(auth)

            throw new Error(
                "ACCOUNT_DISABLED",
            )
        }

        // =====================================================
        // LOGIN BERHASIL
        // =====================================================

        return credential

    } catch (error: unknown) {
        console.error(
            "LOGIN ERROR:",
            error,
        )

        // =====================================================
        // FIREBASE AUTH:
        // AKUN DINONAKTIFKAN
        // =====================================================

        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code ===
                "auth/user-disabled"
        ) {
            throw new Error(
                "ACCOUNT_DISABLED",
            )
        }

        // =====================================================
        // ERROR YANG KITA BUAT SENDIRI
        // =====================================================

        if (
            error instanceof Error &&
            (
                error.message ===
                    "ACCOUNT_DISABLED" ||
                error.message ===
                    "USER_PROFILE_NOT_FOUND"
            )
        ) {
            throw error
        }

        // =====================================================
        // ERROR LOGIN LAINNYA
        // =====================================================

        throw error
    }
}

// ============================================================
// LOGOUT USER
// ============================================================

export async function logoutUser() {
    await signOut(auth)
}