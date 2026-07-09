import * as characterFormsRepo from '../../db/repos/character-forms/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as propsRepo from '../../db/repos/props/index.js'

export type StoryboardCastBindingInput = {
  character_id: number
  character_form_id?: number | null
}

/**
 * 校验分镜绑定的场景、角色、衍生形态与道具。
 */
export async function validateStoryboardBindings(
  episodeId: number,
  sceneId: number | null | undefined,
  characterIds: number[] | undefined,
  castBindings?: StoryboardCastBindingInput[],
  propIds?: number[],
) {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  if (!ep) throw new Error('分集不存在')

  const episodeSceneIds = new Set(
    (await episodesRepo.listEpisodeSceneLinks(episodeId)).map(link => link.sceneId),
  )

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id 必须来自当前集已关联场景')
  }

  const bindings = castBindings?.length
    ? castBindings
    : (characterIds || []).map(id => ({ character_id: id, character_form_id: null }))

  if (bindings.length) {
    const dramaChars = (await dramasRepo.listCharactersByDrama(ep.dramaId))
      .filter(c => !c.deletedAt)
    const validCharIds = new Set(dramaChars.map(c => c.id))
    const invalidChars = bindings.filter(b => !validCharIds.has(b.character_id))
    if (invalidChars.length) {
      throw new Error(`character_id 必须来自本项目且未删除: ${invalidChars.map(b => b.character_id).join(', ')}`)
    }

    const dramaForms = await characterFormsRepo.listActiveCharacterFormsByDrama(ep.dramaId)
    const formById = new Map(dramaForms.map(f => [f.id, f]))
    for (const binding of bindings) {
      if (binding.character_form_id == null) continue
      const form = formById.get(binding.character_form_id)
      if (!form || form.characterId !== binding.character_id) {
        throw new Error(`character_form_id ${binding.character_form_id} 与角色 ${binding.character_id} 不匹配`)
      }
    }
  }

  const ids = propIds || []
  if (!ids.length) return

  const dramaProps = (await propsRepo.listActivePropsByDrama(ep.dramaId))
  const validPropIds = new Set(dramaProps.map(p => p.id))
  const invalidProps = ids.filter(id => !validPropIds.has(id))
  if (invalidProps.length) {
    throw new Error(`prop_ids 必须来自本项目且未删除: ${invalidProps.join(', ')}`)
  }
}

export function normalizeCastBindings(body: Record<string, unknown>): StoryboardCastBindingInput[] {
  if (Array.isArray(body.cast_bindings)) {
    return body.cast_bindings.map((item: any) => ({
      character_id: Number(item.character_id),
      character_form_id: item.character_form_id != null ? Number(item.character_form_id) : null,
    })).filter(item => item.character_id)
  }
  if (Array.isArray(body.character_ids)) {
    return body.character_ids.map((id: number) => ({
      character_id: Number(id),
      character_form_id: null,
    })).filter(item => item.character_id)
  }
  return []
}
