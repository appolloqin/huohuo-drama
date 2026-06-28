import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import { logTaskError, logTaskProgress, logTaskSuccess, logTaskWarn } from '../../common/task/task-logger.js'
import { finalizeVideoFromUrl } from '../drama/generation-finalizer.js'
import { now } from '../../common/http/response.js'

interface ViduCallbackPayload {
  task_id?: string
  state?: string
  video_url?: string
  error?: string
}

export async function handleViduWebhook(payload: ViduCallbackPayload) {
  const { task_id: taskId, state, video_url: videoUrl, error } = payload

  logTaskProgress('Webhook', 'vidu-callback', {
    taskId,
    state,
    hasVideoUrl: !!videoUrl,
    error,
  })

  if (!taskId) {
    logTaskWarn('Webhook', 'vidu-callback-missing-task-id', { state })
    return { status: 400 as const, body: { message: 'Missing task_id' } }
  }

  const record = await videoGenerationsRepo.findVideoGenerationByTaskId(taskId)
  if (!record) {
    logTaskWarn('Webhook', 'vidu-task-not-found', { taskId })
    return { status: 200 as const, body: { message: 'Task not found' } }
  }

  if (state === 'success' && videoUrl) {
    try {
      await finalizeVideoFromUrl(record.id, videoUrl, record.duration, record.storyboardId)
      logTaskSuccess('Webhook', 'vidu-video-updated', {
        taskId,
        generationId: record.id,
        storyboardId: record.storyboardId,
      })
      return { status: 200 as const, body: { message: 'Video updated successfully' } }
    } catch (err: any) {
      const message = err?.message || 'download failed'
      logTaskError('Webhook', 'vidu-download-failed', {
        taskId,
        generationId: record.id,
        error: message,
      })
      await videoGenerationsRepo.updateVideoGeneration(record.id, {
        status: 'failed',
        errorMsg: `Webhook download failed: ${message}`,
        updatedAt: now(),
      })
      return { status: 400 as const, body: { message } }
    }
  }

  if (state === 'failed') {
    const message = error || 'Vidu generation failed'
    logTaskError('Webhook', 'vidu-generation-failed', {
      taskId,
      generationId: record.id,
      error: message,
    })
    await videoGenerationsRepo.updateVideoGeneration(record.id, {
      status: 'failed',
      errorMsg: message,
      updatedAt: now(),
    })
    return { status: 200 as const, body: { message: 'Error recorded' } }
  }

  logTaskProgress('Webhook', 'vidu-status-noted', {
    taskId,
    generationId: record.id,
    state,
  })
  return { status: 200 as const, body: { message: 'Status noted' } }
}
