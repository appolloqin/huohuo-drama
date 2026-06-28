import type { DramaRow, EpisodeRow } from '../../db/repos/types.js'
import type { EpisodeListItemRow } from '../../db/repos/episodes/sqlite.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as videoMergesRepo from '../../db/repos/video-merges/index.js'
import { isDramaEpisodeMergedForPipeline } from '../../common/drama/drama-episode-status.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../../common/http/transform.js'
import { isNovelProject } from '../../common/novel/novel-meta.js'
import { logTaskError } from '../../common/task/task-logger.js'
import { generateEpisodeRawContent } from './episode-raw-content.js'
import { refreshNovelChapterContinuityIfNeeded } from '../novel/novel-chapter-pipeline.js'
import { mergeEpisodeMetadata, readProductionPipeline, type ProductionPipeline } from '../../common/drama/episode-meta.js'
import { isValidAspectRatio, type ImageAspectRatio } from '../../common/media/image-aspect-presets.js'
import { normalizeVideoGenOptions } from '../../common/media/video-gen-options.js'
import { dramaOwnedByUser, episodeAndDramaForUser } from './drama-access-service.js'
import { extractChapterOutline } from '../../common/novel/novel-outline.js'
import { parseNovelMetadata } from '../../common/novel/novel-meta.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'

export type EpisodeListFilter = episodesRepo.EpisodeListFilter

export type EpisodeListStats = {
  total: number
  written: number
  pending: number
  total_chars: number
}

export function translateEpisodePatchFields(updates: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updatedAt: now() }
  if ('content' in updates) patch.content = updates.content
  if ('script_content' in updates) patch.scriptContent = updates.script_content
  if ('formatted_script' in updates) patch.formattedScript = updates.formatted_script
  if ('title' in updates) patch.title = updates.title
  if ('description' in updates) patch.description = updates.description
  if ('status' in updates) patch.status = updates.status
  if ('drama_image_config_id' in updates) {
    const v = updates.drama_image_config_id
    patch.dramaImageConfigId = v === null || v === '' ? null : Number(v)
  }
  if ('drama_video_config_id' in updates) {
    const v = updates.drama_video_config_id
    patch.dramaVideoConfigId = v === null || v === '' ? null : Number(v)
  }
  if ('drama_audio_config_id' in updates) {
    const v = updates.drama_audio_config_id
    patch.dramaAudioConfigId = v === null || v === '' ? null : Number(v)
  }
  if ('metadata' in updates) patch.metadata = updates.metadata
  return patch
}

function classifyPipelineStepState(done: boolean, partial?: boolean) {
  if (done) return 'done'
  if (partial) return 'partial'
  return 'pending'
}

export async function computeEpisodeListStats(dramaId: number, isNovel: boolean): Promise<EpisodeListStats> {
  const agg = await episodesRepo.aggregateEpisodeListStats(dramaId, isNovel)
  return {
    total: agg.total,
    written: agg.written,
    pending: agg.total - agg.written,
    total_chars: agg.totalChars,
  }
}

async function attachMergedVideoDurations(items: EpisodeListItemRow[]): Promise<EpisodeListItemRow[]> {
  return Promise.all(items.map(async (ep) => {
    if (!isDramaEpisodeMergedForPipeline(ep)) return ep
    const pipeline = readProductionPipeline(ep.metadata)
    const merges = await videoMergesRepo.listVideoMergesByEpisode(ep.id)
    const tagged = merges
      .filter(row => row.status === 'completed' && (row.title || '').includes(`[${pipeline}]`))
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    const latest = tagged[0] ?? merges.filter(row => row.status === 'completed').at(-1)
    if (latest?.duration) return { ...ep, duration: latest.duration }
    return ep
  }))
}

