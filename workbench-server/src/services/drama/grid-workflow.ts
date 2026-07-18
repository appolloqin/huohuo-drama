import * as charactersRepo from '../../db/repos/characters/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import {
  appendReferenceImagePath,
  listReferenceImagePaths,
} from '../../common/drama/storyboard-frame-meta.js'
import { generateImage } from '../media/image-generation.js'
import { extractGridTiles } from './grid-split.js'
import { createAgent } from '../../agents/index.js'
import { logTaskError, logTaskPayload, logTaskProgress } from '../../common/task/task-logger.js'
import { applyDramaStyleToPrompt, normalizeDramaStyle } from '../../common/drama/drama-style.js'
import { now } from '../../common/http/response.js'
import {
  applyStyleReferenceToImageGeneration,
  resolveDramaStyleReference,
} from './drama-style-reference.js'

function posLabel(i: number, rows: number, cols: number) {
  const r = Math.floor(i / cols), c = i % cols
  return `row ${r + 1} col ${c + 1}`
}

function cellLabel(i: number, rows: number, cols: number) {
  return `格${i + 1}（${posLabel(i, rows, cols)}）`
}

function safeParseJsonArray(value: any): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

async function getStoryboardCharacterIds(storyboardIds: number[]) {
  if (!storyboardIds.length) return new Map<number, number[]>()
  const links = await storyboardsRepo.listStoryboardCharacterLinksForIds(storyboardIds)
  const map = new Map<number, number[]>()
  for (const link of links) {
    const arr = map.get(link.storyboardId) || []
    arr.push(link.characterId)
    map.set(link.storyboardId, arr)
  }
  return map
}

async function collectGridReferenceAssets(storyboards: any[]) {
  const storyboardIds = storyboards.map((sb) => sb.id)
  const storyboardCharacterIds = await getStoryboardCharacterIds(storyboardIds)
  const sceneIds = [...new Set(storyboards.map((sb) => sb.sceneId).filter(Boolean))]
  const characterIds = [...new Set([...storyboardCharacterIds.values()].flat().filter(Boolean))]

  const scenes = sceneIds.length ? await episodesRepo.listScenesByIds(sceneIds) : []
  const characters = characterIds.length ? await charactersRepo.listCharactersByIds(characterIds) : []

  const assets: Array<{
    path: string
    label: string
    kind: 'scene' | 'character' | 'storyboard'
    sceneId?: number
    characterId?: number
    storyboardId?: number
  }> = []
  const seen = new Set<string>()
  const pushAsset = (
    path: string | null | undefined,
    label: string,
    kind: 'scene' | 'character' | 'storyboard',
    extra: { sceneId?: number; characterId?: number; storyboardId?: number } = {},
  ) => {
    if (!path || seen.has(path) || assets.length >= 6) return
    seen.add(path)
    assets.push({ path, label, kind, ...extra })
  }

  for (const sb of storyboards) {
    pushAsset(sb.firstFrameImage, `镜头${sb.storyboardNumber}首帧`, 'storyboard', { storyboardId: sb.id })
    pushAsset(sb.lastFrameImage, `镜头${sb.storyboardNumber}尾帧`, 'storyboard', { storyboardId: sb.id })
    pushAsset(sb.composedImage, `镜头${sb.storyboardNumber}镜头图`, 'storyboard', { storyboardId: sb.id })
    for (const ref of listReferenceImagePaths(sb.referenceImages)) {
      pushAsset(ref, `镜头${sb.storyboardNumber}参考图`, 'storyboard', { storyboardId: sb.id })
    }
  }
  for (const scene of scenes) {
    pushAsset(scene.imageUrl, `${scene.location}${scene.time ? `（${scene.time}）` : ''}场景`, 'scene', { sceneId: scene.id })
  }
  for (const char of characters) {
    pushAsset(char.imageUrl, `${char.name}角色`, 'character', { characterId: char.id })
  }

  return assets.map((asset, index) => ({
    ...asset,
    imageIndex: index + 1,
    imageLabel: `图片${index + 1}`,
  }))
}

function buildReferenceLegend(referenceAssets: Array<{ imageLabel: string; label: string }>) {
  if (!referenceAssets.length) return ''
  return referenceAssets.map((asset) => `${asset.imageLabel}=${asset.label}`).join('；')
}

