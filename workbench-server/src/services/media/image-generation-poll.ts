import type { ImageProviderAdapter } from '../ai/adapters/types.js'
import type { AIConfig } from '../ai/adapters/types.js'
import { getImageAdapter } from '../ai/adapters/registry.js'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import { now } from '../../common/http/response.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn, redactUrl } from '../../common/task/task-logger.js'
import { finalizeImageFromBase64, finalizeImageFromUrl, markLinkedSceneFailed } from '../drama/generation-finalizer.js'

const IMAGE_POLL_INTERVAL_MS = 5_000
const IMAGE_POLL_MAX_MS = 600_000
const IMAGE_POLL_MAX_ATTEMPTS = 120

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
    logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl: pollResp.imageUrl })
    await finalizeImageFromUrl(id, config.provider, pollResp.imageUrl)
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

  if (pollResp.status === 'failed') {
    const message = pollResp.error || 'Generation failed'
    logTaskError('ImageTask', 'poll-failed', { id, taskId, error: message })
    await markImageFailed(id, message)
    return true
  }

  return false
}

export async function pollImageGeneration(id: number, config: AIConfig, taskId: string) {
  const adapter = getImageAdapter(config.provider)
  const startedAt = Date.now()

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
      if (!response.ok) continue

      const payload = await response.json()
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
}
