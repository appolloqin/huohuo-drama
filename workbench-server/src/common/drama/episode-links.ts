import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../http/response.js'

/** 将角色关联到本集（幂等） */
export async function linkCharacterToEpisode(episodeId: number, characterId: number) {
  const exists = await episodesRepo.episodeCharacterLinkExists(episodeId, characterId)
  if (!exists) {
    await episodesRepo.insertEpisodeCharacterLink(episodeId, characterId, now())
  }
}

export async function linkCharactersToEpisode(episodeId: number, characterIds: Iterable<number>) {
  for (const characterId of new Set(characterIds)) {
    if (characterId) await linkCharacterToEpisode(episodeId, characterId)
  }
}
