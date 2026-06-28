import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, ImageGenerationRow } from '../types.js'
import {
  type IndustrySlug,
  buildIndustryLikePatterns,
  isValidIndustrySlug,
} from '../../../common/industry/industry-catalog.js'

const db = () => getSqliteDb()

export type ImageGenerationListFilter = {
  storyboardId?: number
  dramaId?: number
  page?: number
  pageSize?: number
}

function listWhere(filters: ImageGenerationListFilter) {
  const conditions = []
  if (filters.storyboardId != null) {
    conditions.push(eq(schema.imageGenerations.storyboardId, filters.storyboardId))
  }
  if (filters.dramaId != null) {
    conditions.push(eq(schema.imageGenerations.dramaId, filters.dramaId))
  }
  if (conditions.length === 0) return undefined
  if (conditions.length === 1) return conditions[0]
  return and(...conditions)
}

export function insertImageGeneration(input: typeof schema.imageGenerations.$inferInsert): DbRunResult {
  const res = db().insert(schema.imageGenerations).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function findImageGenerationById(id: number): ImageGenerationRow | null {
  const [row] = db().select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
  return row ?? null
}

export function listImageGenerations(filters: ImageGenerationListFilter = {}): ImageGenerationRow[] {
  const where = listWhere(filters)
  const page = Math.max(1, (filters.page ?? 1) | 0)
  const pageSize = Math.max(1, Math.min(200, (filters.pageSize ?? 50) | 0))
  const base = db().select().from(schema.imageGenerations)
  const q = where ? base.where(where) : base
  return q.orderBy(desc(schema.imageGenerations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
}

export function countImageGenerations(filters: ImageGenerationListFilter = {}): number {
  const where = listWhere(filters)
  const rows = where
    ? db().select().from(schema.imageGenerations).where(where).all()
    : db().select().from(schema.imageGenerations).all()
  return rows.length
}

export function listCompletedImageGenerations(limit?: number): ImageGenerationRow[] {
  // Cap the showcase picker so we don't ship the entire completed set when
  // the route only wants the most recent N rows.
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  return db().select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.status, 'completed'))
    .orderBy(desc(schema.imageGenerations.createdAt))
    .limit(capped)
    .all()
    .filter((r) => !r.errorMsg)
}

/**
 * Showcase picker scoped to a single industry. SQL pushes the keyword OR-LIKE
 * filter so we never read more rows than needed; the repo caps the result
 * with LIMIT (default 100, max 500) and the route further slices it.
 *
 * Pass `industry: 'generic'` to get everything (no WHERE keyword clause).
 * Caller is responsible for validating the slug before calling — this repo
 * just trusts it. Pass an unknown slug to get an empty result set.
 */
export function listCompletedImageGenerationsByIndustry(
  industry: IndustrySlug | string,
  limit?: number,
): ImageGenerationRow[] {
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)

  // Unknown slug → empty result, never throw.
  if (!industry || !isValidIndustrySlug(industry)) return []

  const statusFilter = eq(schema.imageGenerations.status, 'completed')
  const patterns = buildIndustryLikePatterns(industry as IndustrySlug)

  // 'generic' = no keyword filter, just status.
  if (!patterns.length) {
    return db().select().from(schema.imageGenerations)
      .where(statusFilter)
      .orderBy(desc(schema.imageGenerations.createdAt))
      .limit(capped)
      .all()
      .filter((r: ImageGenerationRow) => !r.errorMsg)
  }

  const loweredPrompt = sql<string>`lower(${schema.imageGenerations.prompt})`
  const matchAny = or(...patterns.map((p) => like(loweredPrompt, p.toLowerCase())))

  return db().select().from(schema.imageGenerations)
    .where(and(statusFilter, matchAny))
    .orderBy(desc(schema.imageGenerations.createdAt))
    .limit(capped)
    .all()
    .filter((r: ImageGenerationRow) => !r.errorMsg)
}

export function updateImageGeneration(id: number, patch: Record<string, unknown>): void {
  db().update(schema.imageGenerations).set(patch).where(eq(schema.imageGenerations.id, id)).run()
}

export function deleteImageGeneration(id: number): void {
  db().delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).run()
}
