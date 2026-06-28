import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, ImageGenerationRow } from '../types.js'
import type { ImageGenerationListFilter } from './sqlite.js'
import {
  type IndustrySlug,
  buildIndustryLikePatterns,
  isValidIndustrySlug,
} from '../../../common/industry/industry-catalog.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
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

export async function insertImageGeneration(input: typeof schema.imageGenerations.$inferInsert): Promise<DbRunResult> {
  const result = await db().insert(schema.imageGenerations).values(input)
  return normalizeRun(result)
}

export async function findImageGenerationById(id: number): Promise<ImageGenerationRow | null> {
  const rows = await db().select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id))
  return rows[0] ?? null
}

export async function listImageGenerations(filters: ImageGenerationListFilter = {}): Promise<ImageGenerationRow[]> {
  const where = listWhere(filters)
  const page = Math.max(1, (filters.page ?? 1) | 0)
  const pageSize = Math.max(1, Math.min(200, (filters.pageSize ?? 50) | 0))
  const base = db().select().from(schema.imageGenerations)
  const q = where ? base.where(where) : base
  return q.orderBy(desc(schema.imageGenerations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
}

export async function countImageGenerations(filters: ImageGenerationListFilter = {}): Promise<number> {
  const where = listWhere(filters)
  const rows = where
    ? await db().select({ n: sql<number>`COUNT(*)` }).from(schema.imageGenerations).where(where)
    : await db().select({ n: sql<number>`COUNT(*)` }).from(schema.imageGenerations)
  return Number((rows[0] as { n: number } | undefined)?.n ?? 0)
}

export async function listCompletedImageGenerations(limit?: number): Promise<ImageGenerationRow[]> {
  // Cap the showcase picker so we don't ship the entire completed set when
  // the route only wants the most recent N rows.
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  const rows = await db().select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.status, 'completed'))
    .orderBy(desc(schema.imageGenerations.createdAt))
    .limit(capped)
  return rows.filter((r) => !r.errorMsg)
}

/**
 * Showcase picker scoped to a single industry. Mirrors the SQLite repo.
 * Uses `lower(prompt) LIKE ?` to keep the match case-insensitive on MySQL
 * regardless of column collation.
 */
export async function listCompletedImageGenerationsByIndustry(
  industry: IndustrySlug | string,
  limit?: number,
): Promise<ImageGenerationRow[]> {
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  if (!industry || !isValidIndustrySlug(industry)) return []

  const statusFilter = eq(schema.imageGenerations.status, 'completed')
  const patterns = buildIndustryLikePatterns(industry as IndustrySlug)

  if (!patterns.length) {
    const rows = await db().select().from(schema.imageGenerations)
      .where(statusFilter)
      .orderBy(desc(schema.imageGenerations.createdAt))
      .limit(capped)
    return rows.filter((r: ImageGenerationRow) => !r.errorMsg)
  }

  const loweredPrompt = sql<string>`lower(${schema.imageGenerations.prompt})`
  const matchAny = or(...patterns.map((p) => like(loweredPrompt, p.toLowerCase())))

  const rows = await db().select().from(schema.imageGenerations)
    .where(and(statusFilter, matchAny))
    .orderBy(desc(schema.imageGenerations.createdAt))
    .limit(capped)
  return rows.filter((r: ImageGenerationRow) => !r.errorMsg)
}

export async function updateImageGeneration(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.imageGenerations).set(patch).where(eq(schema.imageGenerations.id, id))
}

export async function deleteImageGeneration(id: number): Promise<void> {
  await db().delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id))
}
