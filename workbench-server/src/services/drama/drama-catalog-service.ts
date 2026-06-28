import type { DramaRow } from '../../db/repos/types.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as dramaAssetsRepo from '../../db/repos/drama-assets/index.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase, toSnakeCaseArray } from '../../common/http/transform.js'
import { computeEpisodeListStats, listDramaEpisodes, type EpisodeListFilter } from './episode-service.js'
import { normalizeDramaStyle } from '../../common/drama/drama-style.js'
import { isNovelProject, mergeNovelMetadata, parseNovelMetadata } from '../../common/novel/novel-meta.js'
import { dramaOwnedByUser } from './drama-access-service.js'

const SUPPORTED_PROJECT_KINDS = ['drama', 'novel'] as const

export type ProjectListQuery = {
  userId: number
  page?: number
  pageSize?: number
  status?: string
  keyword?: string
  projectType?: string
}

async function buildProjectListItems(dramaRows: Partial<DramaRow>[]) {
  if (!dramaRows.length) return []

  const dramaIds = dramaRows.map(d => d.id).filter((id): id is number => typeof id === 'number')
  const novelDramaIds = dramaRows
    .filter(d => d.projectType === 'novel')
    .map(d => d.id)
    .filter((id): id is number => typeof id === 'number')
  const statsList = await dramasRepo.getProjectListStatsByDramaIds(dramaIds, novelDramaIds)
  const statsByDrama = new Map(statsList.map(s => [s.dramaId, s]))

  return dramaRows.map(dramaRow => {
    const stats = statsByDrama.get(dramaRow.id as number)
    const snake = toSnakeCase(dramaRow as Record<string, unknown>)
    // Drop heavy TEXT columns the home list never reads (metadata can hold a
    // serialized premise/outline; the synopsis helper below already falls back
    // to description for novels, and the home card only renders description).
    // Trimming here is the difference between a 5–20 KB payload per project
    // and a ~1 KB one — multiplied across the page it shrinks the response
    // dramatically on the server.
    delete (snake as Record<string, unknown>).metadata
    return {
      ...snake,
      tags: dramaRow.tags ? JSON.parse(dramaRow.tags) : [],
      total_episodes: stats?.episodeCount ?? 0,
      character_count: stats?.characterCount ?? 0,
      scene_count: stats?.sceneCount ?? 0,
      written_count: stats?.writtenCount ?? 0,
      total_chars: stats?.totalChars ?? 0,
    }
  })
}

function buildProjectMetadataPatch(body: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updatedAt: now() }
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.genre !== undefined) updates.genre = body.genre
  if (body.status !== undefined) updates.status = body.status
  if (body.metadata !== undefined) updates.metadata = body.metadata
  if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags)
  return updates
}

export async function listUserProjects(query: ProjectListQuery) {
  const page = query.page || 1
  const pageSize = query.pageSize || 20
  const filter = {
    status: query.status,
    keyword: query.keyword,
    projectType: query.projectType,
  }

  // Push the WHERE/LIMIT/OFFSET into SQL so we never pull the user's full
  // project set into Node memory just to discard most of it. The COUNT uses
  // the same predicate so pagination stays consistent with what the client
  // sees in the response.
  const [pageRows, total] = await Promise.all([
    dramasRepo.listOwnedDramasPage(query.userId, filter, page, pageSize),
    dramasRepo.countOwnedDramas(query.userId, filter),
  ])
  const listItems = await buildProjectListItems(pageRows)

  return {
    items: listItems,
    pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
  }
}

export async function getUserProjectStats(userId: number) {
  // Aggregate entirely in SQL (GROUP BY status) so /dramas/stats never pulls
  // the user's full project set across the wire — the old path loaded every
  // drama row just to bucket it by status.
  const byStatus = await dramasRepo.countOwnedDramasByStatus(userId)
  const total = byStatus.reduce((sum, row) => sum + row.count, 0)
  return { total, by_status: byStatus }
}

