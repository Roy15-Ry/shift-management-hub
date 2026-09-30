import { NextResponse } from "next/server"
import {
  DocumentReference,
  FieldValue,
} from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"

// ============================================================
// MONITORING ERROR — UBAH / HAPUS 1 CATATAN
// ============================================================
//
// PATCH  -> mengubah isi satu catatan.
// DELETE -> menghapus (physical delete) satu catatan.
//
// Keduanya HANYA untuk role CENTRAL. Role Store bersifat
// read-only pada modul Catatan dan selalu ditolak di route ini.
//
// Target dokumen SELALU di dalam collection
// "monitoring_error_notes" melalui path [noteId]. Route ini
// TIDAK PERNAH menyentuh collection lain sebagai lokasi catatan:
//   - additional_selling_notes / additional_selling /
//     additional_selling_targets (Target Penjualan)
//   - monitoring_errors
//   - collection "notes" umum
//
// Ownership diverifikasi dua lapis:
//   1. Dokumen diambil dari collection Catatan Monitoring Error;
//      bila id tidak ada di sana, jawabannya 404 — bukan dokumen
//      dari collection lain.
//   2. storeId dokumen divalidasi ke master "stores", lalu
//      dicocokkan dengan cabang akun untuk Central Cabang.
//
// YANG TIDAK BISA DIUBAH: storeId, periode, sumber,
// dibuatOlehUid, dibuatOlehNama, createdAt. Periode note
// immutable, sehingga request ini TIDAK menerima periode baru.
//
// Id note dari client TIDAK pernah dipakai sebagai bukti akses:
// storeId untuk otorisasi SELALU diambil dari dokumen catatan.
//
// memakai update(), bukan set(): tidak ada upsert, tidak ada
// create tersembunyi. DELETE memakai delete(): hard delete, tanpa
// archive, soft delete, atau dokumen audit tambahan.
// ============================================================

const COLLECTION = "monitoring_error_notes"

const ISI_MAX = 2000

const CENTRAL_ROLES = ["central_cabang", "central_pusat"]

type NoteUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
  nama: string
}

// ============================================================
// AUTH
// ============================================================

async function getAuthenticatedUser(
  request: Request,
): Promise<NoteUser> {
  const authorization =
    request.headers.get("authorization")

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    throw new Error("AUTH_REQUIRED")
  }

  const idToken = authorization.substring(7)

  const decodedToken =
    await adminAuth.verifyIdToken(idToken)

  const uid = decodedToken.uid

  const userSnapshot = await adminDb
    .collection("users")
    .doc(uid)
    .get()

  if (!userSnapshot.exists) {
    throw new Error("USER_PROFILE_NOT_FOUND")
  }

  const data = userSnapshot.data() ?? {}

  const role = String(data?.role ?? "").trim()
  const storeId = String(data?.storeId ?? "").trim()
  const cabangId = String(data?.cabangId ?? "").trim()
  const nama = String(
    data?.nama ?? data?.email ?? "",
  ).trim()

  const aktif = data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return { uid, role, storeId, cabangId, nama }
}

// ============================================================
// UTILITAS
// ============================================================

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
}

function cleanString(
  value: unknown,
  max = 500,
): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().slice(0, max)
}

function isCentralRole(role: string): boolean {
  return CENTRAL_ROLES.includes(role.toLowerCase())
}

// ============================================================
// RESPONSE HELPER
// ============================================================

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && error.message
      ? error.message
      : ""

  if (code === "AUTH_REQUIRED") {
    return NextResponse.json(
      {
        success: false,
        message: "Anda harus login terlebih dahulu.",
      },
      { status: 401 },
    )
  }

  if (
    code === "FORBIDDEN" ||
    code === "USER_PROFILE_NOT_FOUND"
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "Akses ditolak.",
      },
      { status: 403 },
    )
  }

  console.error(
    "Gagal memproses Catatan Monitoring Error:",
    error,
  )

  return NextResponse.json(
    {
      success: false,
      message:
        "Kesalahan tidak terduga. Silakan coba lagi.",
    },
    { status: 500 },
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 400 },
  )
}

function forbidden(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 403 },
  )
}

function notFound(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 404 },
  )
}

// ============================================================
// MASTER STORES
// ============================================================

