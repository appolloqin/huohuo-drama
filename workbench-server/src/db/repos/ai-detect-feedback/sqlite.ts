import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { AiDetectFeedbackInput, TrainableFeedbackRow } from '../types.js'

const db = () => getSqliteDb()
const T = () => schema.aiDetectFeedback

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

export function insertFeedback(input: AiDetectFeedbackInput): number {
  const res = db().insert(T()).values({
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
  }).returning({ id: T().id }).get()
  return res.id
}

export function listTrainableFeedback(): TrainableFeedbackRow[] {
  return db().select({
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
    .all()
    .map(normalizeTrainableRow)
}

export function setAdminLabel(id: number, label: 'human' | 'ai'): void {
  db().update(T()).set({ adminLabel: label }).where(eq(T().id, id)).run()
}

export function findFeedbackById(id: number): Record<string, unknown> | null {
  const [row] = db().select().from(T()).where(eq(T().id, id)).all()
  return row ?? null
}

export function countPendingReview(): number {
  const [{ count }] = db().select({ count: sql<number>`count(*)` }).from(T()).where(and(
    sql`${T().adminLabel} IS NULL`,
    inArray(T().declaredLabel, ['human', 'ai']),
  )).all()
  return Number(count) || 0
}
