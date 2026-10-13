import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../http/response.js'
import {
  extractChapterOutline,
  isGenericChapterTitle,
  parseChapterTitles,
} from './novel-outline.js'

/** 从全书大纲同步章节标题到 episodes.title */
export async function syncChapterTitlesFromOutline(
  dramaId: number,
  outline: string,
  opts?: { force?: boolean; fromChapter?: number },
): Promise<number> {
  const titles = parseChapterTitles(outline)
  if (!titles.size) return 0
  const force = opts?.force === true
  const fromChapter = Math.floor(Number(opts?.fromChapter))
  const minChapter = fromChapter >= 1 ? fromChapter : 1

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const ts = now()
  let updated = 0
  for (const ep of episodes) {
    if (ep.episodeNumber < minChapter) continue
    const parsed = titles.get(ep.episodeNumber)
    if (!parsed) continue
    const current = (ep.title || '').trim()
    if (!force && current && !isGenericChapterTitle(current, ep.episodeNumber)) continue
    if (current === parsed) continue
    await episodesRepo.updateEpisode(ep.id, { title: parsed, updatedAt: ts })
    updated++
  }
  return updated
}

/**
 * 全书大纲 → 各集 description（本章大纲）下推。
 * 避免「总纲已重生、集内仍是旧分章」；写章时 resolve/回写会把旧章纲盖回总纲。
 */
export async function syncEpisodeChapterOutlinesFromBookOutline(
  dramaId: number,
  outline: string,
  opts?: { fromChapter?: number },
): Promise<number> {
  const book = (outline || '').trim()
  if (!book) return 0
  const fromChapter = Math.floor(Number(opts?.fromChapter))
  const minChapter = fromChapter >= 1 ? fromChapter : 1

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const ts = now()
  let updated = 0
  for (const ep of episodes) {
    if (ep.episodeNumber < minChapter) continue
    const section = extractChapterOutline(book, ep.episodeNumber).trim()
    if (!section) continue
    const current = (ep.description || '').trim()
    if (current === section) continue
    await episodesRepo.updateEpisode(ep.id, { description: section, updatedAt: ts })
    updated++
  }
  return updated
}
