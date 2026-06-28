import { and, eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export function listByUserId(userId: number) {
  return db().select().from(schema.userAiPresetConfigs)
    .where(eq(schema.userAiPresetConfigs.userId, userId))
    .all()
}

export function findByUserAndKey(userId: number, presetKey: string) {
  const row = db().select().from(schema.userAiPresetConfigs)
    .where(and(
      eq(schema.userAiPresetConfigs.userId, userId),
      eq(schema.userAiPresetConfigs.presetKey, presetKey),
    ))
    .get()
  return row ?? null
}

export function upsertUserPreset(input: {
  userId: number
  presetKey: string
  apiKey?: string | null
  model?: string | null
  createdAt: string
  updatedAt: string
}): DbRunResult {
  const existing = findByUserAndKey(input.userId, input.presetKey)
  if (existing) {
    db().update(schema.userAiPresetConfigs)
      .set({
        apiKey: input.apiKey ?? null,
        model: input.model ?? null,
        updatedAt: input.updatedAt,
      })
      .where(eq(schema.userAiPresetConfigs.id, existing.id))
      .run()
    return { lastInsertRowid: Number(existing.id), changes: 1 }
  }
  const res = db().insert(schema.userAiPresetConfigs).values({
    userId: input.userId,
    presetKey: input.presetKey,
    apiKey: input.apiKey ?? null,
    model: input.model ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}
