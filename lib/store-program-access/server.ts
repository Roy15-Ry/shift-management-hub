import { adminDb } from "@/lib/firebase-admin"

import {
  PARFUM_PROGRAM_KEY,
  STORE_PROGRAM_ACCESS_COLLECTION,
  type ProgramKey,
} from "./constants"

import {
  createDefaultStoreProgramAccessConfig,
  getStoreProgramAccessDocId,
  isProgramEnabled,
  resolveStoreProgramAccessConfig,
} from "./config"

import type {
  StoreProgramAccessConfig,
  StoreProgramAccessReadResult,
} from "./types"

export async function readStoreProgramAccess(
  storeId: string,
): Promise<StoreProgramAccessReadResult> {
  const docId = getStoreProgramAccessDocId(storeId)

  const snapshot = await adminDb
    .collection(STORE_PROGRAM_ACCESS_COLLECTION)
    .doc(docId)
    .get()

  if (!snapshot.exists) {
    return {
      config:
        createDefaultStoreProgramAccessConfig(docId),
      source: "default",
    }
  }

  return {
    config: resolveStoreProgramAccessConfig(
      docId,
      snapshot.data(),
    ),
    source: "stored",
  }
}

export async function getStoreProgramAccessConfig(
  storeId: string,
): Promise<StoreProgramAccessConfig> {
  const result = await readStoreProgramAccess(storeId)

  return result.config
}

export async function isStoreProgramEnabled(
  storeId: string,
  program: ProgramKey,
): Promise<boolean> {
  const config =
    await getStoreProgramAccessConfig(storeId)

  return isProgramEnabled(config, program)
}

export async function isStoreParfumProgramEnabled(
  storeId: string,
): Promise<boolean> {
  return isStoreProgramEnabled(
    storeId,
    PARFUM_PROGRAM_KEY,
  )
}
