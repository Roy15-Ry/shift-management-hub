"use client"

import * as React from "react"

import { useAuth } from "@/components/auth-context"
import { useToast } from "@/components/ui/toast"

type ProgramKey =
    | "targetPenjualan"
    | "monitoringError"
    | "kontribusiOmset"

type ProgramAccessState = {
    loading: boolean
    enabled: boolean
    error: string
}

export function useProgramAccess(
    storeId: string | null | undefined,
    program: ProgramKey,
): ProgramAccessState {
    const [state, setState] =
        React.useState<ProgramAccessState>({
            loading: true,
            enabled: true,
            error: "",
        })

    const requestIdRef =
        React.useRef(0)

    React.useEffect(() => {
        if (!storeId) {
            setState({
                loading: false,
                enabled: true,
                error: "",
            })
            return
        }

        let cancelled = false
        let currentSeq = 0

        async function load() {
            const seq = ++requestIdRef.current
            currentSeq = seq

            setState({
                loading: true,
                enabled: true,
                error: "",
            })

            try {
                const authModule =
                    await import("@/lib/auth")

                const currentUser =
                    authModule.auth.currentUser

                if (!currentUser) {
                    throw new Error(
                        "Anda belum login.",
                    )
                }

                const idToken =
                    await currentUser.getIdToken()

                const response =
                    await fetch(
                        `/api/admin/store-program-access?storeId=${encodeURIComponent(
                            storeId as string,
                        )}`,
                        {
                            method: "GET",
                            headers: {
                                Authorization:
                                    `Bearer ${idToken}`,
                            },
                            cache: "no-store",
                        },
                    )

                const data =
                    await response.json()

                if (cancelled || seq !== requestIdRef.current) {
                    return
                }

                if (!response.ok) {
                    throw new Error(
                        data.message ||
                            "Gagal mengambil pengaturan akses program.",
                    )
                }

                const enabled =
                    program === "targetPenjualan"
                        ? data.targetPenjualanEnabled !== false
                        : program === "monitoringError"
                          ? data.monitoringErrorEnabled !== false
                          : data.kontribusiOmsetEnabled !== false

                setState({
                    loading: false,
                    enabled,
                    error: "",
                })
            } catch (error) {
                if (cancelled || seq !== requestIdRef.current) {
                    return
                }

                setState({
                    loading: false,
                    enabled: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Gagal mengambil pengaturan akses program.",
                })
            }
        }

        load()

        function handleRefresh(event: Event) {
            const detail =
                (event as CustomEvent<{ storeId?: string }>)
                    .detail

            if (detail?.storeId === storeId) {
                load()
            }
        }

        if (typeof window !== "undefined") {
            window.addEventListener(
                "program-access-changed",
                handleRefresh,
            )
        }

        return () => {
            cancelled = true

            if (typeof window !== "undefined") {
                window.removeEventListener(
                    "program-access-changed",
                    handleRefresh,
                )
            }
        }
    }, [storeId, program])

    return state
}

export function ProgramLockedMessage() {
    return (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-base font-semibold">
                SAAT INI FITUR TIDAK BISA DI AKSES.
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
                FITUR SEDANG DALAM PERBAIKAN
            </p>
        </div>
    )
}

export function ProgramAccessGate({
    program,
    storeId,
    children,
}: {
    program: ProgramKey
    storeId?: string | null
    children: React.ReactNode
}) {
    const state =
        useProgramAccess(storeId, program)

    if (state.loading) {
        return (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Memuat pengaturan akses program...
            </div>
        )
    }

    if (state.error) {
        return (
            <div className="space-y-3">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    {state.error}
                </div>
            </div>
        )
    }

    if (!state.enabled) {
        return <ProgramLockedMessage />
    }

    return <>{children}</>
}