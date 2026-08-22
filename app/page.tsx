"use client"

import * as React from "react"
import { AppShell } from "@/components/app-shell"
import { LoginPage } from "@/components/login"
import {
  AuthProvider,
  useAuth,
} from "@/components/auth-context"

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Memuat aplikasi...
        </p>
      </main>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <AppShell />
}

export default function Page() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}