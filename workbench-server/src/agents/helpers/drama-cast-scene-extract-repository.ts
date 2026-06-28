import * as charactersRepo from '../../db/repos/characters/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import { now } from '../../common/http/response.js'
import { linkCharacterToEpisode } from '../../common/drama/episode-links.js'

export async function attachSceneToEpisode(episodeId: number, sceneId: number) {
  const exists = await episodesRepo.episodeSceneLinkExists(episodeId, sceneId)
  if (!exists) {
    await episodesRepo.insertEpisodeSceneLink(episodeId, sceneId, now())
  }
}

export async function fetchScreenplayForCastSceneExtract(episodeId: number) {
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode) return { ok: false as const, error: 'Episode not found' }
  const script = episode.formattedScript || episode.content
  if (!script) return { ok: false as const, error: 'Episode has no script content' }
  return { ok: true as const, script }
}

export async function queryProjectCastCatalog(dramaId: number, episodeId: number) {
  const linkedIds = new Set(
    (await episodesRepo.listEpisodeCharacterLinks(episodeId)).map(link => link.characterId),
  )
  const characters = await charactersRepo.listActiveCharactersByDrama(dramaId)

  return {
    count: characters.length,
    characters,
    currentEpisodeCharacters: characters.filter(item => linkedIds.has(item.id)),
  }
}

export async function queryProjectLocationCatalog(dramaId: number, episodeId: number) {
  const linkedIds = new Set(
    (await episodesRepo.listEpisodeSceneLinks(episodeId)).map(link => link.sceneId),
  )
  const scenes = await scenesRepo.listActiveScenesByDrama(dramaId)

  return {
    count: scenes.length,
    scenes,
    currentEpisodeScenes: scenes.filter(item => linkedIds.has(item.id)),
  }
}

export async function upsertCastWithDedup(
  episodeId: number,
  dramaId: number,
  characters: Array<{
    name: string
    role?: string
    description?: string
    appearance?: string
    personality?: string
  }>,
) {
  const timestamp = now()
  const results = { created: 0, merged: 0 }

  for (const input of characters) {
    const existing = await charactersRepo.findActiveCharacterByName(dramaId, input.name)

    if (existing) {
      await charactersRepo.updateCharacter(existing.id, {
        role: input.role || existing.role,
        description: input.description || existing.description,
        appearance: input.appearance || existing.appearance,
        personality: input.personality || existing.personality,
        updatedAt: timestamp,
      })
      await linkCharacterToEpisode(episodeId, existing.id)
      results.merged++
      continue
    }

    const insertResult = await charactersRepo.insertCharacter({
      name: input.name,
      role: input.role || '',
      description: input.description || '',
      appearance: input.appearance || '',
      personality: input.personality || '',
      dramaId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await linkCharacterToEpisode(episodeId, insertResult.lastInsertRowid)
    results.created++
  }

  return {
    message: `角色保存完成：新增 ${results.created}，合并更新 ${results.merged}`,
    ...results,
  }
}

export async function upsertLocationsWithDedup(
  episodeId: number,
  dramaId: number,
  scenes: Array<{ location: string; time?: string; prompt?: string }>,
) {
  const timestamp = now()
  const results = { created: 0, reused: 0 }

  for (const input of scenes) {
    const time = input.time || ''
    const existing = await scenesRepo.findActiveSceneByLocationTime(dramaId, input.location, time)
    if (existing) {
      await attachSceneToEpisode(episodeId, existing.id)
      results.reused++
      continue
    }

    const insertResult = await scenesRepo.insertScene({
      dramaId,
      location: input.location,
      time,
      prompt: input.prompt || input.location,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await attachSceneToEpisode(episodeId, insertResult.lastInsertRowid)
    results.created++
  }

  return {
    message: `场景保存完成：新增 ${results.created}，复用已有 ${results.reused}`,
    ...results,
  }
}