function mapEpisodeListItem(
  row: EpisodeListItemRow,
  isNovel: boolean,
  bookOutline = '',
) {
  const item: Record<string, unknown> = {
    id: row.id,
    drama_id: row.dramaId,
    episode_number: row.episodeNumber,
    title: row.title,
    description: row.description,
    duration: row.duration,
    status: row.status,
    metadata: row.metadata,
    video_url: row.videoUrl,
    drama_image_config_id: row.dramaImageConfigId,
    drama_video_config_id: row.dramaVideoConfigId,
    drama_audio_config_id: row.dramaAudioConfigId,
  }
  if (isNovel) {
    item.content_char_count = Number(row.contentCharCount) || 0
    item.has_content = Number(row.hasWrittenContent) > 0
    const custom = (row.description || '').trim()
    const fromBook = bookOutline.trim()
      ? extractChapterOutline(bookOutline, row.episodeNumber)
      : ''
    item.chapter_outline = custom || fromBook || ''
  }
  return item
}

export async function getOwnedEpisodeById(userId: number, episodeId: number) {
  const pack = await episodeAndDramaForUser(episodeId, userId)
  if (!pack) return null
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode) return null
  return toSnakeCase(episode)
}

export async function getOwnedEpisodeByNumber(userId: number, dramaId: number, episodeNumber: number) {
  const drama = await dramaOwnedByUser(dramaId, userId)
  if (!drama) return null
  const episode = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, episodeNumber)
  if (!episode) return null
  return toSnakeCase(episode)
}

export async function listDramaEpisodes(args: {
  dramaId: number
  isNovel: boolean
  page?: number
  pageSize?: number
  filter?: EpisodeListFilter
}) {
  const page = Math.max(1, args.page || 1)
  const pageSize = Math.min(100, Math.max(1, args.pageSize || 20))
  const filter: EpisodeListFilter = args.filter || 'all'

  const [total, rawItems, stats] = await Promise.all([
    episodesRepo.countEpisodesFiltered(args.dramaId, args.isNovel, filter),
    episodesRepo.listEpisodesFiltered({
      dramaId: args.dramaId,
      isNovel: args.isNovel,
      filter,
      page,
      pageSize,
    }),
    computeEpisodeListStats(args.dramaId, args.isNovel),
  ])

  let bookOutline = ''
  if (args.isNovel) {
    const drama = await dramasRepo.findDramaById(args.dramaId)
    bookOutline = parseNovelMetadata(drama?.metadata).outline || ''
  }

  const items = args.isNovel
    ? rawItems.map(row => mapEpisodeListItem(row, true, bookOutline))
    : (await attachMergedVideoDurations(rawItems)).map(ep => ({
        ...mapEpisodeListItem(ep, false),
        production_pipeline: readProductionPipeline(ep.metadata),
      }))

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    },
    stats,
  }
}

export async function createEpisodeForDrama(body: {
  drama_id: number
  title?: string
  drama_image_config_id: number
  drama_video_config_id: number
  drama_audio_config_id: number
  production_pipeline?: ProductionPipeline
}) {
  const ts = now()
  const siblings = await episodesRepo.listSiblingEpisodesOrdered(body.drama_id)
  const nextNum = siblings.length ? Math.max(...siblings.map(e => e.episodeNumber)) + 1 : 1
  const pipeline: ProductionPipeline = body.production_pipeline === 'frame_slideshow'
    ? 'frame_slideshow'
    : 'ai_video'

  const res = await episodesRepo.insertEpisode({
    dramaId: body.drama_id,
    episodeNumber: nextNum,
    title: body.title || `第${nextNum}集`,
    dramaImageConfigId: body.drama_image_config_id,
    dramaVideoConfigId: body.drama_video_config_id,
    dramaAudioConfigId: body.drama_audio_config_id,
    metadata: mergeEpisodeMetadata(null, { production_pipeline: pipeline }),
    createdAt: ts,
    updatedAt: ts,
  })

  const ep = await episodesRepo.findEpisodeById(res.lastInsertRowid)
  if (!ep) throw new Error('创建分集失败')
  return {
    id: ep.id,
    episode_number: ep.episodeNumber,
    title: ep.title,
    drama_image_config_id: ep.dramaImageConfigId,
    drama_video_config_id: ep.dramaVideoConfigId,
    drama_audio_config_id: ep.dramaAudioConfigId,
    production_pipeline: readProductionPipeline(ep.metadata),
  }
}

