/**
 * 移动端指令路由 — 映射到现有 batch-jobs 服务，不重复业务逻辑
 */
import {
  createAndStartBatchJob,
  getBatchJobForUser,
  listActiveBatchJobsForUser,
  requestCancelBatchJob,
} from '../batch/batch-job-service.js'
import { dramaOwnedByUser } from '../drama/drama-access-service.js'
import { assertUserCanGenerate } from '../credits/credits.js'
import type { BatchScope } from '../batch/batch-generation.js'

export class MobileCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MobileCommandError'
  }
}

export type MobileCommandIntent =
  | 'batch_write_remaining'
  | 'batch_write_range'
  | 'batch_cancel'
  | 'batch_status'

export type MobileCommandBody = {
  intent?: MobileCommandIntent | string
  drama_id?: number
  scope?: BatchScope
  text?: string
  job_id?: string
}

function parseTextIntent(text: string): Partial<MobileCommandBody> {
  const t = text.trim()
  if (!t) return {}

  if (/停止|取消|停掉/.test(t)) return { intent: 'batch_cancel' }
  if (/进度|状态|查看任务/.test(t)) return { intent: 'batch_status' }

  if (/剩余|接着写|续写/.test(t)) return { intent: 'batch_write_remaining' }

  const range = t.match(/第?\s*(\d+)\s*[~\-到至]\s*第?\s*(\d+)/)
  if (range) {
    return {
      intent: 'batch_write_range',
      scope: {
        mode: 'range',
        from_chapter: Number(range[1]),
        to_chapter: Number(range[2]),
      },
    }
  }

  const nextN = t.match(/接下来\s*(\d+)\s*[章集]/)
  if (nextN) {
    return {
      intent: 'batch_write_range',
      scope: { mode: 'range', from_chapter: 1, to_chapter: Number(nextN[1]) },
    }
  }

  const single = t.match(/写?\s*第?\s*(\d+)\s*[章集]/)
  if (single) {
    const n = Number(single[1])
    return {
      intent: 'batch_write_range',
      scope: { mode: 'range', from_chapter: n, to_chapter: n },
    }
  }

  return {}
}

function resolveIntent(body: MobileCommandBody): MobileCommandBody {
  if (body.intent) return body
  if (body.text) {
    const parsed = parseTextIntent(body.text)
    return { ...body, ...parsed }
  }
  throw new MobileCommandError('请指定 intent 或 text')
}

export async function executeMobileCommand(args: {
  userId: number
  userRole: string
  body: MobileCommandBody
}) {
  const resolved = resolveIntent(args.body)
  const intent = String(resolved.intent || '') as MobileCommandIntent

  if (intent === 'batch_status') {
    const active = await listActiveBatchJobsForUser(args.userId)
    const dramaId = Number(resolved.drama_id)
    const filtered = Number.isFinite(dramaId)
      ? active.filter(j => j.dramaId === dramaId)
      : active
    return {
      intent,
      active: filtered,
    }
  }

  const dramaId = Number(resolved.drama_id)
  if (!Number.isFinite(dramaId)) throw new MobileCommandError('drama_id required')

  const drama = await dramaOwnedByUser(dramaId, args.userId)
  if (!drama) throw new MobileCommandError('项目不存在')

  if (intent === 'batch_cancel') {
    const jobId = resolved.job_id
    if (jobId) {
      const job = await requestCancelBatchJob(jobId, args.userId)
      if (!job) throw new MobileCommandError('任务不存在')
      return { intent, job }
    }
    const active = await listActiveBatchJobsForUser(args.userId)
    const job = active.find(j => j.dramaId === dramaId)
    if (!job) throw new MobileCommandError('该项目无进行中的批量任务')
    const cancelled = await requestCancelBatchJob(job.id, args.userId)
    return { intent, job: cancelled }
  }

  if (intent === 'batch_write_remaining' || intent === 'batch_write_range') {
    await assertUserCanGenerate(args.userId, args.userRole)
    const scope: BatchScope = intent === 'batch_write_remaining'
      ? { mode: 'remaining', ...(resolved.scope || {}) }
      : {
        mode: 'range',
        from_chapter: resolved.scope?.from_chapter,
        to_chapter: resolved.scope?.to_chapter,
        chapter_numbers: resolved.scope?.chapter_numbers,
        overwrite: resolved.scope?.overwrite,
        production_pipeline: resolved.scope?.production_pipeline,
      }

    if (intent === 'batch_write_range') {
      const from = Number(scope.from_chapter)
      if (!Number.isFinite(from) || from < 1) {
        throw new MobileCommandError('batch_write_range 需要有效的 from_chapter')
      }
    }

    const { job, alreadyRunning } = await createAndStartBatchJob({
      userId: args.userId,
      userRole: args.userRole,
      dramaId,
      scope,
    })
    return {
      intent,
      job,
      already_running: Boolean(alreadyRunning),
      parsed_from_text: Boolean(args.body.text && !args.body.intent),
    }
  }

  throw new MobileCommandError(`不支持的指令: ${intent}`)
}

export async function getMobileCommandPreview(body: MobileCommandBody) {
  const resolved = resolveIntent(body)
  return {
    intent: resolved.intent,
    drama_id: resolved.drama_id,
    scope: resolved.scope,
    requires_confirmation: true,
  }
}

export async function getMobileJobForUser(jobId: string, userId: number) {
  return getBatchJobForUser(jobId, userId)
}
