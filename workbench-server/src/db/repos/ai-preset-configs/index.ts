import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult } from '../types.js'
import { decryptSecret, encryptSecret } from '../../../common/security/secret-cipher.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type PresetRow = Awaited<ReturnType<typeof mysql.listAllPresets>>[number]

function decryptPresetRow<T extends { apiKey?: string | null }>(row: T): T {
  if (!row.apiKey) return row
  return { ...row, apiKey: decryptSecret(row.apiKey) }
}

function encryptPresetInput(input: {
  presetKey: string
  serviceType?: string | null
  provider?: string | null
  baseUrl?: string | null
  apiKey?: string | null
  model?: string | null
  label?: string | null
  priority?: number | null
  isActive?: boolean | null
  createdAt: string
  updatedAt: string
}) {
  if (!input.apiKey) return input
  return { ...input, apiKey: encryptSecret(input.apiKey) }
}

export async function listAllPresets(): Promise<PresetRow[]> {
  const rows = isMysqlDriver()
    ? await mysql.listAllPresets()
    : (sqlite.listAllPresets() as unknown as PresetRow[])
  return rows.map(decryptPresetRow)
}

export async function findPresetByKey(presetKey: string): Promise<PresetRow | null> {
  const row = isMysqlDriver()
    ? await mysql.findPresetByKey(presetKey)
    : (sqlite.findPresetByKey(presetKey) as unknown as PresetRow | null)
  return row ? decryptPresetRow(row) : null
}

export async function upsertPreset(input: {
  presetKey: string
  serviceType?: string | null
  provider?: string | null
  baseUrl?: string | null
  apiKey?: string | null
  model?: string | null
  label?: string | null
  priority?: number | null
  isActive?: boolean | null
  createdAt: string
  updatedAt: string
}): Promise<DbRunResult> {
  const encInput = encryptPresetInput(input)
  if (isMysqlDriver()) return mysql.upsertPreset(encInput)
  return sqlite.upsertPreset(encInput)
}
