import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import type { ImageGenerationRow } from '../../db/repos/types.js'
import { generateImage } from './image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

export async function resolveEpisodeImageConfig(storyboardId?: number): Promise<number | undefined> {
  if (!storyboardId) return undefined
  const sb = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!sb) return undefined
  const ep = await episodesRepo.findEpisodeById(sb.episodeId)
  return ep?.dramaImageConfigId ?? undefined
}

export async function enqueueImageFromRequest(
  userId: number,
  userRole: string,
  body: Record<string, any>,
): Promise<{ id: number; record: ImageGenerationRow | null }> {
  logTaskStart('ImageAPI', 'generate', {
    storyboardId: body.storyboard_id,
    sceneId: body.scene_id,
    characterId: body.character_id,
    dramaId: body.drama_id,
    frameType: body.frame_type,
  })
  logTaskPayload('ImageAPI', 'request body', body)

  const configId = body.config_id ?? await resolveEpisodeImageConfig(
    body.storyboard_id ? Number(body.storyboard_id) : undefined,
  )

  let episodeMetadata: string | null | undefined
  if (body.storyboard_id) {
    const sb = await storyboardsRepo.findStoryboardById(Number(body.storyboard_id))
    if (sb) {
      const ep = await episodesRepo.findEpisodeById(sb.episodeId)
      episodeMetadata = ep?.metadata
    }
  }

  const size = resolveImageAspectRatio({
    bodySize: body.size,
    bodyAspectRatio: body.aspect_ratio,
    episodeMetadata,
    scope: 'shot',
  })

  const id = await generateImage({
    userId,
    userRole,
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    sceneId: body.scene_id,
    characterId: body.character_id,
    prompt: body.prompt,
    model: body.model,
    size,
    referenceImages: body.reference_images,
    frameType: body.frame_type,
    configId,
  })

  const record = await imageGenerationsRepo.findImageGenerationById(id)
  logTaskSuccess('ImageAPI', 'generate', { generationId: id, provider: record?.provider })
  return { id, record }
}

export async function listImageGenerations(filters: { storyboardId?: number; dramaId?: number }) {
  return imageGenerationsRepo.listImageGenerations(filters)
}

export async function deleteImageGeneration(id: number) {
  await imageGenerationsRepo.deleteImageGeneration(id)
}
