/**
 * 服务端批量撰写任务 — 与 HTTP 连接解耦，支持关页后继续、刷新后恢复进度
 */
import { randomUUID } from 'crypto'
import * as batchJobsRepo from '../../db/repos/batch-jobs/index.js'
import type { BatchJobRow } from '../../db/repos/types.js'
import * as usersRepo from '../../db/repos/users/index.js'
import { now } from '../../common/http/response.js'
import { dramaOwnedByUser } from '../drama/drama-access-service.js';
import { isNovelProject } from '../../common/novel/novel-meta.js'
import { assertUserCanGenerate } from '../credits/credits.js'
import {
  batchGenerateDramaEpisodes,
  batchGenerateNovelChapters,
  type BatchScope,
  type BatchProgressPayload,
  type BatchSummary,
} from './batch-generation.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

export type BatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped' | 'cancelled'

export type BatchJobPayload = {
  scope?: BatchScope
}

export type BatchJobRecord = {
  id: string
  userId: number
  dramaId: number
  projectType: 'drama' | 'novel'
  dramaTitle: string | null
  status: BatchJobStatus
  payload: BatchJobPayload | null
  progress: BatchProgressPayload | null
  summary: BatchSummary | null
  errorMessage: string | null
  cancelRequested: boolean
  createdAt: string
  updatedAt: string
  startedAt: string | null
  finishedAt: string | null
}

const TERMINAL: BatchJobStatus[] = ['completed', 'failed', 'stopped', 'cancelled']
const runningInProcess = new Set<string>()
const cancelFlags = new Set<string>()

type JsonField = string | Record<string, unknown> | null | undefined

