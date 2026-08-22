import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    getAuth,
} from "firebase/auth"

import {
    doc,
    getDoc,
} from "firebase/firestore"

import { firebaseApp, db } from "@/lib/firebase"

export const auth = getAuth(firebaseApp)

export function registerUser(
    email: string,
    password: string,
) {
    return createUserWithEmailAndPassword(
        auth,
        email,
        password,
    )
}

export function loginUser(
    email: string,
    password: string,
) {
    return signInWithEmailAndPassword(
        auth,
        email,
        password,
    )
}

export function logoutUser() {
    return signOut(auth)
}

// ============================================================
// MENGAMBIL DATA USER DARI FIRESTORE
// ============================================================

export async function getUserProfile(
    uid: string,
) {
    const userRef = doc(
        db,
        "users",
        uid,
    )

    const snapshot = await getDoc(userRef)

    if (!snapshot.exists()) {
        return null
    }

    return {
        id: snapshot.id,
        ...snapshot.data(),
    }
}