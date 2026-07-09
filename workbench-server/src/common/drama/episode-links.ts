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

/** 将道具关联到本集（幂等） */
export async function linkPropToEpisode(episodeId: number, propId: number) {
  const exists = await episodesRepo.episodePropLinkExists(episodeId, propId)
  if (!exists) {
    await episodesRepo.insertEpisodePropLink(episodeId, propId, now())
  }
}

export async function linkPropsToEpisode(episodeId: number, propIds: Iterable<number>) {
  for (const propId of new Set(propIds)) {
    if (propId) await linkPropToEpisode(episodeId, propId)
  }
}
