import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { BatchJobRow } from '../types.js'

const db = () => getSqliteDb()

export function findBatchJobById(id: string): BatchJobRow | null {
  const [row] = db().select().from(schema.batchJobs).where(eq(schema.batchJobs.id, id)).all()
  return row ?? null
}

export function findBatchJobByIdAndUserId(id: string, userId: number): BatchJobRow | null {
  const [row] = db().select().from(schema.batchJobs).where(
    and(eq(schema.batchJobs.id, id), eq(schema.batchJobs.userId, userId)),
  ).all()
  return row ?? null
}

export function findActiveBatchJobForDrama(userId: number, dramaId: number): BatchJobRow | null {
  const [row] = db().select().from(schema.batchJobs).where(
    and(
      eq(schema.batchJobs.userId, userId),
      eq(schema.batchJobs.dramaId, dramaId),
      inArray(schema.batchJobs.status, ['pending', 'running']),
    ),
  ).orderBy(desc(schema.batchJobs.createdAt)).all()
  return row ?? null
}

export function listActiveBatchJobsForUser(userId: number): BatchJobRow[] {
  return db().select().from(schema.batchJobs).where(
    and(
      eq(schema.batchJobs.userId, userId),
      inArray(schema.batchJobs.status, ['pending', 'running']),
    ),
  ).orderBy(desc(schema.batchJobs.createdAt)).all()
}

export function listRecentBatchJobsForUser(userId: number, limit: number): BatchJobRow[] {
  return db().select().from(schema.batchJobs).where(eq(schema.batchJobs.userId, userId))
    .orderBy(desc(schema.batchJobs.createdAt))
    .all()
    .slice(0, limit)
}

export function listStaleBatchJobIds(): string[] {
  return db().select({ id: schema.batchJobs.id }).from(schema.batchJobs)
    .where(inArray(schema.batchJobs.status, ['pending', 'running']))
    .all()
    .map((row) => row.id)
}

export function listPendingOrRunningBatchJobIds(): string[] {
  return db().select({ id: schema.batchJobs.id }).from(schema.batchJobs)
    .where(or(eq(schema.batchJobs.status, 'pending'), eq(schema.batchJobs.status, 'running')))
    .all()
    .map((row) => row.id)
}

export function isBatchJobCancelRequested(id: string): boolean {
  const [row] = db().select({ cancelRequested: schema.batchJobs.cancelRequested })
    .from(schema.batchJobs).where(eq(schema.batchJobs.id, id)).all()
  return row?.cancelRequested === 1
}

export function insertBatchJob(input: typeof schema.batchJobs.$inferInsert): void {
  db().insert(schema.batchJobs).values(input).run()
}

export function updateBatchJob(id: string, patch: Record<string, unknown>): void {
  db().update(schema.batchJobs).set(patch).where(eq(schema.batchJobs.id, id)).run()
}
