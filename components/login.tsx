"use client"

import * as React from "react"
import { loginUser } from "@/lib/auth"

export function LoginPage() {
    const [email, setEmail] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState("")

    async function handleSubmit(
        event: React.FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault()

        setError("")
        setLoading(true)

        try {
            await loginUser(email, password)
        } catch (error: unknown) {
            console.error(error)

            setError(
                "Email atau password salah.",
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="flex min-h-svh items-center justify-center bg-background p-4">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-bold">
                        SHIFT MANAGEMENT HUB
                    </h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        Silakan masuk ke akun Anda
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="space-y-4"
                >
                    <div>
                        <label
                            htmlFor="email"
                            className="mb-1 block text-sm font-medium"
                        >
                            Email
                        </label>

                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            placeholder="nama@email.com"
                            required
                            className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="password"
                            className="mb-1 block text-sm font-medium"
                        >
                            Password
                        </label>

                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            placeholder="Masukkan password"
                            required
                            className="w-full rounded-lg border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-opacity disabled:opacity-50"
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