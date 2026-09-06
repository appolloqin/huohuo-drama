import { and, eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { AiDetectRunCacheKey, AiDetectRunInput, AiDetectRunRow } from '../types.js'

const db = () => getSqliteDb()
const T = () => schema.aiDetectRuns

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

/** 冲突两步 upsert（查→改/插） */
export function upsertRun(input: AiDetectRunInput): number {
  const values = toValues(input)
  const existing = db().select({ id: T().id }).from(T()).where(and(
    eq(T().contentHash, input.contentHash),
    eq(T().genre, input.genre),
    eq(T().engineVersion, input.engineVersion),
    eq(T().cacheVariant, input.cacheVariant),
  )).all()[0]
  if (existing) {
    db().update(T()).set({ ...values, cacheHit: 0 }).where(eq(T().id, existing.id)).run()
    return existing.id
  }
  const inserted = db().insert(T()).values({ ...values, cacheHit: 0 }).returning({ id: T().id }).get()
  return inserted.id
}

export function findCacheableRun(key: AiDetectRunCacheKey): AiDetectRunRow | null {
  const cutoff = new Date().toISOString()
  return db().select().from(T()).where(and(
    eq(T().contentHash, key.contentHash),
    eq(T().genre, key.genre),
    eq(T().engineVersion, key.engineVersion),
    eq(T().cacheVariant, key.cacheVariant),
  )).all().find((row) => !row.expiresAt || row.expiresAt > cutoff) ?? null
}

export function bumpCacheHit(id: number): void {
  const [row] = db().select({ cacheHit: T().cacheHit }).from(T()).where(eq(T().id, id)).all()
  db().update(T()).set({ cacheHit: (row?.cacheHit ?? 0) + 1 }).where(eq(T().id, id)).run()
}
