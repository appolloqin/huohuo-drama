import * as charactersRepo from '../../db/repos/characters/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import { now } from '../../common/http/response.js'
import { isNovelProject, mergeNovelMetadata } from '../../common/novel/novel-meta.js'
import {
  splitDramaEpisodes,
  splitNovelChapters,
  type ParsedUnit,
} from '../../common/template/template-text-parse.js'
import { fetchPageContentFromUrl } from './url-content-service.js'

export async function getPublishedTemplate(id: number) {
  return dramasRepo.findPublishedTemplate(id)
}

export async function cloneDramaFromTemplate(sourceId: number, userId: number): Promise<number> {
  const source = await getPublishedTemplate(sourceId)
  if (!source) throw new Error('模板不存在或已下架')

  const ts = now()
  const res = await dramasRepo.insertDrama({
    userId,
    title: `${source.title}（副本）`,
    description: source.description,
    genre: source.genre,
    projectType: source.projectType || 'drama',
    style: source.style,
    tags: source.tags,
    metadata: source.metadata,
    status: 'draft',
    isTemplate: 0,
    templateSummary: null,
    createdAt: ts,
    updatedAt: ts,
  })

  const newDramaId = res.lastInsertRowid

  const sourceEpisodes = (await dramasRepo.listActiveEpisodesByDrama(sourceId))
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
  for (const ep of sourceEpisodes) {
    await episodesRepo.insertEpisode({
      dramaId: newDramaId,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      content: ep.content,
      formattedScript: ep.formattedScript,
      scriptContent: ep.scriptContent,
      description: ep.description,
      duration: ep.duration ?? 0,
      status: 'draft',
      dramaImageConfigId: ep.dramaImageConfigId,
      dramaVideoConfigId: ep.dramaVideoConfigId,
      dramaAudioConfigId: ep.dramaAudioConfigId,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  const sourceChars = await dramasRepo.listActiveCharactersByDrama(sourceId)
  for (const ch of sourceChars) {
    await charactersRepo.insertCharacter({
      dramaId: newDramaId,
      name: ch.name,
      role: ch.role,
      description: ch.description,
      appearance: ch.appearance,
      personality: ch.personality,
      voiceId: ch.voiceId,
      sortOrder: ch.sortOrder,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  const sourceScenes = await dramasRepo.listActiveScenesByDrama(sourceId)
  for (const sc of sourceScenes) {
    await scenesRepo.insertScene({
      dramaId: newDramaId,
      location: sc.location,
      time: sc.time,
      prompt: sc.prompt,
      storyboardCount: sc.storyboardCount ?? 1,
      status: 'pending',
      createdAt: ts,
      updatedAt: ts,
    })
  }

  return newDramaId
}

async function publishDramaAsTemplate(dramaId: number, summary: string) {
  await dramasRepo.updateDrama(dramaId, {
    isTemplate: 1,
    templateSummary: summary || null,
    updatedAt: now(),
  })
}

async function insertTemplateUnits(
  dramaId: number,
  projectType: 'drama' | 'novel',
  units: ParsedUnit[],
  ts: string,
) {
  for (const u of units) {
    const isDrama = projectType === 'drama'
    await episodesRepo.insertEpisode({
      dramaId,
      episodeNumber: u.episodeNumber,
      title: u.title,
      content: u.body,
      scriptContent: null,
      formattedScript: null,
      status: 'draft',
      createdAt: ts,
      updatedAt: ts,
    })
  }
}

export async function createAndPublishTemplateFromText(args: {
  userId: number
  title: string
  projectType: 'drama' | 'novel'
  templateSummary?: string
  description?: string
  genre?: string
  rawText: string
}): Promise<number> {
  const ts = now()
  const { userId, title, projectType, templateSummary, description, genre, rawText } = args
  const text = rawText.trim()
  if (!text) throw new Error('内容不能为空')

  const units = projectType === 'novel'
    ? splitNovelChapters(text)
    : splitDramaEpisodes(text)

  let metadata: string | null = null
  if (projectType === 'novel') {
    const premise = (description || templateSummary || text.slice(0, 800)).trim()
    metadata = mergeNovelMetadata(null, { premise, novel_genre: genre || undefined })
  }

  const res = await dramasRepo.insertDrama({
    userId,
    title: title.trim(),
    description: description || templateSummary || text.slice(0, 500),
    genre: genre || null,
    projectType,
    style: projectType === 'drama' ? 'realistic' : null,
    metadata,
    status: 'draft',
    isTemplate: 1,
    isTemplateOnly: 1,
    templateSummary: templateSummary || description || text.slice(0, 300),
    createdAt: ts,
    updatedAt: ts,
  })

  const dramaId = res.lastInsertRowid
  await insertTemplateUnits(dramaId, projectType, units, ts)
  return dramaId
}

export async function createAndPublishTemplateFromUrl(args: {
  userId: number
  url: string
  projectType: 'drama' | 'novel'
  title?: string
  templateSummary?: string
}): Promise<number> {
  const { title: extractedTitle, text } = await fetchPageContentFromUrl(args.url)
  let title = (args.title || '').trim() || extractedTitle
  if (!title) title = '未命名模板'

  return createAndPublishTemplateFromText({
    userId: args.userId,
    title,
    projectType: args.projectType,
    templateSummary: args.templateSummary,
    description: text.slice(0, 500),
    rawText: text,
  })
}

export async function publishProjectAsTemplate(
  dramaId: number,
  userId: number,
  templateSummary?: string,
): Promise<void> {
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || drama.userId !== userId || drama.deletedAt) throw new Error('项目不存在')
  const summary = (templateSummary || '').trim() || drama.description || ''
  await publishDramaAsTemplate(dramaId, summary)
}
