import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AiDetectFeedbackInput, DbRunResult, TrainableFeedbackRow } from '../types.js'

const db = () => getMysqlDb()
const T = () => schema.aiDetectFeedback

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

function normalizeTrainableRow(row: {
  id: number
  contentHash: string
  excerpt: string | null
  genre: string
  declaredLabel: string | null
  adminLabel: string | null
  createdAt: string
}): TrainableFeedbackRow {
  const adminLabel = row.adminLabel === 'human' || row.adminLabel === 'ai' ? row.adminLabel : null
  const declaredLabel = row.declaredLabel === 'human' || row.declaredLabel === 'ai' ? row.declaredLabel : null
  const sourceLabel = (adminLabel ?? declaredLabel) as 'human' | 'ai' | null
  return { ...row, adminLabel, declaredLabel, sourceLabel }
}

export async function insertFeedback(input: AiDetectFeedbackInput): Promise<number> {
  const result = await db().insert(T()).values({
    runId: input.runId ?? null,
    contentHash: input.contentHash,
    userId: input.userId ?? null,
    sourceType: input.sourceType,
    declaredLabel: input.declaredLabel ?? null,
    adminLabel: input.adminLabel ?? null,
    consentStore: input.consentStore ? 1 : 0,
    note: input.note ?? null,
    excerpt: input.excerpt ?? null,
    genre: input.genre,
    createdAt: input.createdAt,
  })
  return normalizeRun(result).lastInsertRowid
}

export async function listTrainableFeedback(): Promise<TrainableFeedbackRow[]> {
  const rows = await db().select({
    id: T().id,
    contentHash: T().contentHash,
    excerpt: T().excerpt,
    genre: T().genre,
    declaredLabel: T().declaredLabel,
    adminLabel: T().adminLabel,
    createdAt: T().createdAt,
  }).from(T()).where(and(
    eq(T().consentStore, 1),
    or(
      inArray(T().adminLabel, ['human', 'ai']),
      inArray(T().declaredLabel, ['human', 'ai']),
    ),
  )).orderBy(desc(sql`CASE WHEN ${T().adminLabel} IS NOT NULL THEN 1 ELSE 0 END`))
  return rows.map(normalizeTrainableRow)
}

export async function setAdminLabel(id: number, label: 'human' | 'ai'): Promise<void> {
  await db().update(T()).set({ adminLabel: label }).where(eq(T().id, id))
}

export async function findFeedbackById(id: number): Promise<Record<string, unknown> | null> {
  const rows = await db().select().from(T()).where(eq(T().id, id))
  return rows[0] ?? null
}

export async function countPendingReview(): Promise<number> {
  const rows = await db().select({ count: sql<number>`count(*)` }).from(T()).where(and(
    sql`${T().adminLabel} IS NULL`,
    inArray(T().declaredLabel, ['human', 'ai']),
  ))
  return Number(rows[0]?.count) || 0
}
