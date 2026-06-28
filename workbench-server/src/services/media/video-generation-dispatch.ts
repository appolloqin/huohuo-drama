import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../../common/http/response.js'
import { readVideoGenOptionsFromMetadata } from '../../common/media/video-gen-options.js'
import { getVideoAdapter } from '../ai/adapters/registry.js'
import type { AIConfig } from '../ai/adapters/types.js'
import { logTaskError, logTaskPayload, logTaskProgress, redactUrl } from '../../common/task/task-logger.js'
import { normalizeMediaReference, normalizeMediaReferenceList } from './media-reference.js'
import { finalizeVideoFromUrl } from '../drama/generation-finalizer.js'
import { formatVideoApiError } from '../../common/media/video-api-errors.js'
import { pollVideoGeneration } from './video-generation-poll.js'

async function resolveRecordVideoGenOptions(record: NonNullable<Awaited<ReturnType<typeof videoGenerationsRepo.findVideoGenerationById>>>) {
  if (record.style) {
    try {
      const parsed = JSON.parse(record.style)
      if (parsed && typeof parsed === 'object') {
        return readVideoGenOptionsFromMetadata(JSON.stringify({ video_gen_options: parsed }))
      }
    } catch {}
  }
  if (!record.storyboardId) return readVideoGenOptionsFromMetadata(null)
  const sb = await storyboardsRepo.findStoryboardById(record.storyboardId)
  if (!sb) return readVideoGenOptionsFromMetadata(null)
  const ep = await episodesRepo.findEpisodeById(sb.episodeId)
  return readVideoGenOptionsFromMetadata(ep?.metadata)
}

export async function runVideoGenerationJob(id: number, config: AIConfig) {
  const adapter = getVideoAdapter(config.provider)

  try {
    const record = await videoGenerationsRepo.findVideoGenerationById(id)
    if (!record) return

    const videoGenOptions = await resolveRecordVideoGenOptions(record)

    logTaskProgress('VideoTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      referenceMode: record.referenceMode,
    })

    const request = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: await normalizeMediaReference(record.imageUrl, 'VideoTask'),
      firstFrameUrl: await normalizeMediaReference(record.firstFrameUrl, 'VideoTask'),
      lastFrameUrl: await normalizeMediaReference(record.lastFrameUrl, 'VideoTask'),
      referenceImageUrls: JSON.stringify(
        await normalizeMediaReferenceList(record.referenceImageUrls, 'VideoTask'),
      ),
      duration: record.duration,
      aspectRatio: record.aspectRatio,
      generateAudio: videoGenOptions.generate_audio,
      generateSubtitles: videoGenOptions.generate_subtitles,
    })

    logTaskProgress('VideoTask', 'request', {
      id,
      provider: config.provider,
      method: request.method,
      url: redactUrl(request.url),
      model: record.model,
      referenceMode: record.referenceMode,
    })
    logTaskPayload('VideoTask', 'request payload', {
      id,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    })

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
    })
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${await response.text()}`)
    }

    const payload = await response.json()
    const parsed = adapter.parseGenerateResponse(payload)

    if (!parsed.isAsync && parsed.videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl: parsed.videoUrl })
      await finalizeVideoFromUrl(id, parsed.videoUrl, record.duration, record.storyboardId)
      return
    }

    await videoGenerationsRepo.updateVideoGeneration(id, {
      taskId: parsed.taskId,
      status: 'processing',
      updatedAt: now(),
    })
    logTaskProgress('VideoTask', 'poll-start', { id, taskId: parsed.taskId, provider: config.provider })

    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId: parsed.taskId, provider: adapter.provider })
      return
    }

    await pollVideoGeneration(id, config, parsed.taskId!, record.storyboardId)
  } catch (err: any) {
    const message = formatVideoApiError(err?.message || err)
    logTaskError('VideoTask', 'process', { id, provider: config.provider, error: message })
    await videoGenerationsRepo.updateVideoGeneration(id, {
      status: 'failed',
      errorMsg: message,
      updatedAt: now(),
    })
  }
}