export async function createUserProject(userId: number, body: Record<string, any>) {
  const ts = now()
  const projectKind = SUPPORTED_PROJECT_KINDS.includes(body.project_type)
    ? body.project_type
    : 'drama'
  const creatingNovel = projectKind === 'novel'
  const style = creatingNovel ? null : (normalizeDramaStyle(body.style) || 'realistic')
  let metadata = body.metadata ?? null
  if (creatingNovel) {
    metadata = mergeNovelMetadata(null, {
      premise: typeof body.premise === 'string' ? body.premise : undefined,
      novel_genre: typeof body.novel_genre === 'string' ? body.novel_genre : (body.genre || undefined),
      outline: typeof body.outline === 'string' ? body.outline : undefined,
    })
  }

  const insertResult = await dramasRepo.insertDrama({
    userId,
    title: body.title,
    description: body.description || (creatingNovel && body.premise ? body.premise : undefined),
    genre: creatingNovel ? (body.novel_genre || body.genre) : body.genre,
    projectType: projectKind,
    style,
    tags: body.tags ? JSON.stringify(body.tags) : null,
    metadata,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  })

  const newProject = await dramasRepo.findDramaById(Number(insertResult.lastInsertRowid))
  if (!newProject) throw new Error('创建项目失败')

  const unitTotal = body.total_episodes || (creatingNovel ? (body.total_chapters || 10) : 1)
  const unitSuffix = creatingNovel ? '章' : '集'
  await dramasRepo.seedEpisodeStubs(newProject.id, unitTotal, unitSuffix, ts)

  return toSnakeCase(newProject)
}

export async function getOwnedProjectDetail(
  userId: number,
  dramaId: number,
  includeEpisodes: boolean,
  includeAssets = true,
) {
  const drama = await dramaOwnedByUser(dramaId, userId)
  if (!drama) return null
  return assembleProjectDetailPayload(drama, includeEpisodes, includeAssets)
}

export async function assembleProjectDetailPayload(
  drama: DramaRow,
  includeEpisodes: boolean,
  includeAssets = true,
) {
  const payload: Record<string, unknown> = {
    ...toSnakeCase(drama),
    tags: drama.tags ? JSON.parse(drama.tags) : [],
    episode_stats: await computeEpisodeListStats(drama.id, isNovelProject(drama)),
    characters: [] as unknown[],
    scenes: [] as unknown[],
    props: [] as unknown[],
  }

  if (includeAssets) {
    const [chars, scns, prps] = await Promise.all([
      dramasRepo.listCharactersByDrama(drama.id),
      dramasRepo.listScenesByDrama(drama.id),
      dramasRepo.listPropsByDrama(drama.id),
    ])
    payload.characters = toSnakeCaseArray(chars)
    payload.scenes = toSnakeCaseArray(scns)
    payload.props = toSnakeCaseArray(prps)
  }

  if (includeEpisodes) {
    const eps = await dramasRepo.listActiveEpisodesByDrama(drama.id)
    payload.episodes = toSnakeCaseArray(eps)
  }

  if (isNovelProject(drama)) {
    const meta = parseNovelMetadata(drama.metadata)
    payload.novel_premise = meta.premise || drama.description || ''
    payload.novel_outline = meta.outline || ''
    payload.novel_genre = meta.novel_genre || drama.genre || ''
  }

  return payload
}

export async function updateOwnedProjectMetadata(userId: number, dramaId: number, body: Record<string, unknown>) {
  if (!(await dramaOwnedByUser(dramaId, userId))) return false
  const updates = buildProjectMetadataPatch(body)
  if (body.style !== undefined) updates.style = normalizeDramaStyle(body.style as string) || null
  await dramasRepo.updateDrama(dramaId, updates)
  return true
}

export async function deleteOwnedProject(userId: number, dramaId: number) {
  if (!(await dramaOwnedByUser(dramaId, userId))) return false
  await dramasRepo.softDeleteDrama(dramaId, now())
  return true
}

export async function saveOwnedProjectCharacters(userId: number, dramaId: number, characters: Record<string, unknown>[]) {
  if (!(await dramaOwnedByUser(dramaId, userId))) return false
  await dramaAssetsRepo.saveCharactersBatch(dramaId, characters, now())
  return true
}

export async function saveOwnedProjectEpisodes(userId: number, dramaId: number, episodes: Record<string, unknown>[]) {
  if (!(await dramaOwnedByUser(dramaId, userId))) return false
  await dramaAssetsRepo.saveEpisodesBatch(dramaId, episodes, now())
  return true
}

export async function getProjectById(id: number) {
  const row = await dramasRepo.findDramaById(id)
  return row ? toSnakeCase(row) : null
}

export async function requireOwnedProject(userId: number, dramaId: number) {
  return dramaOwnedByUser(dramaId, userId)
}

export async function listOwnedProjectEpisodes(
  userId: number,
  dramaId: number,
  query: { page?: number; pageSize?: number; filter?: EpisodeListFilter },
) {
  const drama = await dramaOwnedByUser(dramaId, userId)
  if (!drama) return null
  return listDramaEpisodes({
    dramaId,
    isNovel: isNovelProject(drama),
    page: query.page,
    pageSize: query.pageSize,
    filter: query.filter,
  })
}
