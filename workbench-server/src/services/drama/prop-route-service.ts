/**
 * 火火 — 道具资源路由业务
 */
import * as propsRepo from '../../db/repos/props/index.js'
import { now } from '../../common/http/response.js'
import { generateImage } from '../media/image-generation.js'
import { resolveImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

const PROP_PATCH_KEYS: Record<string, string> = {
  name: 'name',
  type: 'type',
  description: 'description',
  prompt: 'prompt',
  image_url: 'imageUrl',
  local_path: 'localPath',
  character_id: 'characterId',
  character_form_id: 'characterFormId',
}

function buildPropPrompt(name: string, type?: string | null, description?: string | null) {
  return `${name}, ${type || '道具'}, ${description || '高质量物品特写, 白色背景'}`
}

export async function insertPropRecord(body: {
  drama_id: number
  name: string
  type?: string
  description?: string
  prompt?: string
  character_id?: number | null
  character_form_id?: number | null
}) {
  const ts = now()
  const res = await propsRepo.insertProp({
    dramaId: body.drama_id,
    name: body.name.trim(),
    type: body.type || null,
    description: body.description || null,
    prompt: body.prompt || null,
    characterId: body.character_id ?? null,
    characterFormId: body.character_form_id ?? null,
    createdAt: ts,
    updatedAt: ts,
  })
  const row = await propsRepo.findPropById(res.lastInsertRowid)
  if (!row) throw new Error('创建道具失败')
  return row
}

export async function patchPropRecord(propId: number, patch: Record<string, unknown>) {
  const rowPatch: Record<string, unknown> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(PROP_PATCH_KEYS)) {
    if (snakeKey in patch) rowPatch[camelKey] = patch[snakeKey]
    else if (camelKey in patch) rowPatch[camelKey] = patch[camelKey]
  }
  await propsRepo.updateProp(propId, rowPatch)
}

export async function archiveProp(propId: number) {
  await propsRepo.softDeleteProp(propId, now())
}

export async function enqueuePropImage(input: {
  userId: number
  userRole: string
  propId: number
  dramaId: number
  name: string
  type?: string | null
  description?: string | null
  prompt?: string | null
  dramaImageConfigId?: number | null
  episodeMetadata?: string | null
  size?: string | null
  aspectRatio?: string | null
  referenceImages?: string[]
}) {
  logTaskStart('PropImage', 'generate', { propId: input.propId, dramaId: input.dramaId })

  try {
    const genId = await generateImage({
      userId: input.userId,
      userRole: input.userRole,
      propId: input.propId,
      dramaId: input.dramaId,
      prompt: input.prompt || buildPropPrompt(input.name, input.type, input.description),
      configId: input.dramaImageConfigId ?? undefined,
      referenceImages: input.referenceImages?.filter(Boolean) || [],
      size: resolveImageAspectRatio({
        bodySize: input.size,
        bodyAspectRatio: input.aspectRatio,
        episodeMetadata: input.episodeMetadata,
        scope: 'character',
      }),
    })
    logTaskSuccess('PropImage', 'generate', { propId: input.propId, generationId: genId })
    return { image_generation_id: genId }
  } catch (err: any) {
    logTaskError('PropImage', 'generate', { propId: input.propId, error: err.message })
    throw err
  }
}

export async function batchEnqueuePropImages(input: {
  userId: number
  userRole: string
  dramaId: number
  propIds: number[]
  lookup: (id: number) => Promise<{
    name: string
    type?: string | null
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

  for (const propId of input.propIds) {
    const prop = await input.lookup(propId)
    if (!prop || prop.dramaId !== input.dramaId) continue
    try {
      const genId = await generateImage({
        userId: input.userId,
        userRole: input.userRole,
        propId,
        dramaId: prop.dramaId,
        prompt: prop.prompt || buildPropPrompt(prop.name, prop.type, prop.description),
        configId: input.dramaImageConfigId ?? undefined,
        size,
      })
      startedIds.push(genId)
    } catch {}
  }

  return { image_generation_ids: startedIds, count: startedIds.length }
}