function buildStoryboardReferenceHints(
  sb: any,
  referenceAssets: Array<{ path: string; label: string; kind: string; imageLabel: string; sceneId?: number; characterId?: number; storyboardId?: number }>,
  storyboardCharacterIds: Map<number, number[]>,
) {
  const hints: string[] = []
  const charIds = storyboardCharacterIds.get(sb.id) || []

  for (const asset of referenceAssets) {
    if (asset.kind === 'scene' && sb.sceneId && asset.sceneId === sb.sceneId) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }
    if (asset.kind === 'character') {
      if (asset.characterId && charIds.includes(asset.characterId)) {
        hints.push(`${asset.imageLabel}（${asset.label}）`)
      }
    }
    if (asset.kind === 'storyboard' && asset.storyboardId === sb.id) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }
  }

  return [...new Set(hints)].slice(0, 4)
}

// Build prompt based on mode
function composeFallbackDramaImagePrompt(
  mode: string,
  storyboards: any[],
  rows: number,
  cols: number,
  dramaStyle: string,
  referenceAssets: Array<{ path: string; label: string; kind: string; imageLabel: string }>,
  storyboardCharacterIds: Map<number, number[]>,
): string {
  const style = normalizeDramaStyle(dramaStyle) || 'cinematic'
  const legend = buildReferenceLegend(referenceAssets)

  if (mode === 'first_frame') {
    // Each cell = one shot's first frame
    const cells = storyboards.map((sb, i) => {
      const desc = sb.imagePrompt || sb.description || sb.title || `shot ${i + 1}`
      const refs = buildStoryboardReferenceHints(sb, referenceAssets, storyboardCharacterIds)
      return `${cellLabel(i, rows, cols)}: ${refs.length ? `参考${refs.join('、')}，` : ''}${desc}`
    })
    return applyDramaStyleToPrompt(
      [
        `${rows}x${cols} grid layout,`,
        legend ? `参考图映射：${legend}` : '',
        '当画面涉及角色或场景时，优先使用对应的图片编号来约束一致性。',
        ...cells,
        'high quality, no text, no watermark',
      ].filter(Boolean).join('\n'),
      style,
      'en',
    )
  }

  if (mode === 'first_last') {
    // Fill the selected grid using first/last-frame style cues, but do not force Nx2 layout.
    const totalCells = rows * cols
    const cells = Array.from({ length: totalCells }, (_, i) => {
      const sb = storyboards[i % storyboards.length]
      const desc = sb.imagePrompt || sb.description || sb.title || `shot ${i + 1}`
      const action = sb.action || sb.movement || ''
      const refs = buildStoryboardReferenceHints(sb, referenceAssets, storyboardCharacterIds)
      const frameHint = i % 2 === 0
        ? 'opening moment'
        : `${action ? `${action}, ` : ''}closing moment, subtle motion change`
      return `${cellLabel(i, rows, cols)}: ${refs.length ? `参考${refs.join('、')}，` : ''}${desc}, ${frameHint}`
    })
    return applyDramaStyleToPrompt(
      [
        `${rows}x${cols} grid layout,`,
        legend ? `参考图映射：${legend}` : '',
        'first/last frame visual rhythm, alternating opening and closing beats across the grid,',
        ...cells,
        'continuous motion implied between left and right, high quality, no text',
      ].filter(Boolean).join('\n'),
      style,
      'en',
    )
  }

  if (mode === 'multi_ref') {
    // All cells are different angles/compositions of the same shot
    const sb = storyboards[0]
    const desc = sb.imagePrompt || sb.description || sb.title || 'scene'
    const angles = [
      'wide establishing shot', 'medium shot character focus',
      'close-up detail', 'dramatic low angle', 'over-the-shoulder view',
      'bird eye view', 'side profile', 'atmospheric detail',
      'extreme close-up', 'dutch angle', 'silhouette shot',
      'depth of field focus', 'symmetrical composition', 'leading lines',
      'negative space', 'high angle looking down', 'ground level',
      'panoramic wide', 'intimate two-shot', 'reflection shot',
      'shadow play', 'backlit silhouette', 'macro detail',
      'split lighting', 'rim light portrait',
    ]
    const totalCells = rows * cols
    const cells = Array.from({ length: totalCells }, (_, i) => {
      return `${cellLabel(i, rows, cols)}: ${legend ? `参考${legend}，` : ''}${desc}, ${angles[i % angles.length]}`
    })
    return applyDramaStyleToPrompt(
      [
        `${rows}x${cols} grid layout, same scene different angles and compositions,`,
        legend ? `参考图映射：${legend}` : '',
        `main scene: ${desc},`,
        ...cells,
        'consistent lighting and color palette, high quality, no text',
      ].filter(Boolean).join('\n'),
      style,
      'en',
    )
  }

  return applyDramaStyleToPrompt(
    `${rows}x${cols} grid, storyboard frames, high quality`,
    style,
    'en',
  )
}

