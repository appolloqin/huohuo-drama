import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { BatchJobRow } from '../types.js'

const db = () => getMysqlDb()

export async function findBatchJobById(id: string): Promise<BatchJobRow | null> {
  const rows = await db().select().from(schema.batchJobs).where(eq(schema.batchJobs.id, id))
  return rows[0] ?? null
}

export async function findBatchJobByIdAndUserId(id: string, userId: number): Promise<BatchJobRow | null> {
  const rows = await db().select().from(schema.batchJobs).where(
    and(eq(schema.batchJobs.id, id), eq(schema.batchJobs.userId, userId)),
  )
  return rows[0] ?? null
}

export async function findActiveBatchJobForDrama(userId: number, dramaId: number): Promise<BatchJobRow | null> {
  const rows = await db().select().from(schema.batchJobs).where(
    and(
      eq(schema.batchJobs.userId, userId),
      eq(schema.batchJobs.dramaId, dramaId),
      inArray(schema.batchJobs.status, ['pending', 'running']),
    ),
  ).orderBy(desc(schema.batchJobs.createdAt))
  return rows[0] ?? null
}

export async function listActiveBatchJobsForUser(userId: number): Promise<BatchJobRow[]> {
  return db().select().from(schema.batchJobs).where(
    and(
      eq(schema.batchJobs.userId, userId),
      inArray(schema.batchJobs.status, ['pending', 'running']),
    ),
  ).orderBy(desc(schema.batchJobs.createdAt))
}

export async function listRecentBatchJobsForUser(userId: number, limit: number): Promise<BatchJobRow[]> {
  const rows = await db().select().from(schema.batchJobs).where(eq(schema.batchJobs.userId, userId))
    .orderBy(desc(schema.batchJobs.createdAt))
  return rows.slice(0, limit)
}

export async function listStaleBatchJobIds(): Promise<string[]> {
  const rows = await db().select({ id: schema.batchJobs.id }).from(schema.batchJobs)
    .where(inArray(schema.batchJobs.status, ['pending', 'running']))
  return rows.map((row) => row.id)
}

export async function listPendingOrRunningBatchJobIds(): Promise<string[]> {
  const rows = await db().select({ id: schema.batchJobs.id }).from(schema.batchJobs)
    .where(or(eq(schema.batchJobs.status, 'pending'), eq(schema.batchJobs.status, 'running')))
  return rows.map((row) => row.id)
}

export async function isBatchJobCancelRequested(id: string): Promise<boolean> {
  const rows = await db().select({ cancelRequested: schema.batchJobs.cancelRequested })
    .from(schema.batchJobs).where(eq(schema.batchJobs.id, id))
  const row = rows[0]
  return row?.cancelRequested == null ? false : Boolean(row.cancelRequested)
}

export async function insertBatchJob(input: typeof schema.batchJobs.$inferInsert): Promise<void> {
  await db().insert(schema.batchJobs).values(input)
}

export async function updateBatchJob(id: string, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.batchJobs).set(patch).where(eq(schema.batchJobs.id, id))
}
