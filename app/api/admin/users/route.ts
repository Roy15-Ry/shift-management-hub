import { NextResponse } from "next/server"

import {
  adminAuth,
  adminDb,
} from "@/lib/firebase-admin"

// =====================================================
// TYPES
// =====================================================

type CurrentUser = {
  uid: string
  role: string
  cabangId: string | null
}

type TargetUser = {
  uid: string
  nama: string
  email: string
  role: string
  cabangId: string | null
  storeId: string | null
  namaStore: string | null
  aktif: boolean
}

// =====================================================
// AMBIL USER YANG SEDANG LOGIN
// =====================================================

async function getCurrentUser(
  request: Request,
): Promise<CurrentUser> {
  const authorization =
    request.headers.get(
      "authorization",
    )

  if (
    !authorization ||
    !authorization.startsWith(
      "Bearer ",
    )
  ) {
    throw new Error(
      "AUTH_REQUIRED",
    )
  }

  const idToken =
    authorization.substring(7)

  const decodedToken =
    await adminAuth.verifyIdToken(
      idToken,
    )

  const uid =
    decodedToken.uid

  const userSnapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!userSnapshot.exists) {
    throw new Error(
      "USER_PROFILE_NOT_FOUND",
    )
  }

  const data =
    userSnapshot.data()

  return {
    uid,
    role:
      data?.role ?? "",
    cabangId:
      data?.cabangId ?? null,
  }
}

// =====================================================
// AMBIL TARGET USER
// =====================================================

async function getTargetUser(
  uid: string,
): Promise<TargetUser | null> {
  const snapshot =
    await adminDb
      .collection("users")
      .doc(uid)
      .get()

  if (!snapshot.exists) {
    return null
  }

  const data =
    snapshot.data()

  return {
    uid: snapshot.id,

    nama:
      data?.nama ?? "",

    email:
      data?.email ?? "",

    role:
      data?.role ?? "",

    cabangId:
      data?.cabangId ?? null,

    storeId:
      data?.storeId ?? null,

    namaStore:
      data?.namaStore ?? null,

    aktif:
      data?.aktif === true,
  }
}

// =====================================================
// CEK APAKAH ACTOR BOLEH MENGELOLA TARGET
// =====================================================

function canManageTarget(
  currentUser: CurrentUser,
  target: TargetUser,
): boolean {
  // Central Pusat
  if (
    currentUser.role ===
    "central_pusat"
  ) {
    // Tidak boleh mengelola
    // Central Pusat lain
    return (
      target.role ===
      "store" ||
      target.role ===
      "central_cabang"
    )
  }

  // Central Cabang
  if (
    currentUser.role ===
    "central_cabang"
  ) {
    // Hanya boleh mengelola Store
    // di cabangnya sendiri
    return (
      target.role === "store" &&
      target.cabangId ===
      currentUser.cabangId
    )
  }

  // Store tidak boleh
  return false
}

// =====================================================
// GET
// =====================================================

export async function GET(
  request: Request,
) {
  try {
    const currentUser =
      await getCurrentUser(
        request,
      )

    // =================================================
    // HANYA CENTRAL
    // =================================================

    if (
      currentUser.role !==
      "central_pusat" &&
      currentUser.role !==
      "central_cabang"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin melihat akun.",
        },
        {
          status: 403,
        },
      )
    }

    // =================================================
    // AMBIL USER
    // =================================================

    const snapshot =
      await adminDb
        .collection("users")
        .get()

    let users =
      snapshot.docs.map(
        (doc) => {
          const data =
            doc.data()

          return {
            uid: doc.id,

            nama:
              data?.nama ?? "",

            email:
              data?.email ?? "",

            role:
              data?.role ?? "",

            cabangId:
              data?.cabangId ??
              null,

            storeId:
              data?.storeId ??
              null,

            namaStore:
              data?.namaStore ??
              null,

            aktif:
              data?.aktif === true,
          }
        },
      )

    // =================================================
    // CENTRAL CABANG HANYA MELIHAT
    // AKUN DI CABANG SENDIRI
    // =================================================

    if (
      currentUser.role ===
      "central_cabang"
    ) {
      users =
        users.filter(
          (user) =>
            user.cabangId ===
            currentUser.cabangId,
        )
    }

    // =================================================
    // URUTKAN
    // =================================================

    users.sort(
      (a, b) =>
        a.nama.localeCompare(
          b.nama,
        ),
    )

    return NextResponse.json({
      success: true,
      users,
    })
  } catch (error: unknown) {
    console.error(
      "GET USERS ERROR:",
      error,
    )

    if (
      error instanceof Error &&
      error.message ===
      "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tidak terautentikasi.",
        },
        {
          status: 401,
        },
      )
    }

    if (
      error instanceof Error &&
      error.message ===
      "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Profil pengguna tidak ditemukan.",
        },
        {
          status: 403,
        },
      )
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengambil daftar akun.",
      },
      {
        status: 500,
      },
    )
  }
}

// =====================================================
// PATCH
// AKTIF / NONAKTIF
// =====================================================