function parseJson<T>(raw: JsonField): T | null {
  if (raw == null) return null
  if (typeof raw === 'object') return raw as T
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function rowToRecord(row: BatchJobRow): BatchJobRecord {
  return {
    id: row.id,
    userId: row.userId,
    dramaId: row.dramaId,
    projectType: row.projectType as 'drama' | 'novel',
    dramaTitle: row.dramaTitle,
    status: row.status as BatchJobStatus,
    payload: parseJson<BatchJobPayload>(row.payload),
    progress: parseJson<BatchProgressPayload>(row.progress),
    summary: parseJson<BatchSummary>(row.summary),
    errorMessage: row.errorMessage,
    cancelRequested: Boolean(row.cancelRequested),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  }
}

async function updateJob(id: string, patch: Partial<{
  status: BatchJobStatus
  progress: BatchProgressPayload | null
  summary: BatchSummary | null
  errorMessage: string | null
  cancelRequested: boolean
  startedAt: string | null
  finishedAt: string | null
}>) {
  const ts = now()
  const set: Record<string, unknown> = { updatedAt: ts }
  if (patch.status != null) set.status = patch.status
  if ('progress' in patch) set.progress = patch.progress ? JSON.stringify(patch.progress) : null
  if ('summary' in patch) set.summary = patch.summary ? JSON.stringify(patch.summary) : null
  if ('errorMessage' in patch) set.errorMessage = patch.errorMessage
  if (patch.cancelRequested != null) set.cancelRequested = patch.cancelRequested ? 1 : 0
  if ('startedAt' in patch) set.startedAt = patch.startedAt
  if ('finishedAt' in patch) set.finishedAt = patch.finishedAt
  await batchJobsRepo.updateBatchJob(id, set)
}

export async function recoverStaleBatchJobs() {
  const candidates = await batchJobsRepo.listPendingOrRunningBatchJobIds()
  if (!candidates.length) return
  const ts = now()
  let count = 0
  for (const id of candidates) {
    const row = await batchJobsRepo.findBatchJobById(id)
    if (row?.status !== 'running') continue
    await batchJobsRepo.updateBatchJob(id, {
      status: 'failed',
      errorMessage: '服务重启导致任务中断，请重新发起批量撰写',
      finishedAt: ts,
      updatedAt: ts,
    })
    count++
  }
  if (count) logTaskError('BatchJob', 'recover-stale', { count })
}

export async function getBatchJobForUser(jobId: string, userId: number): Promise<BatchJobRecord | null> {
  const row = await batchJobsRepo.findBatchJobByIdAndUserId(jobId, userId)
  return row ? rowToRecord(row) : null
}

export async function findActiveBatchJobForDrama(userId: number, dramaId: number): Promise<BatchJobRecord | null> {
  const row = await batchJobsRepo.findActiveBatchJobForDrama(userId, dramaId)
  return row ? rowToRecord(row) : null
}

export async function listActiveBatchJobsForUser(userId: number): Promise<BatchJobRecord[]> {
  const rows = await batchJobsRepo.listActiveBatchJobsForUser(userId)
  return rows.map(rowToRecord)
}

export async function listRecentBatchJobsForUser(userId: number, limit = 5): Promise<BatchJobRecord[]> {
  const rows = await batchJobsRepo.listRecentBatchJobsForUser(userId, limit)
  return rows.map(rowToRecord)
}

export async function createAndStartBatchJob(args: {
  userId: number
  userRole: string
  dramaId: number
  scope?: BatchScope
}): Promise<{ job: BatchJobRecord; alreadyRunning?: BatchJobRecord }> {
  const { userId, userRole, dramaId, scope } = args

  const existing = await findActiveBatchJobForDrama(userId, dramaId)
  if (existing) return { job: existing, alreadyRunning: existing }

  await assertUserCanGenerate(userId, userRole)

  const drama = await dramaOwnedByUser(dramaId, userId)
  if (!drama) throw new Error('项目不存在')

  const isNovel = isNovelProject(drama)
  const ts = now()
  const id = randomUUID()
  const payload: BatchJobPayload = { scope: scope ?? { mode: 'remaining' } }

  await batchJobsRepo.insertBatchJob({
    id,
    userId,
    dramaId,
    projectType: isNovel ? 'novel' : 'drama',
    dramaTitle: drama.title,
    status: 'pending',
    payload: JSON.stringify(payload),
    cancelRequested: 0,
    createdAt: ts,
    updatedAt: ts,
  })

  const job = (await getBatchJobForUser(id, userId))!
  queueMicrotask(() => { void executeBatchJob(id) })
  return { job }
}

export async function requestCancelBatchJob(jobId: string, userId: number): Promise<BatchJobRecord | null> {
  const job = await getBatchJobForUser(jobId, userId)
  if (!job) return null
  if (TERMINAL.includes(job.status)) return job
  cancelFlags.add(jobId)
  await updateJob(jobId, { cancelRequested: true })
  return getBatchJobForUser(jobId, userId)
}

async function executeBatchJob(jobId: string) {
  if (runningInProcess.has(jobId)) return
  runningInProcess.add(jobId)

  const row = await batchJobsRepo.findBatchJobById(jobId)
  if (!row || TERMINAL.includes(row.status as BatchJobStatus)) {
    runningInProcess.delete(jobId)
    return
  }

  if (row.cancelRequested) {
    await updateJob(jobId, { status: 'cancelled', finishedAt: now() })
    runningInProcess.delete(jobId)
    return
  }

  const userId = row.userId
  const user = await usersRepo.findUserById(userId)
  const userRole = user?.role || 'user'

  await updateJob(jobId, { status: 'running', startedAt: now() })
  logTaskStart('BatchJob', 'run', { jobId, dramaId: row.dramaId, projectType: row.projectType })

  const shouldStop = () => cancelFlags.has(jobId) || readCancelRequestedSync(jobId)

  try {
    const onProgress = (progress: BatchProgressPayload) => {
      void updateJob(jobId, { progress }).catch((err) => {
        logTaskError('BatchJob', 'progress-update', { jobId, error: err?.message || String(err) })
      })
    }

    let summary: BatchSummary
    if (row.projectType === 'novel') {
      const payload = parseJson<BatchJobPayload>(row.payload)
      summary = await batchGenerateNovelChapters({
        dramaId: row.dramaId,
        userId,
        userRole,
        scope: payload?.scope,
        onProgress,
        shouldStop,
      })
    } else {
      const payload = parseJson<BatchJobPayload>(row.payload)
      summary = await batchGenerateDramaEpisodes({
        dramaId: row.dramaId,
        userId,
        userRole,
        scope: payload?.scope,
        onProgress,
        shouldStop,
      })
    }

    const stopped = shouldStop()
    const status: BatchJobStatus = stopped
      ? 'stopped'
      : summary.failed > 0 ? 'failed' : 'completed'

    await updateJob(jobId, {
      status,
      summary,
      finishedAt: now(),
      errorMessage: summary.errors[0]?.message ?? null,
    })
    logTaskSuccess('BatchJob', 'run', { jobId, status, ...summary })
  } catch (err: any) {
    const message = err?.message || '批量任务失败'
    await updateJob(jobId, {
      status: shouldStop() ? 'stopped' : 'failed',
      errorMessage: message,
      finishedAt: now(),
    })
    logTaskError('BatchJob', 'run', { jobId, error: message })
  } finally {
    cancelFlags.delete(jobId)
    runningInProcess.delete(jobId)
  }
}

function readCancelRequestedSync(jobId: string): boolean {
  // executeBatchJob 在单进程内运行；取消标记优先走内存 cancelFlags
  return cancelFlags.has(jobId)
}

export function isBatchJobTerminal(status: BatchJobStatus) {
  return TERMINAL.includes(status)
}

/** 进程内恢复：服务未重启但 runner 丢失时重新排队 */
export async function resumePendingBatchJobs() {
  const pending = await batchJobsRepo.listPendingOrRunningBatchJobIds()
  for (const id of pending) {
    if (!runningInProcess.has(id)) {
      queueMicrotask(() => { void executeBatchJob(id) })
    }
  }
}
