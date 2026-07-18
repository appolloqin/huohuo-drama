/**
 * 火火 — 场景资源路由业务（空镜 / 人物合成双模式）
 */
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as characterFormsRepo from '../../db/repos/character-forms/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as propsRepo from '../../db/repos/props/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import { now } from '../../common/http/response.js'
import { applyDramaStyleToPrompt } from '../../common/drama/drama-style.js'
import { generateImage } from '../media/image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import {
  applyStyleReferenceToImageGeneration,
  resolveDramaStyleReference,
} from './drama-style-reference.js'

export type SceneComposeConfig = {
  character_form_ids?: number[]
  prop_ids?: number[]
  character_ids?: number[]
}

function parseComposeConfig(raw?: string | null): SceneComposeConfig {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed as SceneComposeConfig : {}
  } catch {
    return {}
  }
}

function uniqueNumbers(ids: number[] | undefined): number[] {
  return [...new Set((ids || []).map(Number).filter(Boolean))]
}

export async function insertSceneRecord(body: {
  drama_id: number
  episode_id?: number
  location: string
  time?: string
  prompt?: string
  scene_mode?: string
  compose_config?: SceneComposeConfig
}) {
  const ts = now()
  const res = await scenesRepo.insertScene({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
    sceneMode: body.scene_mode || 'backdrop',
    composeConfig: body.compose_config ? JSON.stringify(body.compose_config) : null,
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
  if (patch.scene_mode !== undefined) rowPatch.sceneMode = patch.scene_mode
  if (patch.compose_config !== undefined) {
    rowPatch.composeConfig = typeof patch.compose_config === 'string'
      ? patch.compose_config
      : JSON.stringify(patch.compose_config)
  }
  await scenesRepo.updateScene(sceneId, rowPatch)
}

export async function removeSceneRecord(sceneId: number) {
  await scenesRepo.deleteScene(sceneId)
}

async function resolveFormImageUrls(formIds: number[]): Promise<string[]> {
  const urls: string[] = []
  for (const formId of formIds) {
    const form = await characterFormsRepo.findCharacterFormById(formId)
    if (!form || form.deletedAt) continue
    if (form.imageUrl) {
      urls.push(String(form.imageUrl).trim())
      continue
    }
    const base = await charactersRepo.findCharacterById(form.characterId)
    if (base?.imageUrl) urls.push(String(base.imageUrl).trim())
  }
  return urls.filter(Boolean)
}

async function resolveCharacterImageUrls(characterIds: number[]): Promise<string[]> {
  if (!characterIds.length) return []
  const chars = await charactersRepo.listCharactersByIds(characterIds)
  return chars
    .filter(ch => !ch.deletedAt && ch.imageUrl)
    .map(ch => String(ch.imageUrl).trim())
    .filter(Boolean)
}

async function resolvePropImageUrls(propIds: number[]): Promise<string[]> {
  if (!propIds.length) return []
  const props = await propsRepo.listPropsByIds(propIds)
  return props
    .filter(p => !p.deletedAt && p.imageUrl)
    .map(p => String(p.imageUrl).trim())
    .filter(Boolean)
}

/** 推荐：与选中角色/形态关联的道具 */
async function recommendLinkedPropIds(
  dramaId: number,
  characterIds: number[],
  formIds: number[],
): Promise<number[]> {
  const allProps = await propsRepo.listActivePropsByDrama(dramaId)
  const charSet = new Set(characterIds)
  const formSet = new Set(formIds)
  return allProps
    .filter(p => {
      if (p.characterFormId && formSet.has(p.characterFormId)) return true
      if (p.characterId && charSet.has(p.characterId) && !p.characterFormId) return true
      return false
    })
    .map(p => p.id)
}

function buildScenePrompt(input: {
  mode: 'backdrop' | 'composed'
  location: string
  time?: string | null
  basePrompt?: string | null
  characterNames: string[]
  propNames: string[]
  formNames: string[]
  dramaStyle?: string | null
}) {
  const place = `${input.location}, ${input.time || ''}`.trim()
  const propText = input.propNames.length ? `，道具：${input.propNames.join('、')}` : ''
  const castText = [...input.formNames, ...input.characterNames].filter(Boolean).join('、')

  const raw = input.mode === 'composed'
    ? (input.basePrompt
      || `${place}，人物合成场景${castText ? `，角色：${castText}` : ''}${propText}，高质量，角色与道具自然融入环境`)
    : (input.basePrompt
      || `${place}，空镜背景场景，无人物${propText}，高质量环境布景`)

  return applyDramaStyleToPrompt(raw, input.dramaStyle, input.basePrompt ? 'en' : 'zh')
}

async function collectSceneReferenceImages(input: {
  mode: 'backdrop' | 'composed'
  characterIds: number[]
  formIds: number[]
  propIds: number[]
}): Promise<string[]> {
  const refs: string[] = []
  const push = (value?: string | null) => {
    const v = String(value || '').trim()
    if (!v || refs.includes(v) || refs.length >= 6) return
    refs.push(v)
  }

  if (input.mode === 'composed') {
    for (const url of await resolveFormImageUrls(input.formIds)) push(url)
    for (const url of await resolveCharacterImageUrls(input.characterIds)) push(url)
    for (const url of await resolvePropImageUrls(input.propIds)) push(url)
    return refs
  }

  for (const url of await resolveFormImageUrls(input.formIds)) push(url)
  for (const url of await resolvePropImageUrls(input.propIds)) push(url)
  if (!refs.length) {
    for (const url of await resolveCharacterImageUrls(input.characterIds)) push(url)
  }
  return refs
}

export async function enqueueSceneImage(input: {
  userId: number
  userRole: string
  sceneId: number
  dramaId: number
  episodeId: number
  location: string
  time?: string | null
  prompt?: string | null
  sceneMode?: 'backdrop' | 'composed' | null
  characterFormIds?: number[]
  propIds?: number[]
  characterIds?: number[]
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
}) {
  const sceneRow = await scenesRepo.findSceneById(input.sceneId)
  const savedConfig = parseComposeConfig(sceneRow?.composeConfig)
  const mode = (input.sceneMode || sceneRow?.sceneMode || 'backdrop') as 'backdrop' | 'composed'

  const characterIds = uniqueNumbers(input.characterIds?.length
    ? input.characterIds
    : savedConfig.character_ids)
  let formIds = uniqueNumbers(input.characterFormIds?.length
    ? input.characterFormIds
    : savedConfig.character_form_ids)
  let propIds = uniqueNumbers(input.propIds?.length ? input.propIds : savedConfig.prop_ids)

  if (!propIds.length && (characterIds.length || formIds.length)) {
    const recommended = await recommendLinkedPropIds(input.dramaId, characterIds, formIds)
    propIds = recommended.slice(0, 6)
  }

  if (!characterIds.length && !formIds.length) {
    const castLinks = (await episodesRepo.listEpisodeCharacterLinks(input.episodeId)).map(l => l.characterId)
    characterIds.push(...castLinks.slice(0, 3))
  }

  const composeConfig: SceneComposeConfig = {
    character_ids: characterIds,
    character_form_ids: formIds,
    prop_ids: propIds,
  }

  await scenesRepo.updateScene(input.sceneId, {
    sceneMode: mode,
    composeConfig: JSON.stringify(composeConfig),
    status: 'processing',
    updatedAt: now(),
  })

  const forms = formIds.length ? await characterFormsRepo.listCharacterFormsByIds(formIds) : []
  const chars = characterIds.length ? await charactersRepo.listCharactersByIds(characterIds) : []
  const props = propIds.length ? await propsRepo.listPropsByIds(propIds) : []
  const drama = await dramasRepo.findDramaById(input.dramaId)

  const scenePrompt = buildScenePrompt({
    mode,
    location: input.location,
    time: input.time,
    basePrompt: input.prompt,
    characterNames: chars.map(c => c.name),
    propNames: props.map(p => p.name),
    formNames: forms.map(f => f.name),
    dramaStyle: drama?.style,
  })

  const referenceImages = await collectSceneReferenceImages({
    mode,
    characterIds,
    formIds,
    propIds,
  })

  logTaskStart('SceneImage', 'generate', {
    sceneId: input.sceneId,
    episodeId: input.episodeId,
    dramaId: input.dramaId,
    mode,
    refCount: referenceImages.length,
  })

  try {
    const styleRef = await resolveDramaStyleReference(input.dramaId)
    const genId = await generateImage(applyStyleReferenceToImageGeneration({
      userId: input.userId,
      userRole: input.userRole,
      sceneId: input.sceneId,
      dramaId: input.dramaId,
      prompt: scenePrompt,
      configId: input.dramaImageConfigId ?? undefined,
      referenceImages,
      size: resolveImageAspectRatio({
        bodySize: input.size,
        bodyAspectRatio: input.aspectRatio,
        episodeMetadata: input.episodeMetadata,
        scope: 'scene',
      }),
    }, styleRef))
    logTaskSuccess('SceneImage', 'generate', { sceneId: input.sceneId, generationId: genId, mode })
    return { image_generation_id: genId, scene_mode: mode, compose_config: composeConfig }
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: input.sceneId, error: err.message })
    await scenesRepo.updateScene(input.sceneId, { status: 'failed', updatedAt: now() })
    throw err
  }
}

/** @deprecated 别名，保持内部兼容 */
export const enqueueSceneBackdrop = enqueueSceneImage
