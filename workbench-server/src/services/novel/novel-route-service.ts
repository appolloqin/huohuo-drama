import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import type { EpisodeRow } from '../../db/repos/types.js'
import { now } from '../../common/http/response.js'

export async function updateNovelDrama(id: number, patch: Record<string, unknown>) {
  await dramasRepo.updateDrama(id, patch)
}

export async function listNovelChapters(dramaId: number) {
  return dramasRepo.listActiveEpisodesByDrama(dramaId)
}

export async function listOrderedNovelChapters(dramaId: number) {
  return episodesRepo.listSiblingEpisodesOrdered(dramaId)
}

export async function createNovelChapter(
  dramaId: number,
  title: string,
): Promise<EpisodeRow | null> {
  const existing = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const nextNum = existing.length ? Math.max(...existing.map((e) => e.episodeNumber)) + 1 : 1
  const ts = now()
  const res = await episodesRepo.insertEpisode({
    dramaId,
    episodeNumber: nextNum,
    title: title || `第${nextNum}章`,
    status: 'draft',
    createdAt: ts,
    updatedAt: ts,
  })
  return episodesRepo.findEpisodeById(Number(res.lastInsertRowid))
}

export async function updateNovelChapter(id: number, patch: Record<string, unknown>) {
  await episodesRepo.updateEpisode(id, patch)
}
