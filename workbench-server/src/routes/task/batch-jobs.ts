import { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { toSnakeCase } from '../../common/http/transform.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  createAndStartBatchJob,
  getBatchJobForUser,
  listActiveBatchJobsForUser,
  listRecentBatchJobsForUser,
  requestCancelBatchJob,
  type BatchJobRecord,
} from '../../services/batch/batch-job-service.js'
import type { BatchScope } from '../../services/batch/batch-generation.js'
import type { ProductionPipeline } from '../../common/drama/episode-meta.js'

const app = new Hono()

function parseProductionPipeline(raw: unknown): ProductionPipeline | undefined {
  return raw === 'frame_slideshow' || raw === 'ai_video' ? raw : undefined
}

export function parseBatchScopeFromBody(raw: unknown): BatchScope | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const scope = raw as Record<string, unknown>
  const production_pipeline = parseProductionPipeline(scope.production_pipeline)
  const parsed: BatchScope = {
    mode: scope.mode as BatchScope['mode'],
    chapter_numbers: Array.isArray(scope.chapter_numbers)
      ? scope.chapter_numbers.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : undefined,
    from_chapter: scope.from_chapter != null ? Number(scope.from_chapter) : undefined,
    to_chapter: scope.to_chapter != null ? Number(scope.to_chapter) : undefined,
    overwrite: scope.overwrite === true,
  }
  if (production_pipeline) parsed.production_pipeline = production_pipeline
  return parsed
}

function serializeJob(job: BatchJobRecord) {
  return toSnakeCase({
    ...job,
    payload: job.payload,
    progress: job.progress,
    summary: job.summary,
  })
}

// GET /batch-jobs/active — 当前用户进行中的任务（刷新后可恢复）
app.get('/active', async (c) => {
  const user = getAuthUser(c)
  const active = await listActiveBatchJobsForUser(user.id)
  const recent = await listRecentBatchJobsForUser(user.id, 3)
  return success(c, {
    active: active.map(serializeJob),
    recent: recent.map(serializeJob),
  })
})

// GET /batch-jobs/:id
app.get('/:id', async (c) => {
  const user = getAuthUser(c)
  const id = c.req.param('id')
  const job = await getBatchJobForUser(id, user.id)
  if (!job) return notFound(c, '任务不存在')
  return success(c, serializeJob(job))
})

// POST /batch-jobs — 创建并后台执行
app.post('/', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const dramaId = Number(body.drama_id)
  if (!Number.isFinite(dramaId)) return badRequest(c, 'drama_id required')

  const scope = parseBatchScopeFromBody(body.scope)

  try {
    const { job, alreadyRunning } = await createAndStartBatchJob({
      userId: user.id,
      userRole: user.role,
      dramaId,
      scope,
    })
    if (alreadyRunning) {
      return c.json({
        code: 409,
        message: '该项目已有批量任务进行中',
        data: { job: serializeJob(job), already_running: true },
      }, 409)
    }
    return success(c, { job: serializeJob(job) })
  } catch (err: any) {
    return badRequest(c, err?.message || '创建任务失败')
  }
})

// POST /batch-jobs/:id/cancel
app.post('/:id/cancel', async (c) => {
  const user = getAuthUser(c)
  const id = c.req.param('id')
  const job = await requestCancelBatchJob(id, user.id)
  if (!job) return notFound(c, '任务不存在')
  return success(c, serializeJob(job))
})

export default app
