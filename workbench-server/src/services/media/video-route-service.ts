import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import type { VideoGenerationRow } from '../../db/repos/types.js'
import { resolveVideoAspectRatio } from '../../common/media/image-aspect-presets.js'
import type { VideoGenOptions } from '../../common/media/video-gen-options.js'
import { enhanceVideoPrompt, normalizeVideoGenOptions, readVideoGenOptionsFromMetadata } from '../../common/media/video-gen-options.js'
import { generateVideo } from './video-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

export async function resolveEpisodeVideoConfig(storyboardId?: number): Promise<number | undefined> {
  if (!storyboardId) return undefined
  const sb = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!sb) return undefined
  const ep = await episodesRepo.findEpisodeById(sb.episodeId)
  return ep?.dramaVideoConfigId ?? undefined
}

export async function enqueueVideoFromRequest(
  userId: number,
  userRole: string,
  body: Record<string, any>,
): Promise<{ id: number; record: VideoGenerationRow | null }> {
  logTaskStart('VideoAPI', 'generate', {
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    referenceMode: body.reference_mode,
    duration: body.duration,
  })
  logTaskPayload('VideoAPI', 'request body', body)

  const configId = body.config_id ?? await resolveEpisodeVideoConfig(
    body.storyboard_id ? Number(body.storyboard_id) : undefined,
  )

  let episodeMetadata: string | null | undefined
  let storyboardDialogue: string | null | undefined
  if (body.storyboard_id) {
    const sb = await storyboardsRepo.findStoryboardById(Number(body.storyboard_id))
    if (sb) {
      storyboardDialogue = sb.dialogue
      const ep = await episodesRepo.findEpisodeById(sb.episodeId)
      episodeMetadata = ep?.metadata
    }
  }

  const aspectRatio = resolveVideoAspectRatio({
    bodyAspectRatio: body.aspect_ratio,
    episodeMetadata,
  })

  const requestOptions: VideoGenOptions = normalizeVideoGenOptions({
    ...readVideoGenOptionsFromMetadata(episodeMetadata),
    ...(typeof body.generate_audio === 'boolean' ? { generate_audio: body.generate_audio } : {}),
    ...(typeof body.generate_subtitles === 'boolean' ? { generate_subtitles: body.generate_subtitles } : {}),
  })

  const prompt = enhanceVideoPrompt(String(body.prompt || ''), storyboardDialogue, requestOptions)

  const id = await generateVideo({
    userId,
    userRole,
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    prompt,
    model: body.model,
    referenceMode: body.reference_mode,
    imageUrl: body.image_url,
    firstFrameUrl: body.first_frame_url,
    lastFrameUrl: body.last_frame_url,
    referenceImageUrls: body.reference_image_urls,
    duration: body.duration,
    aspectRatio,
    configId,
    generateAudio: requestOptions.generate_audio,
    generateSubtitles: requestOptions.generate_subtitles,
  })

  const record = await videoGenerationsRepo.findVideoGenerationById(id)
  logTaskSuccess('VideoAPI', 'generate', { generationId: id, provider: record?.provider })
  return { id, record }
}

export async function listVideoGenerations(filters: { storyboardId?: number; dramaId?: number }) {
  return videoGenerationsRepo.listVideoGenerations(filters)
}

export async function deleteVideoGeneration(id: number) {
  await videoGenerationsRepo.deleteVideoGeneration(id)
}
