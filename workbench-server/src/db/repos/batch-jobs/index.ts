import { isMysqlDriver } from '../../driver.js'
import type { BatchJobRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function findBatchJobById(id: string): Promise<BatchJobRow | null> {
  return isMysqlDriver() ? mysql.findBatchJobById(id) : sqlite.findBatchJobById(id)
}

export async function findBatchJobByIdAndUserId(id: string, userId: number): Promise<BatchJobRow | null> {
  return isMysqlDriver()
    ? mysql.findBatchJobByIdAndUserId(id, userId)
    : sqlite.findBatchJobByIdAndUserId(id, userId)
}

export async function findActiveBatchJobForDrama(userId: number, dramaId: number): Promise<BatchJobRow | null> {
  return isMysqlDriver()
    ? mysql.findActiveBatchJobForDrama(userId, dramaId)
    : sqlite.findActiveBatchJobForDrama(userId, dramaId)
}

export async function listActiveBatchJobsForUser(userId: number): Promise<BatchJobRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveBatchJobsForUser(userId)
    : sqlite.listActiveBatchJobsForUser(userId)
}

export async function listRecentBatchJobsForUser(userId: number, limit: number): Promise<BatchJobRow[]> {
  return isMysqlDriver()
    ? mysql.listRecentBatchJobsForUser(userId, limit)
    : sqlite.listRecentBatchJobsForUser(userId, limit)
}

export async function listStaleBatchJobIds(): Promise<string[]> {
  return isMysqlDriver() ? mysql.listStaleBatchJobIds() : sqlite.listStaleBatchJobIds()
}

export async function listPendingOrRunningBatchJobIds(): Promise<string[]> {
  return isMysqlDriver()
    ? mysql.listPendingOrRunningBatchJobIds()
    : sqlite.listPendingOrRunningBatchJobIds()
}

export async function isBatchJobCancelRequested(id: string): Promise<boolean> {
  return isMysqlDriver() ? mysql.isBatchJobCancelRequested(id) : sqlite.isBatchJobCancelRequested(id)
}

export async function insertBatchJob(input: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.insertBatchJob(input as never)
  sqlite.insertBatchJob(input as never)
}

export async function updateBatchJob(id: string, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateBatchJob(id, patch)
  sqlite.updateBatchJob(id, patch)
}
