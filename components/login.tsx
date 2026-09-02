"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { loginUser } from "@/lib/auth"

export function LoginPage() {
    const emailRef = React.useRef<HTMLInputElement>(null)
    const passwordRef =
        React.useRef<HTMLInputElement>(null)
    const [showPassword, setShowPassword] =
        React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState("")

    async function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault()

        setError("")
        setLoading(true)

        const data = new FormData(event.currentTarget)
        const emailValue =
            (data.get("email") as string) ?? ""
        const passwordValue =
            (data.get("password") as string) ?? ""

        try {
            await loginUser(emailValue, passwordValue)
        } catch (error: unknown) {
            console.error(error)

            if (
                error instanceof Error &&
                error.message ===
                    "ACCOUNT_DISABLED"
            ) {
                setError(
                    "Akun Anda sedang dinonaktifkan. Silakan hubungi administrator.",
                )
            } else if (
                error instanceof Error &&
                error.message ===
                    "USER_PROFILE_NOT_FOUND"
            ) {
                setError(
                    "Profil akun tidak ditemukan. Silakan hubungi administrator.",
                )
            } else {
                setError(
                    "Email atau password salah.",
                )
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="login-page flex min-h-svh items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">

                {/* LOGO */}
                <div className="mb-5 flex justify-center">
                    <img
                        src="/logo.webp"
                        alt="SHIFT MANAGEMENT HUB"
                        className="h-24 w-auto object-contain"
                    />
                </div>

                {/* JUDUL */}
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold tracking-tight">
                        SHIFT MANAGEMENT HUB
                    </h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        Pusat Informasi dan Monitoring Jadwal Shift
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                >
                    {/* EMAIL */}
                    <div>
                        <label
                            htmlFor="email"
                            className="mb-1.5 block text-sm font-medium"
                        >
                            Email
                        </label>

                        <input
                            ref={emailRef}
                            id="email"
                            name="email"
                            type="email"
                            placeholder="nama@email.com"
                            autoComplete="email"
                            required
                            disabled={loading}
                            className="w-full rounded-lg border bg-background px-3 py-2.5 outline-none transition focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                        />
                    </div>

                    {/* PASSWORD */}
                    <div>
                        <label
                            htmlFor="password"
                            className="mb-1.5 block text-sm font-medium"
                        >
                            Password
                        </label>

                        <div className="relative">
                            <input
                                ref={passwordRef}
                                id="password"
                                name="password"
                                type={
                                    showPassword
                                        ? "text"
                                        : "password"
                                }
                                placeholder="Masukkan password"
                                autoComplete="new-password"
                                required
                                disabled={loading}
                                className="w-full rounded-lg border bg-background px-3 py-2.5 pr-11 outline-none transition focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    setShowPassword(
                                        (current) =>
                                            !current,
                                    )
                                }
                                disabled={loading}
                                aria-label={
                                    showPassword
                                        ? "Sembunyikan password"
                                        : "Tampilkan password"
                                }
                                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                            >
                                {showPassword ? (
                                    <EyeOff
                                        className="h-4 w-4"
                                    />
                                ) : (
                                    <Eye
                                        className="h-4 w-4"
                                    />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* ERROR */}
                    {error && (
                        <div
                            role="alert"
                            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
                        >
                            {error}
                        </div>
                    )}

                    {/* LOGIN BUTTON */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading
                            ? "Memproses..."
                            : "Masuk"}
                    </button>
                </form>
            </div>
        </main>
    )
}