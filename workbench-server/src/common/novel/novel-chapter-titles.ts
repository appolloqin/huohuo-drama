import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../http/response.js'
import { isGenericChapterTitle, parseChapterTitles } from './novel-outline.js'

/** 从全书大纲同步章节标题到 episodes.title（仅覆盖默认「第N章」） */
export async function syncChapterTitlesFromOutline(dramaId: number, outline: string): Promise<number> {
  const titles = parseChapterTitles(outline)
  if (!titles.size) return 0

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const ts = now()
  let updated = 0
  for (const ep of episodes) {
    const parsed = titles.get(ep.episodeNumber)
    if (!parsed) continue
    const current = (ep.title || '').trim()
    if (current && !isGenericChapterTitle(current, ep.episodeNumber)) continue
    await episodesRepo.updateEpisode(ep.id, { title: parsed, updatedAt: ts })
    updated++
  }
  return updated
}
