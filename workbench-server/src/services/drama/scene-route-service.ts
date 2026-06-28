/**
 * 火火 — 场景资源路由业务（鉴权、角色参考图、生成状态）
 */
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import { now } from '../../common/http/response.js'
import { generateImage } from '../media/image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

export async function insertSceneRecord(body: {
  drama_id: number
  episode_id?: number
  location: string
  time?: string
  prompt?: string
}) {
  const ts = now()
  const res = await scenesRepo.insertScene({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
    createdAt: ts,
    updatedAt: ts,
  })

  const row = await scenesRepo.findSceneById(res.lastInsertRowid)
  if (!row) throw new Error('创建场景失败')
  return row
}

export async function patchSceneRecord(sceneId: number, patch: Record<string, any>) {
  const rowPatch: Record<string, any> = { updatedAt: now() }
  if (patch.location !== undefined) rowPatch.location = patch.location
  if (patch.time !== undefined) rowPatch.time = patch.time
  if (patch.prompt !== undefined) rowPatch.prompt = patch.prompt
  await scenesRepo.updateScene(sceneId, rowPatch)
}

export async function removeSceneRecord(sceneId: number) {
  await scenesRepo.deleteScene(sceneId)
}

/** 取本集首个有立绘的角色图作为场景生成参考 */
async function pickEpisodeCastRef(episodeId: number): Promise<string[]> {
  const castLinks = (await episodesRepo.listEpisodeCharacterLinks(episodeId)).map((link) => link.characterId)
  const chars = await dramasRepo.listCharactersByDrama(
    (await episodesRepo.findEpisodeById(episodeId))?.dramaId || 0,
  )

  return chars
    .filter((ch) => castLinks.includes(ch.id) && !ch.deletedAt && !!ch.imageUrl)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
    .map((ch) => String(ch.imageUrl || '').trim())
    .filter(Boolean)
    .slice(0, 1)
}

export async function enqueueSceneBackdrop(input: {
  userId: number
  userRole: string
  sceneId: number
  dramaId: number
  episodeId: number
  location: string
  time?: string | null
  prompt?: string | null
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
}) {
  const backdropPrompt = input.prompt
    || `${input.location}, ${input.time || ''}, 高质量场景, 电影感`

  logTaskStart('SceneImage', 'generate', {
    sceneId: input.sceneId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    location: input.location,
  })

  await scenesRepo.updateScene(input.sceneId, { status: 'processing', updatedAt: now() })

  try {
    const genId = await generateImage({
      userId: input.userId,
      userRole: input.userRole,
      sceneId: input.sceneId,
      dramaId: input.dramaId,
      prompt: backdropPrompt,
      configId: input.dramaImageConfigId ?? undefined,
      referenceImages: await pickEpisodeCastRef(input.episodeId),
      size: resolveImageAspectRatio({
        bodySize: input.size,
        bodyAspectRatio: input.aspectRatio,
        episodeMetadata: input.episodeMetadata,
        scope: 'scene',
      }),
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId: input.sceneId, generationId: genId })
    return { image_generation_id: genId }
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: input.sceneId, error: err.message })
    await scenesRepo.updateScene(input.sceneId, { status: 'failed', updatedAt: now() })
    throw err
  }
}
