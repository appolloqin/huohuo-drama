import type { ImageProviderAdapter } from '../ai/adapters/types.js'
import type { AIConfig } from '../ai/adapters/types.js'
import { getImageAdapter } from '../ai/adapters/registry.js'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import { now } from '../../common/http/response.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn, redactUrl } from '../../common/task/task-logger.js'
import { finalizeImageFromBase64, finalizeImageFromUrl, markLinkedSceneFailed } from '../drama/generation-finalizer.js'
import {
  comfyAuthHeaders,
  isPromptIdInComfyQueue,
  joinComfyUrl,
  resolveRelativeMediaUrl,
} from '../ai/adapters/comfyui-workflow.js'
import { isComfyFamilyProvider } from '../ai/adapters/comfyui-mode-resolve.js'

const IMAGE_POLL_INTERVAL_MS = 5_000
const IMAGE_POLL_MAX_MS = 600_000
const IMAGE_POLL_MAX_ATTEMPTS = 120
/** Empty history while not in queue — fail after this many consecutive empty polls. */
const COMFY_ORPHAN_EMPTY_ATTEMPTS = 6

async function markImageFailed(id: number, message: string) {
  await imageGenerationsRepo.updateImageGeneration(id, {
    status: 'failed',
    errorMsg: message,
    updatedAt: now(),
  })
  await markLinkedSceneFailed(id)
}

async function handlePollOutcome(
  id: number,
  config: AIConfig,
  taskId: string,
  adapter: ImageProviderAdapter,
  result: any,
  pollResp: ReturnType<ImageProviderAdapter['parsePollResponse']>,
) {
  if (pollResp.status === 'completed' && pollResp.imageUrl) {
    const imageUrl = resolveRelativeMediaUrl(config.baseUrl, pollResp.imageUrl) || pollResp.imageUrl
    logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl })
    await finalizeImageFromUrl(id, config.provider, imageUrl)
    return true
  }

  if (pollResp.status === 'completed' && adapter.provider === 'gemini') {
    const inline = adapter.extractImageBase64(result)
    if (inline) {
      logTaskSuccess('ImageTask', 'poll-base64-complete', { id, taskId, mimeType: inline.mimeType })
      await finalizeImageFromBase64(id, config.provider, inline.data, inline.mimeType)
      return true
    }
  }

  if (pollResp.status === 'completed' && !pollResp.imageUrl) {
    const message = '生成任务已完成但未解析到图片 URL'
    logTaskError('ImageTask', 'poll-failed', { id, taskId, error: message })
    await markImageFailed(id, message)
    return true
  }

  if (pollResp.status === 'failed') {
    const message = pollResp.error || 'Generation failed'
    logTaskError('ImageTask', 'poll-failed', { id, taskId, error: message })
    await markImageFailed(id, message)
    return true
  }

  return false
}

async function comfyPromptStillActive(config: AIConfig, taskId: string): Promise<boolean | null> {
  try {
    const resp = await fetch(joinComfyUrl(config.baseUrl, '/queue'), {
      method: 'GET',
      headers: comfyAuthHeaders(config.apiKey),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) return null
    const json = await resp.json()
    return isPromptIdInComfyQueue(json, taskId)
  } catch {
    return null
  }
}

export async function pollImageGeneration(id: number, config: AIConfig, taskId: string) {
  const adapter = getImageAdapter(config.provider)
  const startedAt = Date.now()
  const comfy = isComfyFamilyProvider(config.provider)
  let emptyHistoryStreak = 0

  for (let attempt = 0; attempt < IMAGE_POLL_MAX_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt >= IMAGE_POLL_MAX_MS) {
      logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: 'Polling exceeded 10 minutes' })
      await markImageFailed(id, 'Timeout: Polling exceeded 10 minutes')
      return
    }

    await new Promise(resolve => setTimeout(resolve, IMAGE_POLL_INTERVAL_MS))
    if (Date.now() - startedAt >= IMAGE_POLL_MAX_MS) {
      await markImageFailed(id, 'Timeout: Polling exceeded 10 minutes')
      return
    }

    try {
      const request = adapter.buildPollRequest(config, taskId)
      logTaskProgress('ImageTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method: request.method,
        url: redactUrl(request.url),
        attempt: attempt + 1,
      })

      const remainingMs = Math.max(1_000, IMAGE_POLL_MAX_MS - (Date.now() - startedAt))
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: AbortSignal.timeout(remainingMs),
      })
      if (!response.ok) {
        logTaskWarn('ImageTask', 'poll-http', { id, taskId, status: response.status, attempt: attempt + 1 })
        continue
      }

      const payload = await response.json()
      const historyKeys = payload && typeof payload === 'object' ? Object.keys(payload) : []
      if (comfy && historyKeys.length === 0) {
        emptyHistoryStreak += 1
        if (emptyHistoryStreak >= COMFY_ORPHAN_EMPTY_ATTEMPTS) {
          const active = await comfyPromptStillActive(config, taskId)
          if (active === false) {
            const message =
              'ComfyUI 队列中已无此任务且 history 为空（工作流可能执行失败、被中断或 history 已清理）'
            logTaskError('ImageTask', 'poll-orphan', { id, taskId, error: message })
            await markImageFailed(id, message)
            return
          }
          // Still running or queue unreachable — keep waiting, don't re-check every tick.
          emptyHistoryStreak = Math.max(0, COMFY_ORPHAN_EMPTY_ATTEMPTS - 2)
        }
      } else {
        emptyHistoryStreak = 0
      }

      const pollResp = adapter.parsePollResponse(payload)
      const finished = await handlePollOutcome(id, config, taskId, adapter, payload, pollResp)
      if (finished) return
    } catch (err: any) {
      const timedOut = attempt === IMAGE_POLL_MAX_ATTEMPTS - 1 || Date.now() - startedAt >= IMAGE_POLL_MAX_MS
      if (timedOut) {
        logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: err.message })
        await markImageFailed(id, `Timeout: ${err.message}`)
        return
      }
      logTaskWarn('ImageTask', 'poll-retry', { id, taskId, attempt: attempt + 1, error: err.message })
    }
  }

  await markImageFailed(id, 'Timeout: exceeded max poll attempts without result')
}
