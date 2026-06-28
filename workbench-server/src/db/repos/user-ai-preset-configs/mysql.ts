import { and, eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult } from '../types.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function listByUserId(userId: number) {
  return db().select().from(schema.userAiPresetConfigs)
    .where(eq(schema.userAiPresetConfigs.userId, userId))
}

export async function findByUserAndKey(userId: number, presetKey: string) {
  const rows = await db().select().from(schema.userAiPresetConfigs)
    .where(and(
      eq(schema.userAiPresetConfigs.userId, userId),
      eq(schema.userAiPresetConfigs.presetKey, presetKey),
    ))
  return rows[0] ?? null
}

export async function upsertUserPreset(input: {
  userId: number
  presetKey: string
  apiKey?: string | null
  model?: string | null
  createdAt: string
  updatedAt: string
}): Promise<DbRunResult> {
  const existing = await findByUserAndKey(input.userId, input.presetKey)
  if (existing) {
    await db().update(schema.userAiPresetConfigs)
      .set({
        apiKey: input.apiKey ?? null,
        model: input.model ?? null,
        updatedAt: input.updatedAt,
      })
      .where(eq(schema.userAiPresetConfigs.id, existing.id))
    return { lastInsertRowid: Number(existing.id), changes: 1 }
  }
  const result = await db().insert(schema.userAiPresetConfigs).values({
    userId: input.userId,
    presetKey: input.presetKey,
    apiKey: input.apiKey ?? null,
    model: input.model ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
  return normalizeRun(result)
}