export async function PATCH(
  request: Request,
) {
  try {
    const currentUser =
      await getCurrentUser(
        request,
      )

    // =================================================
    // HANYA CENTRAL
    // =================================================

    if (
      currentUser.role !==
      "central_pusat" &&
      currentUser.role !==
      "central_cabang"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin mengubah status akun.",
        },
        {
          status: 403,
        },
      )
    }

    const body =
      await request.json()

    const targetUid =
      String(
        body.uid ?? "",
      ).trim()

    const aktif =
      body.aktif === true

    if (!targetUid) {
      return NextResponse.json(
        {
          success: false,
          message:
            "UID akun wajib diisi.",
        },
        {
          status: 400,
        },
      )
    }

    // =================================================
    // TIDAK BOLEH MENGUBAH DIRI SENDIRI
    // =================================================

    if (
      targetUid ===
      currentUser.uid
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak dapat mengubah status akun sendiri.",
        },
        {
          status: 400,
        },
      )
    }

    const targetUser =
      await getTargetUser(
        targetUid,
      )

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun yang dituju tidak ditemukan.",
        },
        {
          status: 404,
        },
      )
    }

    // =================================================
    // CENTRAL PUSAT TIDAK BOLEH
    // DIUBAH DARI APLIKASI
    // =================================================

    if (
      targetUser.role ===
      "central_pusat"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Central Pusat hanya dapat dikelola melalui Firebase.",
        },
        {
          status: 403,
        },
      )
    }

    // =================================================
    // CEK HAK AKSES
    // =================================================

    if (
      !canManageTarget(
        currentUser,
        targetUser,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin mengubah akun tersebut.",
        },
        {
          status: 403,
        },
      )
    }

    // =================================================
    // UPDATE FIREBASE AUTH
    // =================================================

    await adminAuth.updateUser(
      targetUid,
      {
        disabled: !aktif,
      },
    )

    // =================================================
    // UPDATE FIRESTORE
    // =================================================

    await adminDb
      .collection("users")
      .doc(targetUid)
      .update({
        aktif,
      })

    return NextResponse.json({
      success: true,
      message:
        aktif
          ? "Akun berhasil diaktifkan."
          : "Akun berhasil dinonaktifkan.",
      aktif,
    })
  } catch (error: unknown) {
    console.error(
      "UPDATE USER STATUS ERROR:",
      error,
    )

    if (
      error instanceof Error &&
      error.message ===
      "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tidak terautentikasi.",
        },
        {
          status: 401,
        },
      )
    }

    if (
      error instanceof Error &&
      error.message ===
      "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Profil pengguna tidak ditemukan.",
        },
        {
          status: 403,
        },
      )
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal mengubah status akun.",
      },
      {
        status: 500,
      },
    )
  }
}

// =====================================================
// DELETE
// =====================================================

export async function DELETE(
  request: Request,
) {
  try {
    const currentUser =
      await getCurrentUser(
        request,
      )

    // =================================================
    // HANYA CENTRAL
    // =================================================

    if (
      currentUser.role !==
      "central_pusat" &&
      currentUser.role !==
      "central_cabang"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin menghapus akun.",
        },
        {
          status: 403,
        },
      )
    }

    const body =
      await request.json()

    const targetUid =
      String(
        body.uid ?? "",
      ).trim()

    if (!targetUid) {
      return NextResponse.json(
        {
          success: false,
          message:
            "UID akun wajib diisi.",
        },
        {
          status: 400,
        },
      )
    }

    // =================================================
    // TIDAK BOLEH HAPUS DIRI SENDIRI
    // =================================================

    if (
      targetUid ===
      currentUser.uid
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak dapat menghapus akun sendiri.",
        },
        {
          status: 400,
        },
      )
    }

    const targetUser =
      await getTargetUser(
        targetUid,
      )

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun yang dituju tidak ditemukan.",
        },
        {
          status: 404,
        },
      )
    }

    // =================================================
    // CENTRAL PUSAT TIDAK BOLEH
    // DIHAPUS DARI APLIKASI
    // =================================================

    if (
      targetUser.role ===
      "central_pusat"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Akun Central Pusat hanya dapat dihapus melalui Firebase.",
        },
        {
          status: 403,
        },
      )
    }

    // =================================================
    // CEK HAK AKSES
    // =================================================

    if (
      !canManageTarget(
        currentUser,
        targetUser,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Anda tidak memiliki izin menghapus akun tersebut.",
        },
        {
          status: 403,
        },
      )
    }

    // =================================================
    // HAPUS FIREBASE AUTH
    // =================================================

    await adminAuth.deleteUser(
      targetUid,
    )

    // =================================================
    // HAPUS PROFIL FIRESTORE
    // =================================================

    await adminDb
      .collection("users")
      .doc(targetUid)
      .delete()

    // =================================================
    // CATATAN
    //
    // Dokumen stores TIDAK DIHAPUS.
    // Data operasional Store tetap aman.
    // =================================================

    return NextResponse.json({
      success: true,
      message:
        "Akun berhasil dihapus.",
    })
  } catch (error: unknown) {
    console.error(
      "DELETE USER ERROR:",
      error,
    )

    if (
      error instanceof Error &&
      error.message ===
      "AUTH_REQUIRED"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tidak terautentikasi.",
        },
        {
          status: 401,
        },
      )
    }

    if (
      error instanceof Error &&
      error.message ===
      "USER_PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Profil pengguna tidak ditemukan.",
        },
        {
          status: 403,
        },
      )
    }

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal menghapus akun.",
      },
      {
        status: 500,
      },
    )
  }
}