import { and, desc, eq, like, or, sql } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, VideoGenerationRow } from '../types.js'
import type { VideoGenerationListFilter } from './sqlite.js'
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

export async function findVideoGenerationById(id: number): Promise<VideoGenerationRow | null> {
  const rows = await db().select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
  return rows[0] ?? null
}

export async function findVideoGenerationByTaskId(taskId: string): Promise<VideoGenerationRow | null> {
  const rows = await db().select().from(schema.videoGenerations).where(eq(schema.videoGenerations.taskId, taskId))
  return rows[0] ?? null
}

export async function listVideoGenerations(filters: VideoGenerationListFilter = {}): Promise<VideoGenerationRow[]> {
  const where = listWhere(filters)
  const page = Math.max(1, (filters.page ?? 1) | 0)
  const pageSize = Math.max(1, Math.min(200, (filters.pageSize ?? 50) | 0))
  const base = db().select().from(schema.videoGenerations)
  const q = where ? base.where(where) : base
  return q.orderBy(desc(schema.videoGenerations.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
}

export async function countVideoGenerations(filters: VideoGenerationListFilter = {}): Promise<number> {
  const where = listWhere(filters)
  const rows = where
    ? await db().select({ n: sql<number>`COUNT(*)` }).from(schema.videoGenerations).where(where)
    : await db().select({ n: sql<number>`COUNT(*)` }).from(schema.videoGenerations)
  return Number((rows[0] as { n: number } | undefined)?.n ?? 0)
}

export async function listCompletedVideoGenerations(limit?: number): Promise<VideoGenerationRow[]> {
  // Cap the showcase picker so we don't ship the entire completed set when
  // the route only wants the most recent N rows.
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  const rows = await db().select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.status, 'completed'))
    .orderBy(desc(schema.videoGenerations.createdAt))
    .limit(capped)
  return rows.filter((r) => !r.errorMsg)
}

export async function listCompletedVideoGenerationsByIndustry(
  industry: IndustrySlug | string,
  limit?: number,
): Promise<VideoGenerationRow[]> {
  const capped = Math.min(Math.max(limit ?? 100, 1), 500)
  if (!industry || !isValidIndustrySlug(industry)) return []

  const statusFilter = eq(schema.videoGenerations.status, 'completed')
  const patterns = buildIndustryLikePatterns(industry as IndustrySlug)

  if (!patterns.length) {
    const rows = await db().select().from(schema.videoGenerations)
      .where(statusFilter)
      .orderBy(desc(schema.videoGenerations.createdAt))
      .limit(capped)
    return rows.filter((r: VideoGenerationRow) => !r.errorMsg)
  }

  const loweredPrompt = sql<string>`lower(${schema.videoGenerations.prompt})`
  const matchAny = or(...patterns.map((p) => like(loweredPrompt, p.toLowerCase())))

  const rows = await db().select().from(schema.videoGenerations)
    .where(and(statusFilter, matchAny))
    .orderBy(desc(schema.videoGenerations.createdAt))
    .limit(capped)
  return rows.filter((r: VideoGenerationRow) => !r.errorMsg)
}

export async function updateVideoGeneration(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.videoGenerations).set(patch).where(eq(schema.videoGenerations.id, id))
}

export async function insertVideoGeneration(input: typeof schema.videoGenerations.$inferInsert): Promise<DbRunResult> {
  const result = await db().insert(schema.videoGenerations).values(input)
  return normalizeRun(result)
}

export async function deleteVideoGeneration(id: number): Promise<void> {
  await db().delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
}
