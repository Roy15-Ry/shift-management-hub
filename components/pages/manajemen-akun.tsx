"use client"

import * as React from "react"

type ModalType =
  | "central"
  | "store"
  | null

type Account = {
  uid: string
  nama: string
  email: string
  role: string
  cabangId: string | null
  aktif: boolean
}

type Branch = {
  cabangId: string
  namaCabang?: string
  aktif?: boolean
}

export function ManajemenAkunPage() {
  const [modal, setModal] =
    React.useState<ModalType>(null)

  // =====================================================
  // FORM
  // =====================================================

  const [nama, setNama] =
    React.useState("")

  const [email, setEmail] =
    React.useState("")

  const [password, setPassword] =
    React.useState("")

  const [cabangId, setCabangId] =
    React.useState("")

  const [namaCabang, setNamaCabang] =
    React.useState("")

  const [loading, setLoading] =
    React.useState(false)

  const [message, setMessage] =
    React.useState("")

  // =====================================================
  // USER LOGIN
  // =====================================================

  const [currentRole, setCurrentRole] =
    React.useState("")

  const [currentCabangId, setCurrentCabangId] =
    React.useState("")

  // =====================================================
  // DAFTAR AKUN
  // =====================================================

  const [accounts, setAccounts] =
    React.useState<Account[]>([])

  const [loadingAccounts, setLoadingAccounts] =
    React.useState(false)

  const [accountError, setAccountError] =
    React.useState("")

  // =====================================================
  // DAFTAR CABANG
  // =====================================================

  const [branches, setBranches] =
    React.useState<Branch[]>([])

  const [loadingBranches, setLoadingBranches] =
    React.useState(false)

  const [branchError, setBranchError] =
    React.useState("")

  // =====================================================
  // AMBIL USER LOGIN
  // =====================================================

  async function loadCurrentUser() {
    try {
      const user =
        await import("@/lib/auth")

      const currentUser =
        user.auth.currentUser

      if (!currentUser) {
        return
      }

      const idToken =
        await currentUser.getIdToken()

      const response =
        await fetch(
          "/api/admin/users",
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${idToken}`,
            },
          },
        )

      if (!response.ok) {
        return
      }

      const data =
        await response.json()

      const users: Account[] =
        data.users || []

      const loggedInUser =
        users.find(
          (account) =>
            account.uid ===
            currentUser.uid,
        )

      if (loggedInUser) {
        setCurrentRole(
          loggedInUser.role,
        )

        setCurrentCabangId(
          loggedInUser.cabangId || "",
        )
      }
    } catch {
      // Tidak perlu menampilkan error di sini.
    }
  }

  // =====================================================
  // AMBIL DAFTAR AKUN
  // =====================================================

  async function loadAccounts() {
    setLoadingAccounts(true)
    setAccountError("")

    try {
      const user =
        await import("@/lib/auth")

      const currentUser =
        user.auth.currentUser

      if (!currentUser) {
        setAccountError(
          "Anda belum login.",
        )
        return
      }

      const idToken =
        await currentUser.getIdToken()

      const response =
        await fetch(
          "/api/admin/users",
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
            "Gagal mengambil daftar akun.",
        )
      }

      setAccounts(
        data.users || [],
      )
    } catch (error) {
      setAccountError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil daftar akun.",
      )
    } finally {
      setLoadingAccounts(false)
    }
  }

  // =====================================================
  // AMBIL DAFTAR CABANG
  // =====================================================

  async function loadBranches() {
    setLoadingBranches(true)
    setBranchError("")

    try {
      const user =
        await import("@/lib/auth")

      const currentUser =
        user.auth.currentUser

      if (!currentUser) {
        setBranchError(
          "Anda belum login.",
        )
        return
      }

      const idToken =
        await currentUser.getIdToken()

      const response =
        await fetch(
          "/api/admin/branches",
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
            "Gagal mengambil data cabang.",
        )
      }

      const branchList: Branch[] =
        data.branches || []

      setBranches(branchList)

      // =================================================
      // CENTRAL CABANG
      // OTOMATIS MENGGUNAKAN CABANG SENDIRI
      // =================================================

      if (
        currentRole ===
        "central_cabang"
      ) {
        const ownBranch =
          branchList.find(
            (branch) =>
              branch.cabangId ===
              currentCabangId,
          )

        if (ownBranch) {
          setCabangId(
            ownBranch.cabangId,
          )

          setNamaCabang(
            ownBranch.namaCabang ||
              ownBranch.cabangId,
          )
        }
      }
    } catch (error) {
      setBranchError(
        error instanceof Error
          ? error.message
          : "Gagal mengambil data cabang.",
      )
    } finally {
      setLoadingBranches(false)
    }
  }

  // =====================================================
  // LOAD SAAT HALAMAN DIBUKA
  // =====================================================

  React.useEffect(() => {
    loadCurrentUser()
    loadAccounts()
  }, [])

  // =====================================================
  // LOAD CABANG SETELAH ROLE DIKETAHUI
  // =====================================================

  React.useEffect(() => {
    if (currentRole) {
      loadBranches()
    }
  }, [
    currentRole,
    currentCabangId,
  ])

  // =====================================================
  // RESET FORM
  // =====================================================

  function resetForm() {
    setNama("")
    setEmail("")
    setPassword("")
    setCabangId("")
    setNamaCabang("")
    setMessage("")
    setBranchError("")
  }

  // =====================================================
  // TUTUP MODAL
  // =====================================================

  function closeModal() {
    if (loading) return

    setModal(null)
    resetForm()
  }

  // =====================================================
  // BUKA MODAL CENTRAL
  // =====================================================

  function openCentralModal() {
    resetForm()
    setModal("central")
  }

  // =====================================================
  // BUKA MODAL STORE
  // =====================================================

  function openStoreModal() {
    resetForm()

    // Central Cabang langsung menggunakan
    // cabangnya sendiri.
    if (
      currentRole ===
      "central_cabang"
    ) {
      setCabangId(
        currentCabangId,
      )

      const ownBranch =
        branches.find(
          (branch) =>
            branch.cabangId ===
            currentCabangId,
        )

      if (ownBranch) {
        setNamaCabang(
          ownBranch.namaCabang ||
            ownBranch.cabangId,
        )
      }
    }

    setModal("store")
  }

  // =====================================================
  // BUAT CENTRAL CABANG
  // =====================================================

  async function handleCreateCentral(
    event: React.FormEvent,
  ) {
    event.preventDefault()

    setLoading(true)
    setMessage("")

    try {
      const user =
        await import("@/lib/auth")

      const currentUser =
        user.auth.currentUser

      if (!currentUser) {
        setMessage(
          "Anda belum login.",
        )
        return
      }

      const idToken =
        await currentUser.getIdToken()

      const response =
        await fetch(
          "/api/admin/create-central",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              nama,
              email,
              password,
              cabangId,
              namaCabang,
            }),
          },
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Gagal membuat Central Cabang.",
        )
      }

      setMessage(
        "Central Cabang berhasil dibuat.",
      )

      await loadAccounts()
      await loadBranches()

      setTimeout(() => {
        closeModal()
      }, 1000)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan.",
      )
    } finally {
      setLoading(false)
    }
  }

  // =====================================================
  // BUAT STORE
  // =====================================================

  async function handleCreateStore(
    event: React.FormEvent,
  ) {
    event.preventDefault()

    setLoading(true)
    setMessage("")

    try {
      const user =
        await import("@/lib/auth")

      const currentUser =
        user.auth.currentUser

      if (!currentUser) {
        setMessage(
          "Anda belum login.",
        )
        return
      }

      // =================================================
      // PENGAMAN TAMBAHAN
      // =================================================

      if (!cabangId) {
        setMessage(
          "Silakan pilih cabang.",
        )
        return
      }

      if (
        currentRole ===
          "central_cabang" &&
        cabangId !==
          currentCabangId
      ) {
        setMessage(
          "Anda hanya dapat membuat Store untuk cabang sendiri.",
        )
        return
      }

      const idToken =
        await currentUser.getIdToken()

      const response =
        await fetch(
          "/api/admin/create-store",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              nama,
              email,
              password,
              cabangId,
            }),
          },
        )

      const data =
        await response.json()

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Gagal membuat akun Store.",
        )
      }

      setMessage(
        "Akun Store berhasil dibuat.",
      )

      await loadAccounts()

      setTimeout(() => {
        closeModal()
      }, 1000)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* =================================================
          HEADER
      ================================================= */}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          MANAJEMEN AKUN
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Kelola akun Central Cabang dan Store.
        </p>
      </div>

      {/* =================================================
          TOMBOL
      ================================================= */}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={
            openCentralModal
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          + CENTRAL CABANG
        </button>

        <button
          type="button"
          onClick={
            openStoreModal
          }
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          + STORE
        </button>
      </div>

      {/* =================================================
          DAFTAR AKUN
      ================================================= */}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="font-semibold">
            DAFTAR AKUN
          </h2>

          <button
            type="button"
            onClick={
              loadAccounts
            }
            disabled={
              loadingAccounts
            }
            className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {loadingAccounts
              ? "MEMUAT..."
              : "REFRESH"}
          </button>
        </div>

        {loadingAccounts ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Memuat daftar akun...
          </div>
        ) : accountError ? (
          <div className="p-6 text-center text-sm text-red-500">
            {accountError}
          </div>
        ) : accounts.length ===
          0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Belum ada data akun.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-semibold">
                    NAMA
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    EMAIL
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    ROLE
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    CABANG
                  </th>

                  <th className="px-4 py-3 font-semibold">
                    STATUS
                  </th>
                </tr>
              </thead>

              <tbody>
                {accounts.map(
                  (account) => (
                    <tr
                      key={
                        account.uid
                      }
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-3 font-medium">
                        {account.nama ||
                          "-"}
                      </td>

                      <td className="px-4 py-3">
                        {account.email ||
                          "-"}
                      </td>

                      <td className="px-4 py-3">
                        {account.role}
                      </td>

                      <td className="px-4 py-3">
                        {account.cabangId ||
                          "-"}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            account.aktif
                              ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700"
                              : "rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700"
                          }
                        >
                          {account.aktif
                            ? "AKTIF"
                            : "NONAKTIF"}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =================================================
          MODAL CENTRAL CABANG
      ================================================= */}

      {modal === "central" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">

            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold">
                  TAMBAH CENTRAL CABANG
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Membuat akun Central Cabang sekaligus membuat data cabang.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeModal
                }
                disabled={loading}
                className="rounded-md px-2 py-1 text-lg hover:bg-muted"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                handleCreateCentral
              }
              className="space-y-4 p-5"
            >

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Nama Central Cabang
                </label>

                <input
                  type="text"
                  value={nama}
                  onChange={(e) =>
                    setNama(
                      e.target.value,
                    )
                  }
                  placeholder="Contoh: Ahmad"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Email
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value,
                    )
                  }
                  placeholder="central@contoh.com"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Password
                </label>

                <input
                  type="password"
                  value={
                    password
                  }
                  onChange={(e) =>
                    setPassword(
                      e.target.value,
                    )
                  }
                  placeholder="Minimal 6 karakter"
                  minLength={6}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  ID Cabang
                </label>

                <input
                  type="text"
                  value={
                    cabangId
                  }
                  onChange={(e) =>
                    setCabangId(
                      e.target.value.toUpperCase(),
                    )
                  }
                  placeholder="Contoh: CJR-01"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Nama Cabang
                </label>

                <input
                  type="text"
                  value={
                    namaCabang
                  }
                  onChange={(e) =>
                    setNamaCabang(
                      e.target.value,
                    )
                  }
                  placeholder="Contoh: CABANG CIANJUR"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {message && (
                <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                  {message}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    loading
                  }
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  BATAL
                </button>

                <button
                  type="submit"
                  disabled={
                    loading
                  }
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {loading
                    ? "MENYIMPAN..."
                    : "SIMPAN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================
          MODAL STORE
      ================================================= */}

      {modal === "store" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">

            {/* HEADER */}

            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-lg font-semibold">
                  TAMBAH STORE
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Membuat akun Store untuk cabang yang dipilih.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeModal
                }
                disabled={loading}
                className="rounded-md px-2 py-1 text-lg hover:bg-muted"
              >
                ×
              </button>
            </div>

            {/* FORM */}

            <form
              onSubmit={
                handleCreateStore
              }
              className="space-y-4 p-5"
            >

              {/* NAMA STORE */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Nama Store
                </label>

                <input
                  type="text"
                  value={nama}
                  onChange={(e) =>
                    setNama(
                      e.target.value,
                    )
                  }
                  placeholder="Contoh: STORE PAKUAN"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* EMAIL */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Email
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value,
                    )
                  }
                  placeholder="store@contoh.com"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* PASSWORD */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Password
                </label>

                <input
                  type="password"
                  value={
                    password
                  }
                  onChange={(e) =>
                    setPassword(
                      e.target.value,
                    )
                  }
                  placeholder="Minimal 6 karakter"
                  minLength={6}
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* CABANG */}

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Cabang
                </label>

                {currentRole ===
                "central_cabang" ? (
                  <input
                    type="text"
                    value={
                      namaCabang ||
                      currentCabangId
                    }
                    disabled
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                  />
                ) : (
                  <select
                    value={
                      cabangId
                    }
                    onChange={(e) => {
                      const selectedId =
                        e.target.value

                      setCabangId(
                        selectedId,
                      )

                      const selectedBranch =
                        branches.find(
                          (
                            branch,
                          ) =>
                            branch.cabangId ===
                            selectedId,
                        )

                      setNamaCabang(
                        selectedBranch?.namaCabang ||
                          "",
                      )
                    }}
                    required
                    disabled={
                      loadingBranches
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">
                      {loadingBranches
                        ? "MEMUAT CABANG..."
                        : "PILIH CABANG"}
                    </option>

                    {branches.map(
                      (branch) => (
                        <option
                          key={
                            branch.cabangId
                          }
                          value={
                            branch.cabangId
                          }
                        >
                          {branch.cabangId}
                          {branch.namaCabang
                            ? ` — ${branch.namaCabang}`
                            : ""}
                        </option>
                      ),
                    )}
                  </select>
                )}
              </div>

              {/* ERROR CABANG */}

              {branchError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  {branchError}
                </div>
              )}

              {/* MESSAGE */}

              {message && (
                <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                  {message}
                </div>
              )}

              {/* BUTTON */}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    loading
                  }
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  BATAL
                </button>

                <button
                  type="submit"
                  disabled={
                    loading ||
                    loadingBranches
                  }
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {loading
                    ? "MENYIMPAN..."
                    : "SIMPAN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}