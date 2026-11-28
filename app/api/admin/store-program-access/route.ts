import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"

import { adminAuth, adminDb } from "@/lib/firebase-admin"
import {
  PROGRAM_KEYS,
  STORE_PROGRAM_ACCESS_COLLECTION,
  STORE_PROGRAM_ACCESS_HISTORY_COLLECTION,
} from "@/lib/store-program-access/constants"
import {
  createDefaultStoreProgramAccessConfig,
  getProgramAccessMap,
  getStoreProgramAccessDocId,
  resolveStoreProgramAccessConfig,
} from "@/lib/store-program-access/config"
import { readStoreProgramAccess } from "@/lib/store-program-access/server"
import type { ProgramAccessMap } from "@/lib/store-program-access/types"

type AuthenticatedUser = {
  uid: string
  role: string
  storeId: string
  cabangId: string
  nama: string
}

type StoreScope = {
  storeId: string
  cabangId: string
  aktif: boolean
}

function normalizeId(value: unknown): string {
  return String(value ?? "").trim()
}

function normalizeRole(value: unknown): string {
  return normalizeId(value).toLowerCase()
}

function sameId(left: unknown, right: unknown): boolean {
  const a = normalizeId(left).toUpperCase()
  const b = normalizeId(right).toUpperCase()

  return Boolean(a) && a === b
}

function isCentralRole(role: string): boolean {
  return (
    role === "central_pusat" ||
    role === "central_cabang"
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, message },
    { status: 400 },
  )
}

function forbidden(message = "Akses ditolak.") {
  return NextResponse.json(
    { success: false, message },
    { status: 403 },
  )
}

function toIsoString(value: unknown): string | null {
  if (typeof value === "string") {
    return value
  }

  if (!value || typeof value !== "object") {
    return null
  }

  const timestamp = value as {
    toDate?: () => Date
  }

  if (typeof timestamp.toDate !== "function") {
    return null
  }

  return timestamp.toDate().toISOString()
}

async function getAuthenticatedUser(
  request: Request,
): Promise<AuthenticatedUser> {
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
  const role = normalizeRole(data?.role)
  const aktif = data?.aktif === true

  if (!aktif || !role) {
    throw new Error("FORBIDDEN")
  }

  return {
    uid,
    role,
    storeId: normalizeId(data?.storeId),
    cabangId: normalizeId(data?.cabangId),
    nama: normalizeId(data?.nama ?? data?.email),
  }
}

async function getStoreScope(
  storeId: string,
): Promise<StoreScope | null> {
  const docId = getStoreProgramAccessDocId(storeId)

  const snapshot = await adminDb
    .collection("stores")
    .doc(docId)
    .get()

  if (!snapshot.exists) {
    return null
  }

  const data = snapshot.data() ?? {}

  return {
    storeId: docId,
    cabangId: normalizeId(data?.cabangId),
    aktif: data?.aktif !== false,
  }
}

function canReadStore(
  user: AuthenticatedUser,
  store: StoreScope,
): boolean {
  if (user.role === "central_pusat") {
    return true
  }

  if (user.role === "central_cabang") {
    return sameId(user.cabangId, store.cabangId)
  }

  if (user.role === "store") {
    return sameId(user.storeId, store.storeId)
  }

  return false
}

function canWriteStore(
  user: AuthenticatedUser,
  store: StoreScope,
): boolean {
  if (user.role === "central_pusat") {
    return true
  }

  if (user.role === "central_cabang") {
    return sameId(user.cabangId, store.cabangId)
  }

  return false
}