function buildGridCellPrompts(
  mode: string,
  storyboards: any[],
  rows: number,
  cols: number,
  referenceAssets: Array<{ path: string; label: string; kind: string; imageLabel: string }>,
  storyboardCharacterIds: Map<number, number[]>,
) {
  if (!storyboards.length) return []

  if (mode === 'multi_ref') {
    const sb = storyboards[0]
    const desc = sb.imagePrompt || sb.description || sb.title || 'scene'
    const angles = [
      'wide establishing shot', 'medium shot character focus',
      'close-up detail', 'dramatic low angle', 'over-the-shoulder view',
      'bird eye view', 'side profile', 'atmospheric detail',
      'extreme close-up', 'dutch angle', 'silhouette shot',
      'depth of field focus', 'symmetrical composition', 'leading lines',
      'negative space', 'high angle looking down', 'ground level',
      'panoramic wide', 'intimate two-shot', 'reflection shot',
      'shadow play', 'backlit silhouette', 'macro detail',
      'split lighting', 'rim light portrait',
    ]
    return Array.from({ length: rows * cols }, (_, i) => ({
      shot_number: sb.storyboardNumber,
      frame_type: 'reference',
      prompt: `${cellLabel(i, rows, cols)}: ${buildStoryboardReferenceHints(sb, referenceAssets, storyboardCharacterIds).join('、')}${buildStoryboardReferenceHints(sb, referenceAssets, storyboardCharacterIds).length ? '，' : ''}${desc}, ${angles[i % angles.length]}`,
    }))
  }

  if (mode === 'first_last') {
    return Array.from({ length: rows * cols }, (_, i) => {
      const sb = storyboards[i % storyboards.length]
      const desc = sb.imagePrompt || sb.description || sb.title || `shot ${sb.storyboardNumber || ''}`
      const motion = sb.action || sb.movement || ''
      const refs = buildStoryboardReferenceHints(sb, referenceAssets, storyboardCharacterIds)
      const isFirst = i % 2 === 0
      return {
        shot_number: sb.storyboardNumber,
        frame_type: isFirst ? 'first_frame' : 'last_frame',
        prompt: isFirst
          ? `${cellLabel(i, rows, cols)}，首帧：${refs.length ? `参考${refs.join('、')}，` : ''}${desc}${sb.location ? `, ${sb.location}` : ''}${sb.shotType ? `, ${sb.shotType}` : ''}`
          : `${cellLabel(i, rows, cols)}，尾帧：${refs.length ? `参考${refs.join('、')}，` : ''}${desc}${motion ? `, ${motion}` : ''}${sb.location ? `, ${sb.location}` : ''}${sb.shotType ? `, ${sb.shotType}` : ''}`,
      }
    })
  }

  return storyboards.slice(0, rows * cols).map((sb, index) => {
    const desc = sb.imagePrompt || sb.description || sb.title || `shot ${sb.storyboardNumber || ''}`
    const refs = buildStoryboardReferenceHints(sb, referenceAssets, storyboardCharacterIds)
    return {
      shot_number: sb.storyboardNumber,
      frame_type: 'first_frame',
      prompt: `${cellLabel(index, rows, cols)}：${refs.length ? `参考${refs.join('、')}，` : ''}${desc}${sb.location ? `, ${sb.location}` : ''}${sb.shotType ? `, ${sb.shotType}` : ''}, opening scene`,
    }
  })
}

function extractJsonCandidate(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const plain = text.match(/\{[\s\S]*\}/)
  return plain?.[0]?.trim() || ''
}

function normalizeGridPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return null
  const gridPrompt = typeof payload.grid_prompt === 'string'
    ? payload.grid_prompt.trim()
    : typeof payload.gridPrompt === 'string'
      ? payload.gridPrompt.trim()
      : ''
  const rawCells = Array.isArray(payload.cell_prompts)
    ? payload.cell_prompts
    : Array.isArray(payload.cellPrompts)
      ? payload.cellPrompts
      : []
  const cellPrompts = rawCells.map((cell: any) => ({
    shot_number: Number(cell?.shot_number ?? cell?.shotNumber ?? 0) || 0,
    frame_type: String(cell?.frame_type ?? cell?.frameType ?? 'first_frame'),
    prompt: String(cell?.prompt ?? '').trim(),
  })).filter((cell: any) => cell.prompt)

  if (!gridPrompt) return null
  return { grid_prompt: gridPrompt, cell_prompts: cellPrompts }
}

