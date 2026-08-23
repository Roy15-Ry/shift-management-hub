"use client"

import * as React from "react"

type ModalType =
  | "central"
  | "store"
  | null

type ConfirmAction =
  | "toggle"
  | "delete"
  | null

type Account = {
  uid: string
  nama: string
  email: string
  role: string
  cabangId: string | null
  storeId?: string | null
  namaStore?: string | null
  aktif: boolean
}

type Branch = {
  cabangId: string
  nama?: string
  namaCabang?: string
  aktif?: boolean
}

export function ManajemenAkunPage() {
  const [modal, setModal] =
    React.useState<ModalType>(null)

  // =====================================================
  // KONFIRMASI AKSI AKUN
  // =====================================================

  const [confirmDialog, setConfirmDialog] =
    React.useState<{
      open: boolean
      action: ConfirmAction
      account: Account | null
      nextStatus?: boolean
    }>({
      open: false,
      action: null,
      account: null,
    })

  // =====================================================
  // FORM
  // =====================================================

  const [nama, setNama] =
    React.useState("")

  const [storeId, setStoreId] =
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
  const [toast, setToast] =
    React.useState<{
      type: "success" | "error"
      text: string
    } | null>(null)

  // =====================================================
  // USER LOGIN
  // =====================================================

  const [currentRole, setCurrentRole] =
    React.useState("")

  const [currentCabangId, setCurrentCabangId] =
    React.useState("")

  const [currentUid, setCurrentUid] =
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

      setCurrentUid(
        currentUser.uid,
      )

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
            cache: "no-store",
          },
        )

      if (!response.ok) {
        return
      }

      const data =
        await response.json()

      const users: Account[] =
        Array.isArray(
          data.users,
        )
          ? data.users
          : []

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

      setCurrentUid(
        currentUser.uid,
      )

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
            cache: "no-store",
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
        Array.isArray(
          data.users,
        )
          ? data.users
          : [],
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
            cache: "no-store",
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
        Array.isArray(
          data.branches,
        )
          ? data.branches
          : []

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
            ownBranch.nama ||
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
  // TOAST NOTIFICATION
  // =====================================================

  function showToast(
    type: "success" | "error",
    text: string,
  ) {
    setToast({
      type,
      text,
    })

    setTimeout(() => {
      setToast(null)
    }, 3000)
  }

  // =====================================================
  // RESET FORM
  // =====================================================

  function resetForm() {
    setNama("")
    setStoreId("")
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
          ownBranch.nama ||
          ownBranch.namaCabang ||
          ownBranch.cabangId,
        )
      }
    }

    setModal("store")
  }

  // =====================================================
  // HAK AKSES MENGELOLA AKUN
  // =====================================================

  function canManageAccount(
    account: Account,
  ): boolean {
    // Jangan pernah tampilkan aksi untuk
    // akun yang sedang login.
    if (
      account.uid ===
      currentUid
    ) {
      return false
    }

    // Central Pusat:
    // boleh mengelola Central Cabang
    // dan Store.
    if (
      currentRole ===
      "central_pusat"
    ) {
      return (
        account.role ===
        "central_cabang" ||
        account.role ===
        "store"
      )
    }

    // Central Cabang:
    // hanya boleh mengelola Store
    // di cabangnya sendiri.
    if (
      currentRole ===
      "central_cabang"
    ) {
      return (
        account.role ===
        "store" &&
        account.cabangId ===
        currentCabangId
      )
    }

    // Store tidak boleh mengelola akun.
    return false
  }

  // =====================================================
  // BUKA KONFIRMASI AKTIF / NONAKTIF
  // =====================================================

  function handleToggleAccount(
    account: Account,
  ) {
    if (
      !canManageAccount(
        account,
      )
    ) {
      return
    }

    const nextStatus =
      !account.aktif

    setConfirmDialog({
      open: true,
      action: "toggle",
      account,
      nextStatus,
    })
  }

  // =====================================================
  // BUKA KONFIRMASI HAPUS
  // =====================================================

  function handleDeleteAccount(
    account: Account,
  ) {
    if (
      !canManageAccount(
        account,
      )
    ) {
      return
    }

    setConfirmDialog({
      open: true,
      action: "delete",
      account,
    })
  }

  // =====================================================
  // TUTUP KONFIRMASI
  // =====================================================

  function closeConfirmDialog() {
    if (loading) return

    setConfirmDialog({
      open: false,
      action: null,
      account: null,
      nextStatus: undefined,
    })
  }

  // =====================================================
  // KONFIRMASI AKSI AKUN
  // =====================================================

  async function confirmAccountAction() {
    const account =
      confirmDialog.account

    if (
      !account ||
      !confirmDialog.action
    ) {
      return
    }

    setLoading(true)
    setMessage("")

    try {
      const user =
        await import("@/lib/auth")

      const currentUser =
        user.auth.currentUser

      if (!currentUser) {
        throw new Error(
          "Anda belum login.",
        )
      }

      const idToken =
        await currentUser.getIdToken()

      // =================================================
      // AKTIF / NONAKTIF
      // =================================================

      if (
        confirmDialog.action ===
        "toggle"
      ) {
        const nextStatus =
          confirmDialog.nextStatus ??
          !account.aktif

        const response =
          await fetch(
            "/api/admin/users",
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                uid:
                  account.uid,
                aktif:
                  nextStatus,
              }),
            },
          )

        const data =
          await response.json()

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Gagal mengubah status akun.",
          )
        }

        showToast(
          "success",
          data.message ||
          `Akun berhasil ${nextStatus
            ? "diaktifkan"
            : "dinonaktifkan"
          }.`,
        )

        closeConfirmDialog()

        await loadAccounts()

        return
      }

      // =================================================
      // HAPUS AKUN
      // =================================================

      if (
        confirmDialog.action ===
        "delete"
      ) {
        const response =
          await fetch(
            "/api/admin/users",
            {
              method: "DELETE",
              headers: {
                "Content-Type":
                  "application/json",
                Authorization:
                  `Bearer ${idToken}`,
              },
              body: JSON.stringify({
                uid:
                  account.uid,
              }),
            },
          )

        const data =
          await response.json()

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Gagal menghapus akun.",
          )
        }

        showToast(
          "success",
          data.message ||
          "Akun berhasil dihapus.",
        )

        closeConfirmDialog()

        await loadAccounts()
      }
    } catch (error) {

      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan.",
      )

    } finally {
      setLoading(false)
    }
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
      // VALIDASI STORE
      // =================================================

      if (!storeId.trim()) {
        setMessage(
          "ID Store wajib diisi.",
        )
        return
      }

      if (!nama.trim()) {
        setMessage(
          "Nama Store wajib diisi.",
        )
        return
      }

      if (!email.trim()) {
        setMessage(
          "Email wajib diisi.",
        )
        return
      }

      if (!password) {
        setMessage(
          "Password wajib diisi.",
        )
        return
      }

      if (
        password.length < 6
      ) {
        setMessage(
          "Password minimal 6 karakter.",
        )
        return
      }

      if (!cabangId) {
        setMessage(
          "Silakan pilih cabang.",
        )
        return
      }

      // =================================================
      // PENGAMAN CENTRAL CABANG
      // =================================================

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
              nama: nama.trim(),
              email:
                email
                  .trim()
                  .toLowerCase(),
              password,
              storeId:
                storeId
                  .trim()
                  .toUpperCase(),
              namaStore:
                nama.trim(),
              cabangId:
                cabangId
                  .trim()
                  .toUpperCase(),
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

  // =====================================================
  // NAMA AKUN
  // =====================================================

  function getAccountName(
    account: Account,
  ) {
    return (
      account.nama ||
      account.namaStore ||
      account.email
    )
  }

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="space-y-6">
      {/* =================================================
          TOAST NOTIFICATION
      ================================================= */}

      {toast && (
        <div
          className={`fixed right-5 top-5 z-[100] min-w-[300px] max-w-md rounded-xl border p-4 shadow-lg ${toast.type === "success"
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          <div className="flex items-start gap-3">
            <div className="text-lg">
              {toast.type === "success"
                ? "✓"
                : "⚠"}
            </div>

            <div className="flex-1">
              <p className="text-sm font-semibold">
                {toast.type === "success"
                  ? "Berhasil"
                  : "Terjadi Kesalahan"}
              </p>

              <p className="mt-1 text-sm">
                {toast.text}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setToast(null)
              }
              className="text-lg leading-none opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        </div>
      )}

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

        {currentRole ===
          "central_pusat" && (
            <button
              type="button"
              onClick={
                openCentralModal
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              + CENTRAL CABANG
            </button>
          )}

        {(currentRole ===
          "central_pusat" ||
          currentRole ===
          "central_cabang") && (
            <button
              type="button"
              onClick={
                openStoreModal
              }
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              + STORE
            </button>
          )}

      </div>

      {/* =================================================
          MESSAGE
      ================================================= */}

      {message && (
        <div className="rounded-lg border border-border bg-muted p-3 text-sm">
          {message}
        </div>
      )}

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
              loadingAccounts ||
              loading
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

            <table className="w-full min-w-[1000px] text-sm">

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

                  <th className="px-4 py-3 text-right font-semibold">
                    AKSI
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

                      {/* NAMA */}

                      <td className="px-4 py-3 font-medium">
                        {account.nama ||
                          account.namaStore ||
                          "-"}
                      </td>

                      {/* EMAIL */}

                      <td className="px-4 py-3">
                        {account.email ||
                          "-"}
                      </td>

                      {/* ROLE */}

                      <td className="px-4 py-3">
                        {account.role}
                      </td>

                      {/* CABANG */}

                      <td className="px-4 py-3">
                        {account.cabangId ||
                          "-"}
                      </td>

                      {/* STATUS */}

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

                      {/* AKSI */}

                      <td className="px-4 py-3">

                        {canManageAccount(
                          account,
                        ) ? (

                          <div className="flex items-center justify-end gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                handleToggleAccount(
                                  account,
                                )
                              }
                              disabled={
                                loading
                              }
                              className={
                                account.aktif
                                  ? "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  : "rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
                              }
                            >
                              {account.aktif
                                ? "NONAKTIFKAN"
                                : "AKTIFKAN"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteAccount(
                                  account,
                                )
                              }
                              disabled={
                                loading
                              }
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              HAPUS
                            </button>

                          </div>

                        ) : (

                          <div className="text-right text-xs text-muted-foreground">
                            -
                          </div>

                        )}

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
          MODAL KONFIRMASI AKTIF / NONAKTIF / HAPUS
      ================================================= */}

      {confirmDialog.open &&
        confirmDialog.account && (

          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">

            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">

              {/* HEADER */}

              <div className="border-b border-border p-5">

                <div className="flex items-start gap-3">

                  <div
                    className={
                      confirmDialog.action ===
                        "delete"
                        ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
                        : confirmDialog.account.aktif
                          ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
                          : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600"
                    }
                  >
                    {confirmDialog.action ===
                      "delete"
                      ? "!"
                      : confirmDialog.account.aktif
                        ? "!"
                        : "✓"}
                  </div>

                  <div>

                    <h2 className="text-lg font-semibold">
                      {confirmDialog.action ===
                        "delete"
                        ? "HAPUS AKUN?"
                        : confirmDialog.nextStatus
                          ? "AKTIFKAN AKUN?"
                          : "NONAKTIFKAN AKUN?"}
                    </h2>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {confirmDialog.action ===
                        "delete"
                        ? "Tindakan ini akan menghapus akun secara permanen."
                        : confirmDialog.nextStatus
                          ? "Akun akan dapat digunakan kembali untuk login."
                          : "Akun tidak akan dapat digunakan untuk login."}
                    </p>

                  </div>

                </div>

              </div>

              {/* CONTENT */}

              <div className="space-y-4 p-5">

                <div className="rounded-lg border border-border bg-muted/50 p-4">

                  <div className="text-xs font-medium text-muted-foreground">
                    AKUN
                  </div>

                  <div className="mt-1 font-semibold">
                    {getAccountName(
                      confirmDialog.account,
                    )}
                  </div>

                  <div className="mt-1 text-sm text-muted-foreground">
                    {confirmDialog.account.email}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">

                    <span className="rounded-full bg-background px-2 py-1 text-xs">
                      {confirmDialog.account.role}
                    </span>

                    {confirmDialog.account.cabangId && (
                      <span className="rounded-full bg-background px-2 py-1 text-xs">
                        {confirmDialog.account.cabangId}
                      </span>
                    )}

                  </div>

                </div>

                {confirmDialog.action ===
                  "delete" && (

                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">

                      <div className="font-semibold">
                        PERHATIAN
                      </div>

                      <p className="mt-1">
                        Akun akan dihapus dari Firebase Authentication dan profil users.
                      </p>

                      <p className="mt-1">
                        Data Store dan data operasional tidak akan dihapus.
                      </p>

                    </div>

                  )}

                <p className="text-sm text-muted-foreground">
                  {confirmDialog.action ===
                    "delete"
                    ? "Apakah Anda yakin ingin melanjutkan?"
                    : confirmDialog.nextStatus
                      ? "Apakah Anda yakin ingin mengaktifkan akun ini?"
                      : "Apakah Anda yakin ingin menonaktifkan akun ini?"}
                </p>

              </div>

              {/* BUTTON */}

              <div className="flex justify-end gap-3 border-t border-border p-5">

                <button
                  type="button"
                  onClick={
                    closeConfirmDialog
                  }
                  disabled={
                    loading
                  }
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  BATAL
                </button>

                <button
                  type="button"
                  onClick={
                    confirmAccountAction
                  }
                  disabled={
                    loading
                  }
                  className={
                    confirmDialog.action ===
                      "delete"
                      ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      : confirmDialog.nextStatus
                        ? "rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        : "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  }
                >
                  {loading
                    ? "MEMPROSES..."
                    : confirmDialog.action ===
                      "delete"
                      ? "HAPUS PERMANEN"
                      : confirmDialog.nextStatus
                        ? "AKTIFKAN"
                        : "NONAKTIFKAN"}
                </button>

              </div>

            </div>

          </div>

        )}

      {/* =================================================
          MODAL CENTRAL CABANG
      ================================================= */}

      {modal ===
        "central" && (

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
                  disabled={
                    loading
                  }
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

                {/* NAMA */}

                <div>

                  <label className="mb-1 block text-sm font-medium">
                    Nama Central Cabang
                  </label>

                  <input
                    type="text"
                    value={nama}
                    onChange={(
                      e,
                    ) =>
                      setNama(
                        e.target.value,
                      )
                    }
                    placeholder="Contoh: Ahmad"
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
                    onChange={(
                      e,
                    ) =>
                      setEmail(
                        e.target.value,
                      )
                    }
                    placeholder="central@contoh.com"
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
                    onChange={(
                      e,
                    ) =>
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

                {/* ID CABANG */}

                <div>

                  <label className="mb-1 block text-sm font-medium">
                    ID Cabang
                  </label>

                  <input
                    type="text"
                    value={
                      cabangId
                    }
                    onChange={(
                      e,
                    ) =>
                      setCabangId(
                        e.target.value.toUpperCase(),
                      )
                    }
                    placeholder="Contoh: CJR-01"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-primary"
                  />

                </div>

                {/* NAMA CABANG */}

                <div>

                  <label className="mb-1 block text-sm font-medium">
                    Nama Cabang
                  </label>

                  <input
                    type="text"
                    value={
                      namaCabang
                    }
                    onChange={(
                      e,
                    ) =>
                      setNamaCabang(
                        e.target.value,
                      )
                    }
                    placeholder="Contoh: CABANG CIANJUR"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />

                </div>

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
                      loading
                    }
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {loading
                      ? "MENYIMPAN..."
                      : "SIMPAN"}
                  </button>

                </div>

                {message && (
                  <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                    {message}
                  </div>
                )}

              </form>

            </div>

          </div>

        )}

      {/* =================================================
          MODAL STORE
      ================================================= */}

      {modal ===
        "store" && (

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
                  disabled={
                    loading
                  }
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

                {/* ID STORE */}

                <div>

                  <label className="mb-1 block text-sm font-medium">
                    ID Store
                  </label>

                  <input
                    type="text"
                    value={
                      storeId
                    }
                    onChange={(
                      e,
                    ) =>
                      setStoreId(
                        e.target.value.toUpperCase(),
                      )
                    }
                    placeholder="Contoh: CJR-01-STR-01"
                    required
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-primary"
                  />

                </div>

                {/* NAMA STORE */}

                <div>

                  <label className="mb-1 block text-sm font-medium">
                    Nama Store
                  </label>

                  <input
                    type="text"
                    value={nama}
                    onChange={(
                      e,
                    ) =>
                      setNama(
                        e.target.value,
                      )
                    }
                    placeholder="Contoh: STORE CIANJUR"
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
                    value={
                      email
                    }
                    onChange={(
                      e,
                    ) =>
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
                    onChange={(
                      e,
                    ) =>
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
                      onChange={(
                        e,
                      ) => {

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
                          selectedBranch?.nama ||
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
                        (
                          branch,
                        ) => (

                          <option
                            key={
                              branch.cabangId
                            }
                            value={
                              branch.cabangId
                            }
                          >
                            {
                              branch.cabangId
                            }

                            {(
                              branch.nama ||
                              branch.namaCabang
                            )
                              ? ` — ${branch.nama ||
                              branch.namaCabang
                              }`
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