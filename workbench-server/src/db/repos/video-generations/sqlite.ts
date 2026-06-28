import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, VideoGenerationRow } from '../types.js'
import {
  type IndustrySlug,
  buildIndustryLikePatterns,
  isValidIndustrySlug,
} from '../../../common/industry/industry-catalog.js'

const db = () => getSqliteDb()

export type VideoGenerationListFilter = {
  storyboardId?: number
  dramaId?: number
  page?: number
  pageSize?: number
}

function listWhere(filters: VideoGenerationListFilter) {
  const conditions = []
  if (filters.storyboardId != null) {
    conditions.push(eq(schema.videoGenerations.storyboardId, filters.storyboardId))
  }
  if (filters.dramaId != null) {
    conditions.push(eq(schema.videoGenerations.dramaId, filters.dramaId))
  }
  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return and(...conditions)
}

export function findVideoGenerationById(id: number): VideoGenerationRow | null {
  const [row] = db().select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
  return row ?? null
}

export function findVideoGenerationByTaskId(taskId: string): VideoGenerationRow | null {
  const [row] = db().select().from(schema.videoGenerations).where(eq(schema.videoGenerations.taskId, taskId)).all()
  return row ?? null
}

export function listVideoGenerations(filters: VideoGenerationListFilter = {}): VideoGenerationRow[] {
  const where = listWhere(filters)
  const page = Math.max(1, (filters.page ?? 1) | 0)
  const pageSize = Math.max(1, Math.min(200, (filters.pageSize ?? 50) | 0))
  const base = db().select().from(schema.videoGenerations)
  const q = where ? base.where(where) : base
  return q.orderBy(desc(schema.videoGenerations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
}

export function countVideoGenerations(filters: VideoGenerationListFilter = {}): number {
  const where = listWhere(filters)
  const rows = where
    ? db().select().from(schema.videoGenerations).where(where).all()
    : db().select().from(schema.videoGenerations).all()
  return rows.length
}

export function listCompletedVideoGenerations(limit?: number): VideoGenerationRow[] {
  // Cap the showcase picker so we don't ship the entire completed set when
  // the route only wants the most recent N rows.
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  return db().select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.status, 'completed'))
    .orderBy(desc(schema.videoGenerations.createdAt))
    .limit(capped)
    .all()
    .filter((r) => !r.errorMsg)
}

export function listCompletedVideoGenerationsByIndustry(
  industry: IndustrySlug | string,
  limit?: number,
): VideoGenerationRow[] {
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  if (!industry || !isValidIndustrySlug(industry)) return []

  const statusFilter = eq(schema.videoGenerations.status, 'completed')
  const patterns = buildIndustryLikePatterns(industry as IndustrySlug)

  if (!patterns.length) {
    return db().select().from(schema.videoGenerations)
      .where(statusFilter)
      .orderBy(desc(schema.videoGenerations.createdAt))
      .limit(capped)
      .all()
      .filter((r: VideoGenerationRow) => !r.errorMsg)
  }

  const loweredPrompt = sql<string>`lower(${schema.videoGenerations.prompt})`
  const matchAny = or(...patterns.map((p) => like(loweredPrompt, p.toLowerCase())))

  return db().select().from(schema.videoGenerations)
    .where(and(statusFilter, matchAny))
    .orderBy(desc(schema.videoGenerations.createdAt))
    .limit(capped)
    .all()
    .filter((r: VideoGenerationRow) => !r.errorMsg)
}

export function updateVideoGeneration(id: number, patch: Record<string, unknown>): void {
  db().update(schema.videoGenerations).set(patch).where(eq(schema.videoGenerations.id, id)).run()
}

export function insertVideoGeneration(input: typeof schema.videoGenerations.$inferInsert): DbRunResult {
  const res = db().insert(schema.videoGenerations).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function deleteVideoGeneration(id: number): void {
  db().delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).run()
}
