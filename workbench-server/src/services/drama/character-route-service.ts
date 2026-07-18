/**
 * 火火 — 角色资源路由业务（立绘生成、音色试听、软删除）
 */
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import { now } from '../../common/http/response.js'
import { generateVoiceSample } from '../media/tts-generation.js'
import { generateImage } from '../media/image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import {
  buildSimpleCharacterPortraitPrompt,
  CHARACTER_REFERENCE_SHEET_DEFAULT_ASPECT,
  refineCharacterReferenceSheetPrompt,
} from './character-reference-sheet-prompt.js'
import {
  applyStyleReferenceToImageGeneration,
  resolveDramaStyleReference,
} from './drama-style-reference.js'

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

async function resolveDramaStyle(dramaId: number) {
  const drama = await dramasRepo.findDramaById(dramaId)
  return drama?.style || null
}

async function resolveCharacterImagePrompt(input: {
  name: string
  role?: string | null
  appearance?: string | null
  description?: string | null
  personality?: string | null
  dramaStyle?: string | null
  referenceSheet?: boolean
  userId: number
  userRole: string
}) {
  if (!input.referenceSheet) {
    return buildSimpleCharacterPortraitPrompt({
      name: input.name,
      role: input.role,
      appearance: input.appearance,
      description: input.description,
      personality: input.personality,
      dramaStyle: input.dramaStyle,
    })
  }
  return refineCharacterReferenceSheetPrompt(
    {
      name: input.name,
      role: input.role,
      appearance: input.appearance,
      description: input.description,
      personality: input.personality,
      dramaStyle: input.dramaStyle,
    },
    {
      userId: input.userId,
      role: input.userRole,
      reason: '角色工业参考图提示词提炼',
      resourceType: 'character',
    },
  )
}

function resolveCharacterGenAspect(input: {
  size?: string | null
  aspectRatio?: string | null
  episodeMetadata?: string | null
  referenceSheet?: boolean
}) {
  const explicit = input.size || input.aspectRatio
  return resolveImageAspectRatio({
    bodySize: input.size,
    bodyAspectRatio: input.aspectRatio
      || (!explicit && input.referenceSheet ? CHARACTER_REFERENCE_SHEET_DEFAULT_ASPECT : null),
    episodeMetadata: input.referenceSheet && !explicit ? null : input.episodeMetadata,
    scope: 'character',
  })
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
  role?: string | null
  appearance?: string | null
  description?: string | null
  personality?: string | null
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
  referenceSheet?: boolean
}) {
  logTaskStart('CharacterImage', 'generate', {
    characterId: input.characterId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    referenceSheet: !!input.referenceSheet,
  })

  try {
    const dramaStyle = await resolveDramaStyle(input.dramaId)
    const styleRef = await resolveDramaStyleReference(input.dramaId)
    const prompt = await resolveCharacterImagePrompt({
      name: input.name,
      role: input.role,
      appearance: input.appearance,
      description: input.description,
      personality: input.personality,
      dramaStyle,
      referenceSheet: !!input.referenceSheet,
      userId: input.userId,
      userRole: input.userRole,
    })
    const genId = await generateImage(applyStyleReferenceToImageGeneration({
      userId: input.userId,
      userRole: input.userRole,
      characterId: input.characterId,
      dramaId: input.dramaId,
      prompt,
      configId: input.dramaImageConfigId ?? undefined,
      size: resolveCharacterGenAspect(input),
    }, styleRef))
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
  lookup: (id: number) => Promise<{
    name: string
    role?: string | null
    appearance?: string | null
    description?: string | null
    personality?: string | null
    dramaId: number
  } | null>
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
  referenceSheet?: boolean
}) {
  const startedIds: number[] = []
  const errors: string[] = []
  const size = resolveCharacterGenAspect(input)

  const dramaStyle = await resolveDramaStyle(input.dramaId)
  const styleRef = await resolveDramaStyleReference(input.dramaId)
  for (const castId of input.characterIds) {
    const cast = await input.lookup(castId)
    if (!cast || cast.dramaId !== input.dramaId) continue
    try {
      const prompt = await resolveCharacterImagePrompt({
        name: cast.name,
        role: cast.role,
        appearance: cast.appearance,
        description: cast.description,
        personality: cast.personality,
        dramaStyle,
        referenceSheet: !!input.referenceSheet,
        userId: input.userId,
        userRole: input.userRole,
      })
      const genId = await generateImage(applyStyleReferenceToImageGeneration({
        userId: input.userId,
        userRole: input.userRole,
        characterId: castId,
        dramaId: cast.dramaId,
        prompt,
        configId: input.dramaImageConfigId ?? undefined,
        size,
      }, styleRef))
      startedIds.push(genId)
    } catch (err: any) {
      errors.push(`${cast.name}: ${err?.message || '失败'}`)
    }
  }

  logTaskSuccess('CharacterImage', 'batch-generate', {
    episodeId: input.episodeId,
    requested: input.characterIds.length,
    started: startedIds.length,
    referenceSheet: !!input.referenceSheet,
  })

  if (input.referenceSheet && !startedIds.length && errors.length) {
    throw new Error(errors.slice(0, 3).join('；'))
  }

  return { count: startedIds.length, ids: startedIds, errors }
}
