import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../http/response.js'
import { isGenericChapterTitle, parseChapterTitles } from './novel-outline.js'

/** 从全书大纲同步章节标题到 episodes.title */
export async function syncChapterTitlesFromOutline(
  dramaId: number,
  outline: string,
  opts?: { force?: boolean },
): Promise<number> {
  const titles = parseChapterTitles(outline)
  if (!titles.size) return 0
  const force = opts?.force === true

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const ts = now()
  let updated = 0
  for (const ep of episodes) {
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
