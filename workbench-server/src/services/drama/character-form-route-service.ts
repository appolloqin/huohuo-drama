/**
 * 火火 — 角色衍生形态路由业务
 */
import * as characterFormsRepo from '../../db/repos/character-forms/index.js'
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import { now } from '../../common/http/response.js'
import { applyDramaStyleToPrompt } from '../../common/drama/drama-style.js'
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

const FORM_PATCH_KEYS: Record<string, string> = {
  name: 'name',
  appearance: 'appearance',
  description: 'description',
  prompt: 'prompt',
  image_url: 'imageUrl',
  local_path: 'localPath',
  sort_order: 'sortOrder',
}

async function resolveDramaStyle(dramaId: number) {
  const drama = await dramasRepo.findDramaById(dramaId)
  return drama?.style || null
}

function resolveFormGenAspect(input: {
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

async function resolveFormImagePrompt(input: {
  formName: string
  baseCharacterName: string
  appearance?: string | null
  description?: string | null
  prompt?: string | null
  baseAppearance?: string | null
  dramaStyle?: string | null
  referenceSheet?: boolean
  userId: number
  userRole: string
  formId?: number
}) {
  if (input.referenceSheet) {
    const refined = await refineCharacterReferenceSheetPrompt(
      {
        name: input.baseCharacterName,
        formName: input.formName,
        baseCharacterName: input.baseCharacterName,
        appearance: input.appearance,
        baseAppearance: input.baseAppearance,
        description: input.description,
        dramaStyle: input.dramaStyle,
      },
      {
        userId: input.userId,
        role: input.userRole,
        reason: '衍生形态工业参考图提示词提炼',
        resourceType: 'character_form',
        resourceId: input.formId,
      },
    )
    if (input.formId) {
      await characterFormsRepo.updateCharacterForm(input.formId, {
        prompt: refined,
        updatedAt: now(),
      })
    }
    return refined
  }

  if (input.prompt?.trim()) {
    return applyDramaStyleToPrompt(input.prompt, input.dramaStyle, 'en')
  }
  return buildSimpleCharacterPortraitPrompt({
    name: input.baseCharacterName,
    formName: input.formName,
    baseCharacterName: input.baseCharacterName,
    appearance: input.appearance,
    description: input.description,
    dramaStyle: input.dramaStyle,
  })
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
  referenceSheet?: boolean
}) {
  logTaskStart('CharacterFormImage', 'generate', {
    formId: input.formId,
    characterId: input.baseCharacterId,
    episodeId: input.episodeId,
    referenceSheet: !!input.referenceSheet,
  })

  const baseChar = await charactersRepo.findCharacterById(input.baseCharacterId)
  const refImages = baseChar?.imageUrl ? [String(baseChar.imageUrl).trim()] : []
  const dramaStyle = await resolveDramaStyle(input.dramaId)
  const styleRef = await resolveDramaStyleReference(input.dramaId)

  try {
    const prompt = await resolveFormImagePrompt({
      formName: input.formName,
      baseCharacterName: input.baseCharacterName,
      appearance: input.appearance,
      description: input.description,
      prompt: input.prompt,
      baseAppearance: baseChar?.appearance,
      dramaStyle,
      referenceSheet: !!input.referenceSheet,
      userId: input.userId,
      userRole: input.userRole,
      formId: input.formId,
    })
    const genId = await generateImage(applyStyleReferenceToImageGeneration({
      userId: input.userId,
      userRole: input.userRole,
      characterFormId: input.formId,
      dramaId: input.dramaId,
      prompt,
      configId: input.dramaImageConfigId ?? undefined,
      referenceImages: refImages.filter(Boolean),
      size: resolveFormGenAspect(input),
    }, styleRef))
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
  referenceSheet?: boolean
}) {
  const startedIds: number[] = []
  const errors: string[] = []
  const size = resolveFormGenAspect(input)

  const dramaStyle = await resolveDramaStyle(input.dramaId)
  const styleRef = await resolveDramaStyleReference(input.dramaId)
  for (const formId of input.formIds) {
    const form = await input.lookup(formId)
    if (!form || form.dramaId !== input.dramaId) continue
    try {
      const baseChar = await charactersRepo.findCharacterById(form.baseCharacterId)
      const refImages = baseChar?.imageUrl ? [String(baseChar.imageUrl).trim()] : []
      const prompt = await resolveFormImagePrompt({
        formName: form.formName,
        baseCharacterName: form.baseCharacterName,
        appearance: form.appearance,
        description: form.description,
        prompt: form.prompt,
        baseAppearance: baseChar?.appearance,
        dramaStyle,
        referenceSheet: !!input.referenceSheet,
        userId: input.userId,
        userRole: input.userRole,
        formId,
      })
      const genId = await generateImage(applyStyleReferenceToImageGeneration({
        userId: input.userId,
        userRole: input.userRole,
        characterFormId: formId,
        dramaId: form.dramaId,
        prompt,
        configId: input.dramaImageConfigId ?? undefined,
        referenceImages: refImages.filter(Boolean),
        size,
      }, styleRef))
      startedIds.push(genId)
    } catch (err: any) {
      errors.push(`${form.formName}: ${err?.message || '失败'}`)
    }
  }

  if (input.referenceSheet && !startedIds.length && errors.length) {
    throw new Error(errors.slice(0, 3).join('；'))
  }

  return { image_generation_ids: startedIds, count: startedIds.length, errors }
}
