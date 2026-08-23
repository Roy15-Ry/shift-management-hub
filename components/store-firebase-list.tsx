"use client"

import * as React from "react"
import { Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/controls"
import { cn } from "@/lib/utils"

type FirebaseStore = {
    storeId: string
    namaStore: string
    cabangId: string | null
    aktif: boolean
}

type StoreFirebaseListProps = {
    onSelect?: (storeId: string) => void
}

export function StoreFirebaseList({
    onSelect,
}: StoreFirebaseListProps) {
    const [stores, setStores] =
        React.useState<FirebaseStore[]>([])

    const [loading, setLoading] =
        React.useState(true)

    const [error, setError] =
        React.useState("")

    async function loadStores() {
        setLoading(true)
        setError("")

        try {
            const authModule =
                await import("@/lib/auth")

            const currentUser =
                authModule.auth.currentUser

            if (!currentUser) {
                setError(
                    "Anda belum login.",
                )
                return
            }

            const idToken =
                await currentUser.getIdToken()

            const response =
                await fetch(
                    "/api/admin/stores",
                    {
                        method: "GET",
                        headers: {
                            Authorization:
                                `Bearer ${idToken}`,
                        },
                    },
                )

            const data =
                await response.json()

            if (!response.ok) {
                throw new Error(
                    data.message ||
                    "Gagal mengambil data Store.",
                )
            }

            setStores(
                Array.isArray(
                    data.stores,
                )
                    ? data.stores
                    : [],
            )
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Gagal mengambil data Store.",
            )
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        loadStores()
    }, [])

    return (
        <div className="space-y-4">
            {/* HEADER */}

            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">
                        Store Firebase
                    </h2>

                    <p className="text-sm text-muted-foreground">
                        Data Store yang tersimpan di Firestore.
                    </p>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    onClick={loadStores}
                    disabled={loading}
                >
                    {loading
                        ? "MEMUAT..."
                        : "REFRESH"}
                </Button>
            </div>

            {/* ERROR */}

            {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}

            {/* TABLE */}

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] text-sm">
                        <thead>
                            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                <th className="px-4 py-3 font-medium">
                                    Nama Store
                                </th>

                                <th className="px-4 py-3 font-medium">
                                    ID STORE
                                </th>

                                <th className="px-4 py-3 font-medium">
                                    CABANG
                                </th>

                                <th className="px-4 py-3 font-medium">
                                    STATUS
                                </th>

                                <th className="px-4 py-3 text-right font-medium">
                                    ACTION
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                                    >
                                        Memuat data Store...
                                    </td>
                                </tr>
                            ) : stores.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="px-4 py-10"
                                    >
                                        <EmptyState
                                            title="Belum ada Store"
                                            description="Belum ada data Store yang dapat ditampilkan."
                                        />
                                    </td>
                                </tr>
                            ) : (
                                stores.map(
                                    (store) => (
                                        <tr
                                            key={
                                                store.storeId
                                            }
                                            className="border-b border-border/60 last:border-0 hover:bg-muted/30"
                                        >
                                            <td className="px-4 py-3 font-medium">
                                                {store.namaStore ||
                                                    "-"}
                                            </td>

                                            <td className="px-4 py-3">
                                                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                                    {store.storeId}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3 text-muted-foreground">
                                                {store.cabangId ||
                                                    "-"}
                                            </td>

                                            <td className="px-4 py-3">
                                                <span
                                                    className={cn(
                                                        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
                                                        store.aktif
                                                            ? "bg-status-cuti-bg text-status-cuti"
                                                            : "bg-muted text-muted-foreground",
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "size-1.5 rounded-full",
                                                            store.aktif
                                                                ? "bg-status-cuti"
                                                                : "bg-muted-foreground/50",
                                                        )}
                                                    />

                                                    {store.aktif
                                                        ? "Aktif"
                                                        : "Nonaktif"}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            onSelect?.(
                                                                store.storeId,
                                                            )
                                                        }
                                                    >
                                                        <Eye />
                                                        Detail
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ),
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}