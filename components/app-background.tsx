"use client"

import * as React from "react"

// ============================================================
// BACKGROUND WEBSITE — TANIA PERFUME
//
// Murni visual (client-side). Tidak menulis ke Firestore, tidak
// membuat API, tidak membuat collection. Background dipilih secara
// acak sekali per sesi login lalu disimpan di sessionStorage agar:
//   - setiap sesi/login dapat berbeda
//   - stabil selama satu sesi
//
// Jika gambar gagal dimuat, kembali ke gambar pertama yang
// tersedia tanpa crash.
// ============================================================

const BACKGROUNDS = [
  "/tania-bg-01.webp",
  "/tania-bg-02.webp",
  "/tania-bg-03.webp",
]

const STORAGE_KEY = "app-bg-index"

export function AppBackground() {
  React.useEffect(() => {
    const root = document.documentElement

    let storedIndex: string | null = null
    try {
      storedIndex = window.sessionStorage.getItem(STORAGE_KEY)
    } catch {
      storedIndex = null
    }

    // Pilih acak bila belum pernah dipilih pada sesi ini.
    const index =
      storedIndex !== null &&
      Number.isInteger(Number(storedIndex))
        ? Number(storedIndex) % BACKGROUNDS.length
        : Math.floor(Math.random() * BACKGROUNDS.length)

    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        String(index % BACKGROUNDS.length),
      )
    } catch {
      // Abaikan bila sessionStorage tidak tersedia.
    }

    const url = BACKGROUNDS[index % BACKGROUNDS.length]
    root.style.setProperty("--app-bg-image", `url("${url}")`)

    // Jika gambar gagal dimuat, gunakan fallback agar tidak blank.
    const probe = new Image()
    probe.onerror = () => {
      root.style.setProperty(
        "--app-bg-image",
        `url("${BACKGROUNDS[0]}")`,
      )
    }
    probe.src = url
  }, [])

  return null
}