export async function updateOwnedEpisode(
  id: number,
  ownedEpisode: { episode: EpisodeRow; drama: DramaRow },
  body: Record<string, unknown>,
) {
  const allowed = ['content', 'script_content', 'formatted_script', 'title', 'description', 'status', 'drama_image_config_id', 'drama_video_config_id', 'drama_audio_config_id']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if ('image_sizes' in body && body.image_sizes && typeof body.image_sizes === 'object') {
    const patch: Record<string, ImageAspectRatio> = {}
    for (const [scope, ratio] of Object.entries(body.image_sizes as Record<string, unknown>)) {
      if (typeof ratio === 'string' && isValidAspectRatio(ratio)) patch[scope] = ratio
    }
    if (Object.keys(patch).length) {
      updates.metadata = mergeEpisodeMetadata(ownedEpisode.episode.metadata, { image_sizes: patch })
    }
  }

  if ('video_gen_options' in body && body.video_gen_options && typeof body.video_gen_options === 'object') {
    const patch = normalizeVideoGenOptions(body.video_gen_options)
    updates.metadata = mergeEpisodeMetadata(
      (updates.metadata as string | undefined) ?? ownedEpisode.episode.metadata,
      { video_gen_options: patch },
    )
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('no valid fields')
  }

  const drizzleUpdates = translateEpisodePatchFields(updates)
  await episodesRepo.updateEpisode(id, drizzleUpdates)

  if (
    isNovelProject(ownedEpisode.drama)
    && 'content' in updates
    && typeof updates.content === 'string'
    && updates.content.trim()
    && body.skip_continuity_refresh !== true
  ) {
    refreshNovelChapterContinuityIfNeeded({
      dramaId: ownedEpisode.drama.id,
      episodeId: id,
      chapterNumber: ownedEpisode.episode.episodeNumber,
      content: updates.content,
      dramaTitle: ownedEpisode.drama.title,
    }).catch((err: Error) => {
      logTaskError('Novel', 'continuity-put-refresh', { chapterId: id, error: err.message })
    })
  }
}

export async function generateEpisodeContent(
  id: number,
  ownedEpisode: { episode: EpisodeRow; drama: DramaRow },
  prompt: string,
  billing: { userId: number; role?: string },
) {
  const { episode: ep, drama } = ownedEpisode
  return generateEpisodeRawContent({ drama, episode: ep, prompt }, {
    userId: billing.userId,
    role: billing.role,
    reason: '短剧初稿生成',
    resourceType: 'episode',
    resourceId: id,
  })
}

async function gatherEpisodeLinkedCharacterIds(episodeId: number) {
  const [episodeCharLinks, shotIds, allShotCharLinks] = await Promise.all([
    episodesRepo.listEpisodeCharacterLinks(episodeId),
    episodesRepo.listStoryboardIdsByEpisode(episodeId),
    episodesRepo.listAllStoryboardCharacterLinks(),
  ])

  const linkedCharIdSet = new Set(episodeCharLinks.map(link => link.characterId))
  const shotIdSet = new Set(shotIds)

  if (shotIdSet.size) {
    for (const link of allShotCharLinks) {
      if (shotIdSet.has(link.storyboardId)) linkedCharIdSet.add(link.characterId)
    }
  }

  return linkedCharIdSet
}

