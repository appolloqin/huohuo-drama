import * as charactersRepo from '../../db/repos/characters/index.js'
import * as characterFormsRepo from '../../db/repos/character-forms/index.js'
import * as propsRepo from '../../db/repos/props/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import { now } from '../../common/http/response.js'
import { linkCharacterToEpisode } from '../../common/drama/episode-links.js'

export async function linkPropToEpisode(episodeId: number, propId: number) {
  const exists = await episodesRepo.episodePropLinkExists(episodeId, propId)
  if (!exists) {
    await episodesRepo.insertEpisodePropLink(episodeId, propId, now())
  }
}

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

export async function queryProjectCharacterFormsCatalog(dramaId: number, episodeId: number) {
  const linkedCharIds = new Set(
    (await episodesRepo.listEpisodeCharacterLinks(episodeId)).map(link => link.characterId),
  )
  const forms = await characterFormsRepo.listActiveCharacterFormsByDrama(dramaId)
  const characters = await charactersRepo.listActiveCharactersByDrama(dramaId)
  const charNameById = new Map(characters.map(c => [c.id, c.name]))

  return {
    count: forms.length,
    character_forms: forms.map(form => ({
      ...form,
      character_name: charNameById.get(form.characterId) || '',
    })),
    current_episode_forms: forms.filter(form => linkedCharIds.has(form.characterId)),
  }
}

export async function queryProjectPropsCatalog(dramaId: number, episodeId: number) {
  const linkedPropIds = new Set(
    (await episodesRepo.listEpisodePropLinks(episodeId)).map(link => link.propId),
  )
  const props = await propsRepo.listActivePropsByDrama(dramaId)
  const characters = await charactersRepo.listActiveCharactersByDrama(dramaId)
  const charNameById = new Map(characters.map(c => [c.id, c.name]))
  const forms = await characterFormsRepo.listActiveCharacterFormsByDrama(dramaId)
  const formNameById = new Map(forms.map(f => [f.id, f.name]))

  return {
    count: props.length,
    props: props.map(prop => ({
      ...prop,
      character_name: prop.characterId ? charNameById.get(prop.characterId) || '' : '',
      character_form_name: prop.characterFormId ? formNameById.get(prop.characterFormId) || '' : '',
    })),
    current_episode_props: props.filter(prop => linkedPropIds.has(prop.id)),
  }
}

export async function upsertCharacterFormsWithDedup(
  episodeId: number,
  dramaId: number,
  forms: Array<{
    character_name: string
    name: string
    appearance?: string
    description?: string
    prompt?: string
  }>,
) {
  const timestamp = now()
  const results = { created: 0, merged: 0, skipped: 0 }

  for (const input of forms) {
    const baseChar = await charactersRepo.findActiveCharacterByName(dramaId, input.character_name.trim())
    if (!baseChar) {
      results.skipped++
      continue
    }
    await linkCharacterToEpisode(episodeId, baseChar.id)

    const existing = await characterFormsRepo.findActiveCharacterFormByName(baseChar.id, input.name.trim())
    if (existing) {
      await characterFormsRepo.updateCharacterForm(existing.id, {
        appearance: input.appearance || existing.appearance,
        description: input.description || existing.description,
        prompt: input.prompt || existing.prompt,
        updatedAt: timestamp,
      })
      results.merged++
      continue
    }

    await characterFormsRepo.insertCharacterForm({
      dramaId,
      characterId: baseChar.id,
      name: input.name.trim(),
      appearance: input.appearance || null,
      description: input.description || null,
      prompt: input.prompt || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    results.created++
  }

  return {
    message: `衍生形态保存完成：新增 ${results.created}，合并 ${results.merged}，跳过 ${results.skipped}`,
    ...results,
  }
}

export async function upsertPropsWithDedup(
  episodeId: number,
  dramaId: number,
  props: Array<{
    name: string
    type?: string
    description?: string
    prompt?: string
    character_name?: string
    character_form_name?: string
  }>,
) {
  const timestamp = now()
  const results = { created: 0, merged: 0 }

  for (const input of props) {
    let characterId: number | null = null
    let characterFormId: number | null = null

    if (input.character_name?.trim()) {
      const baseChar = await charactersRepo.findActiveCharacterByName(dramaId, input.character_name.trim())
      if (baseChar) {
        characterId = baseChar.id
        await linkCharacterToEpisode(episodeId, baseChar.id)
        if (input.character_form_name?.trim()) {
          const form = await characterFormsRepo.findActiveCharacterFormByName(baseChar.id, input.character_form_name.trim())
          if (form) characterFormId = form.id
        }
      }
    }

    const existing = await propsRepo.findActivePropByName(dramaId, input.name.trim())
    if (existing) {
      await propsRepo.updateProp(existing.id, {
        type: input.type || existing.type,
        description: input.description || existing.description,
        prompt: input.prompt || existing.prompt,
        characterId: characterId ?? existing.characterId,
        characterFormId: characterFormId ?? existing.characterFormId,
        updatedAt: timestamp,
      })
      await linkPropToEpisode(episodeId, existing.id)
      results.merged++
      continue
    }

    const insertResult = await propsRepo.insertProp({
      dramaId,
      name: input.name.trim(),
      type: input.type || null,
      description: input.description || null,
      prompt: input.prompt || null,
      characterId,
      characterFormId,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await linkPropToEpisode(episodeId, insertResult.lastInsertRowid)
    results.created++
  }

  return {
    message: `道具保存完成：新增 ${results.created}，合并 ${results.merged}`,
    ...results,
  }
}
