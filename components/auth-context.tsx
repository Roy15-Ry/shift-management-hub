"use client"

import * as React from "react"
import {
    onAuthStateChanged,
    type User,
} from "firebase/auth"

import { auth, getUserProfile } from "@/lib/auth"

type UserProfile = {
    id: string
    nama?: string
    email?: string
    role?: string

    /*
     * ID CABANG
     *
     * Digunakan oleh CENTRAL CABANG
     * dan akun Store yang berada di cabang tersebut.
     */
    cabangId?: string

    /*
     * ID STORE
     *
     * Khusus akun STORE.
     *
     * Contoh:
     * STORE001
     */
    storeId?: string

    /*
     * Nama Store
     *
     * Contoh:
     * STORE CIANJUR
     */
    namaStore?: string

    aktif?: boolean
}

type AuthContextValue = {
    user: User | null
    profile: UserProfile | null
    loading: boolean
}

const AuthContext =
    React.createContext<AuthContextValue | null>(null)

export function AuthProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [user, setUser] =
        React.useState<User | null>(null)

    const [profile, setProfile] =
        React.useState<UserProfile | null>(null)

    const [loading, setLoading] =
        React.useState(true)

    React.useEffect(() => {
        const unsubscribe =
            onAuthStateChanged(
                auth,
                async (currentUser) => {
                    try {
                        setUser(currentUser)

                        if (currentUser) {
                            const userProfile =
                                await getUserProfile(
                                    currentUser.uid,
                                )

                            console.log("PROFILE LOGIN:", userProfile)

                            setProfile(
                                userProfile as
                                UserProfile | null,
                            )
                        } else {
                            setProfile(null)
                        }
                    } catch (error) {
                        console.error(
                            "Gagal mengambil profil user:",
                            error,
                        )

                        setProfile(null)
                    } finally {
                        setLoading(false)
                    }
                },
            )

        return unsubscribe
    }, [])

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                loading,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context =
        React.useContext(AuthContext)

    if (!context) {
        throw new Error(
            "useAuth must be used within AuthProvider",
        )
    }

    return context
}