export async function listEpisodeCastRows(episodeId: number) {
  const linkedCharIdSet = await gatherEpisodeLinkedCharacterIds(episodeId)
  if (!linkedCharIdSet.size) return []
  const allChars = await episodesRepo.listAllCharacters()
  return allChars
    .filter(ch => linkedCharIdSet.has(ch.id) && !ch.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
}

export async function listEpisodeScenes(episodeId: number) {
  const links = await episodesRepo.listEpisodeSceneLinks(episodeId)
  const sceneIds = links.map(l => l.sceneId)
  if (!sceneIds.length) return []
  const scenes = await episodesRepo.listScenesByIds(sceneIds)
  return scenes.filter(sc => !sc.deletedAt)
}

export async function assembleEpisodeStoryboardPayload(episodeId: number) {
  const [rows, links, episodeCharLinks] = await Promise.all([
    episodesRepo.listStoryboardsByEpisodeOrdered(episodeId),
    episodesRepo.listAllStoryboardCharacterLinks(),
    episodesRepo.listEpisodeCharacterLinks(episodeId),
  ])

  const castIdsByShotId = new Map<number, number[]>()
  for (const link of links) {
    const arr = castIdsByShotId.get(link.storyboardId) || []
    arr.push(link.characterId)
    castIdsByShotId.set(link.storyboardId, arr)
  }

  const episodeCharIds = episodeCharLinks.map(link => link.characterId)
  const rowIdSet = new Set(rows.map(r => r.id))
  const shotLinkedCharIds = new Set<number>()
  for (const link of links) {
    if (rowIdSet.has(link.storyboardId)) shotLinkedCharIds.add(link.characterId)
  }
  const mergedCharIds = new Set([...episodeCharIds, ...shotLinkedCharIds])
  const allChars = (await episodesRepo.listAllCharacters())
    .filter(ch => mergedCharIds.has(ch.id) && !ch.deletedAt)

  return rows.map((row) => ({
    ...toSnakeCase(row),
    character_ids: castIdsByShotId.get(row.id) || [],
    characters: allChars
      .filter(ch => (castIdsByShotId.get(row.id) || []).includes(ch.id))
      .map(ch => toSnakeCase(ch)),
  }))
}

export async function composeEpisodePipelineSnapshot(episodeId: number, ep: EpisodeRow) {
  const [
    projectCastRows,
    projectLocationRows,
    episodeShotRows,
    episodeMergeJobs,
  ] = await Promise.all([
    episodesRepo.listCharactersByDrama(ep.dramaId),
    episodesRepo.listScenesByDrama(ep.dramaId),
    episodesRepo.listStoryboardsByEpisode(episodeId),
    episodesRepo.listVideoMergesByEpisode(episodeId),
  ])

  const castWithVoice = projectCastRows.filter(c => c.voiceId)
  const castWithSample = projectCastRows.filter(c => c.voicePreviewUrl)
  const shotsWithCover = episodeShotRows.filter(s => s.composedImage)
  const shotsWithVideo = episodeShotRows.filter(s => s.videoUrl)
  const shotsComposed = episodeShotRows.filter(s => s.composedVideoUrl)
  const latestMerge = episodeMergeJobs[episodeMergeJobs.length - 1]

  return {
    episode_id: episodeId,
    steps: {
      script_format: { status: ep.formattedScript ? 'done' : (ep.content ? 'ready' : 'pending') },
      extract_characters: { status: classifyPipelineStepState(projectCastRows.length > 0), count: projectCastRows.length },
      extract_scenes: { status: classifyPipelineStepState(projectLocationRows.length > 0), count: projectLocationRows.length },
      assign_voices: { status: classifyPipelineStepState(castWithVoice.length === projectCastRows.length && projectCastRows.length > 0, castWithVoice.length > 0), assigned: castWithVoice.length, total: projectCastRows.length },
      generate_voice_samples: { status: classifyPipelineStepState(castWithSample.length === castWithVoice.length && castWithVoice.length > 0, castWithSample.length > 0), completed: castWithSample.length, total: castWithVoice.length },
      extract_storyboards: { status: classifyPipelineStepState(episodeShotRows.length > 0), count: episodeShotRows.length },
      generate_images: { status: classifyPipelineStepState(shotsWithCover.length === episodeShotRows.length && episodeShotRows.length > 0, shotsWithCover.length > 0), completed: shotsWithCover.length, total: episodeShotRows.length },
      generate_videos: { status: classifyPipelineStepState(shotsWithVideo.length === episodeShotRows.length && episodeShotRows.length > 0, shotsWithVideo.length > 0), completed: shotsWithVideo.length, total: episodeShotRows.length },
      compose_shots: { status: classifyPipelineStepState(shotsComposed.length === episodeShotRows.length && episodeShotRows.length > 0, shotsComposed.length > 0), completed: shotsComposed.length, total: episodeShotRows.length },
      merge_episode: { status: latestMerge?.status === 'completed' ? 'done' : (latestMerge ? latestMerge.status : 'pending'), merged_url: latestMerge?.mergedUrl },
    },
  }
}
