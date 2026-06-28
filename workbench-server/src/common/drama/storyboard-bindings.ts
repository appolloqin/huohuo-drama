import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'

/**
 * 校验分镜绑定的场景与角色。
 * 角色须为本项目（与分集同 drama）下未删除的角色；保存分镜后由调用方写入 episode_characters。
 */
export async function validateStoryboardBindings(
  episodeId: number,
  sceneId: number | null | undefined,
  characterIds: number[] | undefined,
) {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  if (!ep) throw new Error('分集不存在')

  const episodeSceneIds = new Set(
    (await episodesRepo.listEpisodeSceneLinks(episodeId)).map(link => link.sceneId),
  )

  if (sceneId != null && !episodeSceneIds.has(sceneId)) {
    throw new Error('scene_id 必须来自当前集已关联场景')
  }

  const ids = characterIds || []
  if (!ids.length) return

  const dramaChars = (await dramasRepo.listCharactersByDrama(ep.dramaId))
    .filter(c => !c.deletedAt)
  const validIds = new Set(dramaChars.map(c => c.id))
  const invalid = ids.filter(id => !validIds.has(id))
  if (invalid.length) {
    throw new Error(`character_ids 必须来自本项目且未删除: ${invalid.join(', ')}`)
  }
}
