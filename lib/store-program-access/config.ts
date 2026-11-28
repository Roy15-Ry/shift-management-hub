import {
  PARFUM_PROGRAM_KEY,
  PROGRAM_FIELD_BY_KEY,
  isProgramKey,
  type ProgramKey,
} from "./constants"

import type {
  ProgramAccessMap,
  ProgramAccessStatus,
  StoreProgramAccessConfig,
} from "./types"

const DEFAULT_PROGRAM_ACCESS: Readonly<ProgramAccessMap> =
  Object.freeze({
    targetPenjualan: true,
    monitoringError: true,
    kontribusiOmset: true,
  })

export function createDefaultProgramAccess(): ProgramAccessMap {
  return { ...DEFAULT_PROGRAM_ACCESS }
}

export function resolveProgramAccessFromDocument(
  data?: Record<string, unknown> | null,
): ProgramAccessMap {
  return {
    targetPenjualan:
      data?.targetPenjualanEnabled !== false,
    monitoringError:
      data?.monitoringErrorEnabled !== false,
    kontribusiOmset:
      data?.kontribusiOmsetEnabled !== false,
  }
}

export function getStoreProgramAccessDocId(
  storeId: string,
): string {
  const value = String(storeId ?? "").trim()

  if (!value) {
    throw new Error("STORE_ID_REQUIRED")
  }

  return value
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function readVersion(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : 0
}

function readCabangId(
  data: Record<string, unknown> | null | undefined,
  fallbackCabangId: string,
): string {
  const stored = readString(data?.cabangId).trim()

  return stored || fallbackCabangId.trim()
}

export function createDefaultStoreProgramAccessConfig(
  storeId: string,
  cabangId = "",
): StoreProgramAccessConfig {
  const docId = getStoreProgramAccessDocId(storeId)
  const access = createDefaultProgramAccess()

  return {
    storeId: docId,
    cabangId: readString(cabangId).trim(),
    targetPenjualanEnabled: access.targetPenjualan,
    monitoringErrorEnabled: access.monitoringError,
    kontribusiOmsetEnabled: access.kontribusiOmset,
    version: 0,
    updatedAt: null,
    updatedByUid: "",
    updatedByName: "",
    updatedByRole: "",
  }
}

export function resolveStoreProgramAccessConfig(
  storeId: string,
  data?: Record<string, unknown> | null,
  fallbackCabangId = "",
): StoreProgramAccessConfig {
  const docId = getStoreProgramAccessDocId(storeId)
  const access = resolveProgramAccessFromDocument(data)

  return {
    storeId: docId,
    cabangId: readCabangId(data, fallbackCabangId),
    targetPenjualanEnabled: access.targetPenjualan,
    monitoringErrorEnabled: access.monitoringError,
    kontribusiOmsetEnabled: access.kontribusiOmset,
    version: readVersion(data?.version),
    updatedAt: data?.updatedAt ?? null,
    updatedByUid: readString(data?.updatedByUid),
    updatedByName: readString(data?.updatedByName),
    updatedByRole: readString(data?.updatedByRole),
  }
}

export function getProgramAccessMap(
  config: StoreProgramAccessConfig,
): ProgramAccessMap {
  return {
    targetPenjualan:
      config.targetPenjualanEnabled !== false,
    monitoringError:
      config.monitoringErrorEnabled !== false,
    kontribusiOmset:
      config.kontribusiOmsetEnabled !== false,
  }
}

export function getProgramAccessStatus(
  config: StoreProgramAccessConfig,
  program: ProgramKey,
): ProgramAccessStatus {
  if (!isProgramKey(program)) {
    throw new Error("INVALID_PROGRAM_KEY")
  }

  const field = PROGRAM_FIELD_BY_KEY[program]

  return config[field] === false
    ? "disabled"
    : "enabled"
}

export function isProgramEnabled(
  config: StoreProgramAccessConfig,
  program: ProgramKey,
): boolean {
  return (
    getProgramAccessStatus(config, program) ===
    "enabled"
  )
}

export function isParfumProgramEnabled(
  config: StoreProgramAccessConfig,
): boolean {
  return isProgramEnabled(config, PARFUM_PROGRAM_KEY)
}