async function getStoreMaster(
  storeId: string,
): Promise<{
  found: boolean
  storeId: string
  cabangId: string
}> {
  const requested = cleanString(storeId, 100)

  if (!requested) {
    return { found: false, storeId: "", cabangId: "" }
  }

  const snapshot = await adminDb
    .collection("stores")
    .where("storeId", "==", requested)
    .limit(1)
    .get()

  const doc = snapshot.docs[0]
  const data = doc?.data() ?? null

  const canonicalStoreId = String(
    data?.storeId ?? doc?.id ?? "",
  ).trim()

  if (!data || !canonicalStoreId) {
    return { found: false, storeId: "", cabangId: "" }
  }

  return {
    found: true,
    storeId: canonicalStoreId,
    cabangId: normalize(data?.cabangId ?? ""),
  }
}

// ============================================================
// MUAT CATATAN + VERIFIKASI SCOPE
// ============================================================
//
// Satu lapis ownership check: dokumen dibaca dari collection
// monitoring_error_notes, lalu storeId-nya (BUKAN dari request)
// divalidasi ke master stores dan ke cabang akun.
async function loadScopedNote(
  noteId: string,
  user: NoteUser,
): Promise<
  | { docRef: DocumentReference; current: Record<string, unknown> }
  | { error: NextResponse }
> {
  const id = cleanString(noteId, 200)

  if (!id) {
    return {
      error: badRequest("Data tidak valid."),
    }
  }

  const docRef = adminDb
    .collection(COLLECTION)
    .doc(id)

  const docSnapshot = await docRef.get()

  if (!docSnapshot.exists) {
    return {
      error: notFound("Catatan tidak ditemukan."),
    }
  }

  const current = docSnapshot.data() ?? {}
  const noteStoreId = cleanString(current?.storeId, 100)

  if (!noteStoreId) {
    return {
      error: notFound("Catatan tidak ditemukan."),
    }
  }

  const master = await getStoreMaster(noteStoreId)

  if (!master.found) {
    return {
      error: notFound("Toko tidak ditemukan."),
    }
  }

  const role = user.role.toLowerCase()

  if (role === "central_cabang") {
    const ownCabang = normalize(user.cabangId)

    if (!ownCabang || master.cabangId !== ownCabang) {
      return {
        error: forbidden(
          "Anda hanya dapat mengelola Catatan pada toko dalam cabang Anda.",
        ),
      }
    }
  }

  return { docRef, current }
}

// ============================================================
// PATCH — UBAH ISI CATATAN
// ============================================================

export async function PATCH(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request)

    if (!isCentralRole(user.role)) {
      return forbidden(
        "Hanya akun Central yang dapat mengubah Catatan.",
      )
    }

    const { noteId } = await context.params

    const loaded = await loadScopedNote(noteId, user)

    if ("error" in loaded) {
      return loaded.error
    }

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<
        string,
        unknown
      >
    } catch {
      return badRequest("Body request tidak valid.")
    }

    // ----------------------------------------------------------
    // VALIDASI ISI
    // ----------------------------------------------------------
    //
    // Hanya "isi" yang dibaca. storeId, periode, sumber,
    // dibuatOlehUid, dibuatOlehNama, dan createdAt pada body
    // DIABAIKAN karena tidak masuk ke payload update.

    const rawIsi = body?.isi

    if (typeof rawIsi !== "string") {
      return badRequest("Catatan wajib diisi.")
    }

    if (rawIsi.length > ISI_MAX) {
      return badRequest(
        `Catatan maksimal ${ISI_MAX} karakter.`,
      )
    }

    const isi = rawIsi.trim()

    if (!isi) {
      return badRequest("Catatan wajib diisi.")
    }

    await loaded.docRef.update({
      isi,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      message: "Catatan berhasil diperbarui.",
    })
  } catch (error) {
    return errorResponse(error)
  }
}

// ============================================================
// DELETE — HAPUS CATATAN (PHYSICAL DELETE)
// ============================================================

export async function DELETE(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request)

    if (!isCentralRole(user.role)) {
      return forbidden(
        "Hanya akun Central yang dapat menghapus Catatan.",
      )
    }

    const { noteId } = await context.params

    const loaded = await loadScopedNote(noteId, user)

    if ("error" in loaded) {
      return loaded.error
    }

    await loaded.docRef.delete()

    return NextResponse.json({
      success: true,
      message: "Catatan berhasil dihapus.",
    })
  } catch (error) {
    return errorResponse(error)
  }
}