function findGridPayload(value: any): { grid_prompt: string; cell_prompts: any[] } | null {
  if (!value) return null

  const normalized = normalizeGridPayload(value)
  if (normalized) return normalized

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === 'null') return null
    try {
      const parsed = JSON.parse(trimmed)
      return findGridPayload(parsed)
    } catch {
      const candidate = extractJsonCandidate(trimmed)
      if (!candidate) return null
      try {
        return findGridPayload(JSON.parse(candidate))
      } catch {
        return null
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGridPayload(item)
      if (found) return found
    }
    return null
  }

  if (typeof value === 'object') {
    for (const nested of Object.values(value)) {
      const found = findGridPayload(nested)
      if (found) return found
    }
  }

  return null
}

async function tryDramaImagePromptAgent(
  episodeId: number,
  dramaId: number,
  storyboardIds: number[],
  rows: number,
  cols: number,
  mode: string,
  referenceLegend: string,
  configOpts?: { userId: number; role: string },
) {
  const agent = await createAgent('drama_image_prompt', episodeId, dramaId, configOpts)
  if (!agent) return null

  const result = await agent.generate(
    [{
      role: 'user',
      content: [
        '请为宫格图生成提示词，并优先调用工具完成。',
        `选中镜头ID：${JSON.stringify(storyboardIds)}`,
        `行数：${rows}`,
        `列数：${cols}`,
        `模式：${mode}`,
        referenceLegend ? `参考图映射：${referenceLegend}` : '',
        '当提示词涉及到某个角色或场景时，直接把对应的图片编号写进提示词，例如：图片1中的角色A站了起来，图片3中的房间场景。不要只写名字，不写图片编号。',
        `必须严格按 ${rows}x${cols} 生成，总共 exactly ${rows * cols} visible panels。不要合并格子，不要缺格。`,
        '必须返回 JSON，结构为：{"grid_prompt":"...","cell_prompts":[{"shot_number":1,"frame_type":"first_frame","prompt":"..."}]}',
      ].join('\n'),
    }],
    { maxSteps: 10 },
  )

  const fromTools = findGridPayload(result.toolResults)
  if (fromTools) return fromTools

  const fromText = findGridPayload(result.text)
  if (fromText) return fromText

  return null
}

export async function buildDramaImagePromptBundle(input: {
  storyboardIds: number[]
  dramaId?: number
  episodeId?: number
  rows: number
  cols: number
  mode: string
  configOpts?: { userId: number; role: string }
}) {
  const { storyboardIds, dramaId, episodeId, rows, cols, mode, configOpts } = input

  const storyboards = (await storyboardsRepo.listStoryboardsByIds(storyboardIds)).filter(Boolean)

  let dramaStyle = ''
  if (dramaId) {
    const drama = await dramasRepo.findDramaById(dramaId)
    dramaStyle = normalizeDramaStyle(drama?.style) || ''
  }

  const actualCols = cols
  const actualRows = rows
  const resolvedEpisodeId = Number(episodeId || storyboards[0]?.episodeId || 0)
  const storyboardCharacterIds = await getStoryboardCharacterIds(storyboardIds)
  const referenceAssets = await collectGridReferenceAssets(storyboards)
  const referenceLegend = buildReferenceLegend(referenceAssets)

  if (!resolvedEpisodeId) {
    throw new Error('episode_id required')
  }

  try {
    const agentPayload = await tryDramaImagePromptAgent(
      resolvedEpisodeId,
      Number(dramaId || 0),
      storyboardIds,
      actualRows,
      actualCols,
      mode,
      referenceLegend,
      configOpts,
    )

    if (agentPayload?.grid_prompt) {
      logTaskProgress('DramaImagePrompt', 'agent-success', {
        episodeId: resolvedEpisodeId,
        dramaId,
        mode,
        rows: actualRows,
        cols: actualCols,
        storyboardCount: storyboardIds.length,
      })
      logTaskPayload('DramaImagePrompt', 'agent-result', agentPayload)
      return {
        ...agentPayload,
        source: 'agent' as const,
        grid: { rows: actualRows, cols: actualCols },
        storyboard_ids: storyboardIds,
        mode,
      }
    }
  } catch (err: any) {
    logTaskError('DramaImagePrompt', 'agent-failed', {
      episodeId: resolvedEpisodeId,
      dramaId,
      error: err.message,
    })
  }

  const gridPrompt = composeFallbackDramaImagePrompt(mode, storyboards, actualRows, actualCols, dramaStyle, referenceAssets, storyboardCharacterIds)
  const cellPrompts = buildGridCellPrompts(mode, storyboards, actualRows, actualCols, referenceAssets, storyboardCharacterIds)
  logTaskProgress('DramaImagePrompt', 'fallback-used', {
    episodeId: resolvedEpisodeId,
    dramaId,
    mode,
    rows: actualRows,
    cols: actualCols,
    storyboardCount: storyboardIds.length,
  })

  return {
    grid_prompt: gridPrompt,
    cell_prompts: cellPrompts,
    source: 'fallback' as const,
    grid: { rows: actualRows, cols: actualCols },
    storyboard_ids: storyboardIds,
    mode,
  }
}

