import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import { now } from '../../common/http/response.js'
import type { AIConfig } from '../ai/adapters/types.js'
import { getVideoAdapter } from '../ai/adapters/registry.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn, redactUrl } from '../../common/task/task-logger.js'
import { finalizeVideoFromUrl } from '../drama/generation-finalizer.js'
import { formatVideoApiError } from '../../common/media/video-api-errors.js'

const VIDEO_POLL_INTERVAL_MS = 10_000
const VIDEO_POLL_MAX_ATTEMPTS = 300

async function markVideoFailed(id: number, message: string) {
  await videoGenerationsRepo.updateVideoGeneration(id, {
    status: 'failed',
    errorMsg: formatVideoApiError(message),
    updatedAt: now(),
  })
}

export async function pollVideoGeneration(
  id: number,
  config: AIConfig,
  taskId: string,
  storyboardId?: number | null,
) {
  const adapter = getVideoAdapter(config.provider)

  for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS))

    try {
      const request = adapter.buildPollRequest(config, taskId)
      logTaskProgress('VideoTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method: request.method,
        url: redactUrl(request.url),
        attempt: attempt + 1,
      })

      const response = await fetch(request.url, { method: request.method, headers: request.headers })
      if (!response.ok) continue

      const payload = await response.json()
      const pollResp = adapter.parsePollResponse(payload)

      if (pollResp.status === 'completed' && pollResp.videoUrl) {
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollResp.videoUrl })
        await finalizeVideoFromUrl(id, pollResp.videoUrl, null, storyboardId)
        return
      }

      if (pollResp.status === 'failed') {
        const message = pollResp.error || 'Video generation failed'
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: message })
        await markVideoFailed(id, message)
        return
      }
    } catch (err: any) {
      if (attempt === VIDEO_POLL_MAX_ATTEMPTS - 1) {
        logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: err.message })
        await markVideoFailed(id, `Timeout: ${err.message}`)
        return
      }
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: attempt + 1, error: err.message })
    }
  }
}
