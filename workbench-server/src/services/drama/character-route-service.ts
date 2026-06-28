/**
 * 火火 — 角色资源路由业务（立绘生成、音色试听、软删除）
 */
import * as charactersRepo from '../../db/repos/characters/index.js'
import { now } from '../../common/http/response.js'
import { generateVoiceSample } from '../media/tts-generation.js'
import { generateImage } from '../media/image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

/** snake_case 请求字段 → Drizzle camelCase 列名 */
const CAST_PATCH_KEYS: Record<string, string> = {
  name: 'name',
  role: 'role',
  description: 'description',
  appearance: 'appearance',
  personality: 'personality',
  voice_id: 'voiceId',
  voice_provider: 'voiceProvider',
  image_url: 'imageUrl',
  local_path: 'localPath',
}

/** 角色立绘默认正向提示词 */
function buildPortraitPrompt(castName: string, look?: string | null, bio?: string | null) {
  return `${castName}, ${look || bio || '人物立绘'}, 高质量, 正面, 白色背景`
}

export async function patchCharacterRecord(castId: number, patch: Record<string, any>) {
  const rowPatch: Record<string, any> = { updatedAt: now() }

  for (const [snakeKey, camelKey] of Object.entries(CAST_PATCH_KEYS)) {
    if (snakeKey in patch) rowPatch[camelKey] = patch[snakeKey]
    else if (camelKey in patch) rowPatch[camelKey] = patch[camelKey]
  }

  if ('voice_id' in patch || 'voiceId' in patch) {
    rowPatch.voicePreviewUrl = null
  }

  await charactersRepo.updateCharacter(castId, rowPatch)
}

export async function archiveCharacter(castId: number) {
  await charactersRepo.softDeleteCharacter(castId, now())
}

export async function synthesizeCharacterVoiceSample(input: {
  characterId: number
  characterName: string
  voiceId: string
  episodeId: number
  dramaAudioConfigId?: number | null
}) {
  logTaskStart('VoiceSample', 'generate', {
    characterId: input.characterId,
    characterName: input.characterName,
    episodeId: input.episodeId,
    voice: input.voiceId,
  })

  try {
    const samplePath = await generateVoiceSample(
      input.characterName,
      input.voiceId,
      input.dramaAudioConfigId ?? undefined,
    )
    await charactersRepo.updateCharacter(input.characterId, {
      voicePreviewUrl: samplePath,
      updatedAt: now(),
    })

    logTaskSuccess('VoiceSample', 'generate', { characterId: input.characterId, path: samplePath })
    return { voice_preview_url: samplePath }
  } catch (err: any) {
    logTaskError('VoiceSample', 'generate', { characterId: input.characterId, error: err.message })
    throw err
  }
}

export async function enqueueCharacterPortrait(input: {
  userId: number
  userRole: string
  characterId: number
  dramaId: number
  episodeId: number
  name: string
  appearance?: string | null
  description?: string | null
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
}) {
  logTaskStart('CharacterImage', 'generate', {
    characterId: input.characterId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
  })

  try {
    const genId = await generateImage({
      userId: input.userId,
      userRole: input.userRole,
      characterId: input.characterId,
      dramaId: input.dramaId,
      prompt: buildPortraitPrompt(input.name, input.appearance, input.description),
      configId: input.dramaImageConfigId ?? undefined,
      size: resolveImageAspectRatio({
        bodySize: input.size,
        bodyAspectRatio: input.aspectRatio,
        episodeMetadata: input.episodeMetadata,
        scope: 'character',
      }),
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: input.characterId, generationId: genId })
    return { image_generation_id: genId }
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: input.characterId, error: err.message })
    throw err
  }
}

export async function batchEnqueueCharacterPortraits(input: {
  userId: number
  userRole: string
  episodeId: number
  dramaId: number
  characterIds: number[]
  lookup: (id: number) => Promise<{ name: string; appearance?: string | null; description?: string | null; dramaId: number } | null>
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
}) {
  const startedIds: number[] = []
  const size = resolveImageAspectRatio({
    bodySize: input.size,
    bodyAspectRatio: input.aspectRatio,
    episodeMetadata: input.episodeMetadata,
    scope: 'character',
  })

  for (const castId of input.characterIds) {
    const cast = await input.lookup(castId)
    if (!cast || cast.dramaId !== input.dramaId) continue
    try {
      const genId = await generateImage({
        userId: input.userId,
        userRole: input.userRole,
        characterId: castId,
        dramaId: cast.dramaId,
        prompt: buildPortraitPrompt(cast.name, cast.appearance, cast.description),
        configId: input.dramaImageConfigId ?? undefined,
        size,
      })
      startedIds.push(genId)
    } catch {}
  }

  logTaskSuccess('CharacterImage', 'batch-generate', {
    episodeId: input.episodeId,
    requested: input.characterIds.length,
    started: startedIds.length,
  })

  return { count: startedIds.length, ids: startedIds }
}
