/**
 * 火火 — 角色衍生形态路由业务
 */
import * as characterFormsRepo from '../../db/repos/character-forms/index.js'
import * as charactersRepo from '../../db/repos/characters/index.js'
import { now } from '../../common/http/response.js'
import { generateImage } from '../media/image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

const FORM_PATCH_KEYS: Record<string, string> = {
  name: 'name',
  appearance: 'appearance',
  description: 'description',
  prompt: 'prompt',
  image_url: 'imageUrl',
  local_path: 'localPath',
  sort_order: 'sortOrder',
}

function buildFormPortraitPrompt(formName: string, baseName: string, look?: string | null, bio?: string | null) {
  return `${baseName}·${formName}, ${look || bio || '人物立绘'}, 高质量, 正面, 白色背景`
}

export async function insertCharacterFormRecord(body: {
  drama_id: number
  character_id: number
  name: string
  appearance?: string
  description?: string
  prompt?: string
  sort_order?: number
}) {
  const base = await charactersRepo.findCharacterById(body.character_id)
  if (!base || base.dramaId !== body.drama_id) throw new Error('基础角色不存在或不属于该项目')

  const ts = now()
  const res = await characterFormsRepo.insertCharacterForm({
    dramaId: body.drama_id,
    characterId: body.character_id,
    name: body.name.trim(),
    appearance: body.appearance || null,
    description: body.description || null,
    prompt: body.prompt || null,
    sortOrder: body.sort_order ?? null,
    createdAt: ts,
    updatedAt: ts,
  })
  const row = await characterFormsRepo.findCharacterFormById(res.lastInsertRowid)
  if (!row) throw new Error('创建衍生形态失败')
  return row
}

export async function patchCharacterFormRecord(formId: number, patch: Record<string, unknown>) {
  const rowPatch: Record<string, unknown> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(FORM_PATCH_KEYS)) {
    if (snakeKey in patch) rowPatch[camelKey] = patch[snakeKey]
    else if (camelKey in patch) rowPatch[camelKey] = patch[camelKey]
  }
  await characterFormsRepo.updateCharacterForm(formId, rowPatch)
}

export async function archiveCharacterForm(formId: number) {
  await characterFormsRepo.softDeleteCharacterForm(formId, now())
}

export async function enqueueCharacterFormPortrait(input: {
  userId: number
  userRole: string
  formId: number
  dramaId: number
  episodeId: number
  formName: string
  baseCharacterId: number
  baseCharacterName: string
  appearance?: string | null
  description?: string | null
  prompt?: string | null
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
}) {
  logTaskStart('CharacterFormImage', 'generate', {
    formId: input.formId,
    characterId: input.baseCharacterId,
    episodeId: input.episodeId,
  })

  const baseChar = await charactersRepo.findCharacterById(input.baseCharacterId)
  const refImages = baseChar?.imageUrl ? [String(baseChar.imageUrl).trim()] : []

  try {
    const genId = await generateImage({
      userId: input.userId,
      userRole: input.userRole,
      characterFormId: input.formId,
      dramaId: input.dramaId,
      prompt: input.prompt || buildFormPortraitPrompt(
        input.formName,
        input.baseCharacterName,
        input.appearance,
        input.description,
      ),
      configId: input.dramaImageConfigId ?? undefined,
      referenceImages: refImages.filter(Boolean),
      size: resolveImageAspectRatio({
        bodySize: input.size,
        bodyAspectRatio: input.aspectRatio,
        episodeMetadata: input.episodeMetadata,
        scope: 'character',
      }),
    })
    logTaskSuccess('CharacterFormImage', 'generate', { formId: input.formId, generationId: genId })
    return { image_generation_id: genId }
  } catch (err: any) {
    logTaskError('CharacterFormImage', 'generate', { formId: input.formId, error: err.message })
    throw err
  }
}

export async function batchEnqueueCharacterFormPortraits(input: {
  userId: number
  userRole: string
  episodeId: number
  dramaId: number
  formIds: number[]
  lookup: (id: number) => Promise<{
    formName: string
    baseCharacterId: number
    baseCharacterName: string
    appearance?: string | null
    description?: string | null
    prompt?: string | null
    dramaId: number
  } | null>
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

  for (const formId of input.formIds) {
    const form = await input.lookup(formId)
    if (!form || form.dramaId !== input.dramaId) continue
    try {
      const baseChar = await charactersRepo.findCharacterById(form.baseCharacterId)
      const refImages = baseChar?.imageUrl ? [String(baseChar.imageUrl).trim()] : []
      const genId = await generateImage({
        userId: input.userId,
        userRole: input.userRole,
        characterFormId: formId,
        dramaId: form.dramaId,
        prompt: form.prompt || buildFormPortraitPrompt(
          form.formName,
          form.baseCharacterName,
          form.appearance,
          form.description,
        ),
        configId: input.dramaImageConfigId ?? undefined,
        referenceImages: refImages.filter(Boolean),
        size,
      })
      startedIds.push(genId)
    } catch {}
  }

  return { image_generation_ids: startedIds, count: startedIds.length }
}