export async function enqueueGridImageGeneration(input: {
  userId: number
  userRole: string
  storyboardIds: number[]
  dramaId?: number
  rows: number
  cols: number
  mode: string
  customPrompt?: string
}) {
  const { userId, userRole, storyboardIds, dramaId, rows, cols, mode, customPrompt } = input

  const storyboards = (await storyboardsRepo.listStoryboardsByIds(storyboardIds)).filter(Boolean)

  let dramaStyle = ''
  if (dramaId) {
    const drama = await dramasRepo.findDramaById(dramaId)
    dramaStyle = normalizeDramaStyle(drama?.style) || ''
  }

  const storyboardCharacterIds = await getStoryboardCharacterIds(storyboardIds)
  const referenceAssets = await collectGridReferenceAssets(storyboards)
  const prompt = customPrompt || composeFallbackDramaImagePrompt(mode, storyboards, rows, cols, dramaStyle, referenceAssets, storyboardCharacterIds)
  const referenceImages = referenceAssets.map((asset) => asset.path)

  const cellW = 960
  const cellH = 540
  const actualCols = cols
  const actualRows = rows
  const size = `${cellW * actualCols}x${cellH * actualRows}`

  const styleRef = dramaId ? await resolveDramaStyleReference(dramaId) : {}
  const genId = await generateImage(applyStyleReferenceToImageGeneration({
    userId,
    userRole,
    dramaId,
    prompt,
    size,
    frameType: `grid_${mode}_${actualRows}x${actualCols}`,
    referenceImages,
  }, styleRef))

  logTaskProgress('GridGenerate', 'reference-images', {
    dramaId,
    mode,
    rows: actualRows,
    cols: actualCols,
    referenceCount: referenceImages.length,
  })

  return {
    image_generation_id: genId,
    grid: { rows: actualRows, cols: actualCols },
    mode,
    storyboard_ids: storyboardIds,
    prompt,
    reference_images: referenceImages,
  }
}

export async function applyGridSplitAssignments(input: {
  imageGenerationId: number
  rows: number
  cols: number
  assignments: Array<{ storyboard_id?: number; frame_type?: string }>
}) {
  const { imageGenerationId, rows, cols, assignments } = input

  const imgRecord = await imageGenerationsRepo.findImageGenerationById(imageGenerationId)
  if (!imgRecord) throw new Error('Image generation not found')
  if (imgRecord.status !== 'completed') throw new Error(`Image status: ${imgRecord.status}`)
  if (!imgRecord.localPath) throw new Error('No local image file')

  const cells = await extractGridTiles(imgRecord.localPath, rows, cols)

  const results: Array<{ storyboard_id: number; frame_type: string; local_path: string }> = []
  for (let i = 0; i < assignments.length && i < cells.length; i++) {
    const { storyboard_id, frame_type } = assignments[i]
    const cell = cells[i]
    if (!storyboard_id) continue

    const update: Record<string, any> = { updatedAt: now() }
    if (frame_type === 'first_frame') update.firstFrameImage = cell.localPath
    else if (frame_type === 'last_frame') update.lastFrameImage = cell.localPath
    else if (frame_type === 'reference') {
      const sb = await storyboardsRepo.findStoryboardById(storyboard_id)
      update.referenceImages = appendReferenceImagePath(sb?.referenceImages, cell.localPath)
    }

    await storyboardsRepo.updateStoryboard(storyboard_id, update)
    results.push({ storyboard_id, frame_type: frame_type || '', local_path: cell.localPath })
  }

  return { cells: results }
}

export async function readGridGenerationStatus(imageGenerationId: number) {
  const row = await imageGenerationsRepo.findImageGenerationById(imageGenerationId)
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    local_path: row.localPath,
    image_url: row.imageUrl,
    error_msg: row.errorMsg,
  }
}
