"use client"

import * as React from "react"
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastType = "success" | "error" | "info"

type ToastData = {
    id: number
    type: ToastType
    title: string
    message?: string
}

type ToastContextType = {
    showToast: (
        type: ToastType,
        title: string,
        message?: string,
    ) => void
}

const ToastContext =
    React.createContext<ToastContextType | null>(null)

export function ToastProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const [toasts, setToasts] =
        React.useState<ToastData[]>([])

    function showToast(
        type: ToastType,
        title: string,
        message?: string,
    ) {
        const id = Date.now() + Math.random()

        setToasts((current) => [
            ...current,
            {
                id,
                type,
                title,
                message,
            },
        ])

        window.setTimeout(() => {
            setToasts((current) =>
                current.filter(
                    (toast) => toast.id !== id,
                ),
            )
        }, 4000)
    }

    function removeToast(id: number) {
        setToasts((current) =>
            current.filter(
                (toast) => toast.id !== id,
            ),
        )
    }

    return (
        <ToastContext.Provider
            value={{
                showToast,
            }}
        >
            {children}

            <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
                {toasts.map((toast) => {
                    const isSuccess =
                        toast.type === "success"

                    const isError =
                        toast.type === "error"

                    return (
                        <div
                            key={toast.id}
                            className={cn(
                                "pointer-events-auto relative overflow-hidden rounded-xl border bg-card p-4 shadow-lg",
                                "animate-in fade-in slide-in-from-right-5",
                                isSuccess &&
                                    "border-status-cuti/30",
                                isError &&
                                    "border-destructive/30",
                                !isSuccess &&
                                    !isError &&
                                    "border-border",
                            )}
                        >
                            <div className="flex gap-3">
                                <div className="mt-0.5 shrink-0">
                                    {isSuccess ? (
                                        <CheckCircle2 className="size-5 text-status-cuti" />
                                    ) : isError ? (
                                        <CircleAlert className="size-5 text-destructive" />
                                    ) : (
                                        <Info className="size-5 text-primary" />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1 pr-5">
                                    <p className="text-sm font-semibold">
                                        {toast.title}
                                    </p>

                                    {toast.message && (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {
                                                toast.message
                                            }
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        removeToast(
                                            toast.id,
                                        )
                                    }
                                    className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    aria-label="Tutup notifikasi"
                                >
                                    <X className="size-4" />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context =
        React.useContext(ToastContext)

    if (!context) {
        throw new Error(
            "useToast harus digunakan di dalam ToastProvider.",
        )
    }

    return context
}