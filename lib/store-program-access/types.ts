import type {
  ProgramKey,
  StoreProgramAccessField,
} from "./constants"

export type ProgramAccessMap = Record<
  ProgramKey,
  boolean
>

export type ProgramAccessStatus =
  | "enabled"
  | "disabled"

export type StoreProgramAccessVersion = number

export type StoreProgramAccessFlags = Record<
  StoreProgramAccessField,
  boolean
>

export type StoreProgramAccessMetadata = {
  version: StoreProgramAccessVersion
  updatedAt: unknown
  updatedByUid: string
  updatedByName: string
  updatedByRole: string
}

export type StoreProgramAccessConfig = {
  storeId: string
  cabangId: string
} & StoreProgramAccessFlags &
  StoreProgramAccessMetadata

export type StoreProgramAccessSource =
  | "default"
  | "stored"

export type StoreProgramAccessReadResult = {
  config: StoreProgramAccessConfig
  source: StoreProgramAccessSource
}

export type StoreProgramAccessHistoryEntry = {
  storeId: string
  cabangId: string
  before: ProgramAccessMap
  after: ProgramAccessMap
  changedByUid: string
  changedByName: string
  changedByRole: string
  changedAt: unknown
  version: StoreProgramAccessVersion
}
