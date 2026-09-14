import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import { now } from '../../common/http/response.js'
import type { AIConfig } from '../ai/adapters/types.js'
import { getVideoAdapter } from '../ai/adapters/registry.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn, redactUrl } from '../../common/task/task-logger.js'
import { finalizeVideoFromUrl } from '../drama/generation-finalizer.js'
import { formatVideoApiError } from '../../common/media/video-api-errors.js'
import { resolveRelativeMediaUrl, isPromptIdInComfyQueue, joinComfyUrl, comfyAuthHeaders } from '../ai/adapters/comfyui-workflow.js'
import { isComfyFamilyProvider } from '../ai/adapters/comfyui-mode-resolve.js'

const VIDEO_POLL_INTERVAL_MS = 10_000
/** Non-Comfy cloud providers keep a hard ceiling (~50 min). */
const VIDEO_POLL_MAX_ATTEMPTS = 300
const COMFY_ORPHAN_EMPTY_ATTEMPTS = 4

async function markVideoFailed(id: number, message: string) {
  await videoGenerationsRepo.updateVideoGeneration(id, {
    status: 'failed',
    errorMsg: formatVideoApiError(message),
    updatedAt: now(),
  })
}

async function comfyVideoPromptStillActive(config: AIConfig, taskId: string): Promise<boolean | null> {
  try {
    const resp = await fetch(joinComfyUrl(config.baseUrl, '/queue'), {
      method: 'GET',
      headers: comfyAuthHeaders(config.apiKey),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return null
    return isPromptIdInComfyQueue(await resp.json(), taskId)
  } catch {
    return null
  }
}

export async function pollVideoGeneration(
  id: number,
  config: AIConfig,
  taskId: string,
  storyboardId?: number | null,
) {
  const adapter = getVideoAdapter(config.provider)
  const comfy = isComfyFamilyProvider(config.provider)
  let emptyHistoryStreak = 0
  let attempt = 0

  // ComfyUI: wait until completed / failed / orphaned. Others: attempt ceiling.
  while (comfy || attempt < VIDEO_POLL_MAX_ATTEMPTS) {
    attempt += 1
    await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS))

    try {
      const request = adapter.buildPollRequest(config, taskId)
      logTaskProgress('VideoTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method: request.method,
        url: redactUrl(request.url),
        attempt,
      })

      const response = await fetch(request.url, { method: request.method, headers: request.headers })
      if (!response.ok) continue

      const payload = await response.json()
      const historyKeys = payload && typeof payload === 'object' ? Object.keys(payload) : []
      if (comfy && historyKeys.length === 0) {
        emptyHistoryStreak += 1
        if (emptyHistoryStreak >= COMFY_ORPHAN_EMPTY_ATTEMPTS) {
          const active = await comfyVideoPromptStillActive(config, taskId)
          if (active === false) {
            const message =
              'ComfyUI 队列中已无此任务且 history 为空（工作流可能执行失败、被中断或 history 已清理）'
            logTaskError('VideoTask', 'poll-orphan', { id, taskId, error: message })
            await markVideoFailed(id, message)
            return
          }
          emptyHistoryStreak = Math.max(0, COMFY_ORPHAN_EMPTY_ATTEMPTS - 2)
        }
      } else {
        emptyHistoryStreak = 0
      }

      const pollResp = adapter.parsePollResponse(payload)

      if (pollResp.status === 'completed' && pollResp.videoUrl) {
        const videoUrl = resolveRelativeMediaUrl(config.baseUrl, pollResp.videoUrl) || pollResp.videoUrl
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl })
        await finalizeVideoFromUrl(id, videoUrl, null, storyboardId)
        return
      }

      if (pollResp.status === 'completed' && !pollResp.videoUrl) {
        await markVideoFailed(id, 'ComfyUI 任务已完成但未解析到视频 URL')
        return
      }

      if (pollResp.status === 'failed') {
        const message = pollResp.error || 'Video generation failed'
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: message })
        await markVideoFailed(id, message)
        return
      }
    } catch (err: any) {
      if (!comfy && attempt >= VIDEO_POLL_MAX_ATTEMPTS) {
        logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: err.message })
        await markVideoFailed(id, `Timeout: ${err.message}`)
        return
      }
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt, error: err.message })
    }
  }
}