function errorResponse(error: unknown) {
  const code =
    error instanceof Error ? error.message : ""

  if (code === "AUTH_REQUIRED") {
    return NextResponse.json(
      {
        success: false,
        message: "Tidak terautentikasi.",
      },
      { status: 401 },
    )
  }

  if (
    code === "FORBIDDEN" ||
    code === "USER_PROFILE_NOT_FOUND"
  ) {
    return forbidden()
  }

  if (code === "STORE_ID_REQUIRED") {
    return badRequest("storeId wajib diisi.")
  }

  if (code === "VERSION_CONFLICT") {
    return NextResponse.json(
      {
        success: false,
        code: "VERSION_CONFLICT",
        message:
          "Pengaturan telah berubah. Muat ulang data sebelum menyimpan.",
      },
      { status: 409 },
    )
  }

  console.error(
    "STORE PROGRAM ACCESS ERROR:",
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

export async function GET(request: Request) {
  try {
    const user =
      await getAuthenticatedUser(request)

    if (
      user.role !== "store" &&
      !isCentralRole(user.role)
    ) {
      return forbidden(
        "Anda tidak memiliki izin membaca pengaturan akses program.",
      )
    }

    const url = new URL(request.url)

    const requestedStoreId =
      user.role === "store"
        ? user.storeId
        : url.searchParams.get("storeId") ?? ""

    if (user.role === "store" && !user.storeId) {
      return forbidden(
        "Akun Store belum memiliki data toko.",
      )
    }

    if (!requestedStoreId) {
      return badRequest("storeId wajib diisi.")
    }

    const storeId =
      getStoreProgramAccessDocId(requestedStoreId)

    const store = await getStoreScope(storeId)

    if (!store) {
      return badRequest("Toko tidak ditemukan.")
    }

    if (!canReadStore(user, store)) {
      return forbidden(
        "Anda tidak memiliki izin membaca pengaturan toko ini.",
      )
    }

    const result =
      await readStoreProgramAccess(storeId)
    const config = result.config

    return NextResponse.json({
      success: true,
      storeId,
      cabangId:
        config.cabangId || store.cabangId,
      targetPenjualanEnabled:
        config.targetPenjualanEnabled,
      monitoringErrorEnabled:
        config.monitoringErrorEnabled,
      kontribusiOmsetEnabled:
        config.kontribusiOmsetEnabled,
      version: config.version,
      updatedAt: toIsoString(config.updatedAt),
      updatedByUid: config.updatedByUid,
      updatedByName: config.updatedByName,
      updatedByRole: config.updatedByRole,
      source: result.source,
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const user =
      await getAuthenticatedUser(request)

    if (!isCentralRole(user.role)) {
      return forbidden(
        "Hanya Central Pusat dan Central Cabang yang dapat mengubah pengaturan akses program.",
      )
    }

    let body: Record<string, unknown>

    try {
      const parsed = await request.json()

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return badRequest("Body request tidak valid.")
      }

      body = parsed as Record<string, unknown>
    } catch {
      return badRequest("Body request tidak valid.")
    }

    const storeIdInput = normalizeId(body.storeId)

    if (!storeIdInput) {
      return badRequest("storeId wajib diisi.")
    }

    const storeId =
      getStoreProgramAccessDocId(storeIdInput)

    const targetPenjualanEnabled =
      body.targetPenjualanEnabled
    const monitoringErrorEnabled =
      body.monitoringErrorEnabled
    const kontribusiOmsetEnabled =
      body.kontribusiOmsetEnabled

    if (
      typeof targetPenjualanEnabled !== "boolean" ||
      typeof monitoringErrorEnabled !== "boolean" ||
      typeof kontribusiOmsetEnabled !== "boolean"
    ) {
      return badRequest(
        "Ketiga status program harus berupa boolean.",
      )
    }

    const version = body.version

    if (
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version < 0
    ) {
      return badRequest("Version tidak valid.")
    }

    const store = await getStoreScope(storeId)

    if (!store) {
      return badRequest("Toko tidak ditemukan.")
    }

    if (!store.aktif) {
      return badRequest("Toko sedang tidak aktif.")
    }

    if (!canWriteStore(user, store)) {
      return forbidden(
        "Anda hanya dapat mengubah pengaturan toko dalam cabang Anda.",
      )
    }

    const after: ProgramAccessMap = {
      targetPenjualan: targetPenjualanEnabled,
      monitoringError: monitoringErrorEnabled,
      kontribusiOmset: kontribusiOmsetEnabled,
    }

    const accessRef = adminDb
      .collection(STORE_PROGRAM_ACCESS_COLLECTION)
      .doc(storeId)

    const result = await adminDb.runTransaction(
      async (tx) => {
        const snapshot = await tx.get(accessRef)

        const beforeConfig = snapshot.exists
          ? resolveStoreProgramAccessConfig(
              storeId,
              snapshot.data(),
              store.cabangId,
            )
          : createDefaultStoreProgramAccessConfig(
              storeId,
              store.cabangId,
            )

        if (version !== beforeConfig.version) {
          throw new Error("VERSION_CONFLICT")
        }

        const before =
          getProgramAccessMap(beforeConfig)

        const changed = PROGRAM_KEYS.some(
          (key) => before[key] !== after[key],
        )

        if (!changed) {
          return {
            changed: false,
            version: beforeConfig.version,
            before,
            after,
          }
        }

        const nextVersion =
          beforeConfig.version + 1

        const flags = {
          targetPenjualanEnabled:
            after.targetPenjualan,
          monitoringErrorEnabled:
            after.monitoringError,
          kontribusiOmsetEnabled:
            after.kontribusiOmset,
        }

        const metadata = {
          version: nextVersion,
          updatedAt:
            FieldValue.serverTimestamp(),
          updatedByUid: user.uid,
          updatedByName: user.nama,
          updatedByRole: user.role,
        }

        if (snapshot.exists) {
          tx.update(accessRef, {
            ...flags,
            ...metadata,
          })
        } else {
          tx.set(accessRef, {
            storeId,
            cabangId: store.cabangId,
            ...flags,
            ...metadata,
          })
        }

        const historyRef = adminDb
          .collection(
            STORE_PROGRAM_ACCESS_HISTORY_COLLECTION,
          )
          .doc()

        tx.set(historyRef, {
          storeId,
          cabangId: store.cabangId,
          before,
          after,
          changedByUid: user.uid,
          changedByName: user.nama,
          changedByRole: user.role,
          changedAt:
            FieldValue.serverTimestamp(),
          version: nextVersion,
        })

        return {
          changed: true,
          version: nextVersion,
          before,
          after,
        }
      },
    )

    return NextResponse.json({
      success: true,
      changed: result.changed,
      storeId,
      cabangId: store.cabangId,
      targetPenjualanEnabled:
        result.after.targetPenjualan,
      monitoringErrorEnabled:
        result.after.monitoringError,
      kontribusiOmsetEnabled:
        result.after.kontribusiOmset,
      version: result.version,
      message: result.changed
        ? "Pengaturan akses program berhasil diperbarui."
        : "Tidak ada perubahan pengaturan akses program.",
    })
  } catch (error: unknown) {
    return errorResponse(error)
  }
}
