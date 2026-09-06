import { and, eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AiDetectRunCacheKey, AiDetectRunInput, AiDetectRunRow, DbRunResult } from '../types.js'

const db = () => getMysqlDb()
const T = () => schema.aiDetectRuns

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

function toValues(input: AiDetectRunInput) {
  return {
    userId: input.userId ?? null,
    sourceType: input.sourceType,
    genre: input.genre,
    contentHash: input.contentHash,
    charCount: input.charCount,
    engineVersion: input.engineVersion,
    cacheVariant: input.cacheVariant,
    probability: input.probability,
    verdict: input.verdict,
    confidence: input.confidence,
    method: input.method,
    resultJson: input.resultJson ?? null,
    modelRef: input.modelRef ?? null,
    uncalibrated: input.uncalibrated ? 1 : 0,
    needsReview: input.needsReview ? 1 : 0,
    perturbScore: input.perturbScore ?? null,
    elapsedMs: input.elapsedMs ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: input.createdAt,
  }
}

export async function upsertRun(input: AiDetectRunInput): Promise<number> {
  const values = toValues(input)
  const rows = await db().select({ id: T().id }).from(T()).where(and(
    eq(T().contentHash, input.contentHash),
    eq(T().genre, input.genre),
    eq(T().engineVersion, input.engineVersion),
    eq(T().cacheVariant, input.cacheVariant),
  ))
  if (rows[0]) {
    await db().update(T()).set({ ...values, cacheHit: 0 }).where(eq(T().id, rows[0].id))
    return rows[0].id
  }
  const result = await db().insert(T()).values({ ...values, cacheHit: 0 })
  return normalizeRun(result).lastInsertRowid
}

export async function findCacheableRun(key: AiDetectRunCacheKey): Promise<AiDetectRunRow | null> {
  const cutoff = new Date().toISOString()
  const rows = await db().select().from(T()).where(and(
    eq(T().contentHash, key.contentHash),
    eq(T().genre, key.genre),
    eq(T().engineVersion, key.engineVersion),
    eq(T().cacheVariant, key.cacheVariant),
  ))
  return rows.find((row) => !row.expiresAt || row.expiresAt > cutoff) ?? null
}

export async function bumpCacheHit(id: number): Promise<void> {
  const rows = await db().select({ cacheHit: T().cacheHit }).from(T()).where(eq(T().id, id))
  await db().update(T()).set({ cacheHit: (rows[0]?.cacheHit ?? 0) + 1 }).where(eq(T().id, id))
}
