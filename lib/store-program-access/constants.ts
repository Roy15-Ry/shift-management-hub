export const PROGRAM_KEYS = [
  "targetPenjualan",
  "monitoringError",
  "kontribusiOmset",
] as const

export type ProgramKey = (typeof PROGRAM_KEYS)[number]

export const PROGRAM_LABELS: Record<ProgramKey, string> = {
  targetPenjualan: "Target Penjualan",
  monitoringError: "Monitoring Error",
  kontribusiOmset: "Kontribusi Omset",
}

export type StoreProgramAccessField =
  | "targetPenjualanEnabled"
  | "monitoringErrorEnabled"
  | "kontribusiOmsetEnabled"

export const PROGRAM_FIELD_BY_KEY: Record<
  ProgramKey,
  StoreProgramAccessField
> = {
  targetPenjualan: "targetPenjualanEnabled",
  monitoringError: "monitoringErrorEnabled",
  kontribusiOmset: "kontribusiOmsetEnabled",
}

export const PARFUM_PROGRAM_KEY: ProgramKey =
  "targetPenjualan"

export const STORE_PROGRAM_ACCESS_COLLECTION =
  "store_program_access"

export const STORE_PROGRAM_ACCESS_HISTORY_COLLECTION =
  "store_program_access_history"

export function isProgramKey(
  value: unknown,
): value is ProgramKey {
  return (PROGRAM_KEYS as readonly unknown[]).includes(
    value,
  )
}
