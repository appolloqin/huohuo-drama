import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult } from '../types.js'
import { decryptSecret, encryptSecret } from '../../../common/security/secret-cipher.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type UserPresetRow = {
  id: number
  userId: number
  presetKey: string
  apiKey: string | null
  model: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

function normalizeRow(row: {
  id: number
  userId: number
  presetKey: string
  apiKey?: string | null
  model?: string | null
  enabled?: boolean | number | null
  createdAt: string
  updatedAt: string
}): UserPresetRow {
  const enabled = row.enabled == null ? true : (row.enabled === true || row.enabled === 1)
  return {
    id: row.id,
    userId: row.userId,
    presetKey: row.presetKey,
    apiKey: row.apiKey ?? null,
    model: row.model ?? null,
    enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function decryptRow(row: UserPresetRow): UserPresetRow {
  if (!row.apiKey) return row
  return { ...row, apiKey: decryptSecret(row.apiKey) }
}

function encryptInput(input: {
  userId: number
  presetKey: string
  apiKey?: string | null
  model?: string | null
  enabled?: boolean | null
  createdAt: string
  updatedAt: string
}) {
  if (!input.apiKey) return input
  return { ...input, apiKey: encryptSecret(input.apiKey) }
}

export async function listUserPresets(userId: number): Promise<UserPresetRow[]> {
  const rows = isMysqlDriver()
    ? await mysql.listByUserId(userId)
    : sqlite.listByUserId(userId)
  return rows.map(r => decryptRow(normalizeRow(r)))
}

export async function findUserPreset(userId: number, presetKey: string): Promise<UserPresetRow | null> {
  const row = isMysqlDriver()
    ? await mysql.findByUserAndKey(userId, presetKey)
    : sqlite.findByUserAndKey(userId, presetKey)
  return row ? decryptRow(normalizeRow(row)) : null
}

export async function upsertUserPreset(input: {
  userId: number
  presetKey: string
  apiKey?: string | null
  model?: string | null
  enabled?: boolean | null
  createdAt: string
  updatedAt: string
}): Promise<DbRunResult> {
  const enc = encryptInput(input)
  if (isMysqlDriver()) return mysql.upsertUserPreset(enc)
  return sqlite.upsertUserPreset(enc)
}
