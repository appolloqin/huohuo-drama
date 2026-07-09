import { isMysqlDriver } from '../../driver.js'
import type {
  CharacterRow,
  CharacterFormRow,
  DramaRow,
  EpisodeRow,
  ImageGenerationRow,
  PropRow,
  SceneRow,
  StoryboardRow,
  VideoGenerationRow,
} from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function dramaOwnedByUser(dramaId: number, userId: number): Promise<DramaRow | null> {
  return isMysqlDriver()
    ? mysql.dramaOwnedByUser(dramaId, userId)
    : sqlite.dramaOwnedByUser(dramaId, userId)
}

export async function episodeAndDramaForUser(
  episodeId: number,
  userId: number,
): Promise<{ episode: EpisodeRow; drama: DramaRow } | null> {
  return isMysqlDriver()
    ? mysql.episodeAndDramaForUser(episodeId, userId)
    : sqlite.episodeAndDramaForUser(episodeId, userId)
}

export async function characterDramaForUser(
  characterId: number,
  userId: number,
): Promise<{ character: CharacterRow; drama: DramaRow } | null> {
  return isMysqlDriver()
    ? mysql.characterDramaForUser(characterId, userId)
    : sqlite.characterDramaForUser(characterId, userId)
}

export async function sceneDramaForUser(
  sceneId: number,
  userId: number,
): Promise<{ scene: SceneRow; drama: DramaRow } | null> {
  return isMysqlDriver()
    ? mysql.sceneDramaForUser(sceneId, userId)
    : sqlite.sceneDramaForUser(sceneId, userId)
}

export async function characterFormDramaForUser(
  formId: number,
  userId: number,
): Promise<{ form: CharacterFormRow; drama: DramaRow } | null> {
  return isMysqlDriver()
    ? mysql.characterFormDramaForUser(formId, userId)
    : sqlite.characterFormDramaForUser(formId, userId)
}

export async function propDramaForUser(
  propId: number,
  userId: number,
): Promise<{ prop: PropRow; drama: DramaRow } | null> {
  return isMysqlDriver()
    ? mysql.propDramaForUser(propId, userId)
    : sqlite.propDramaForUser(propId, userId)
}

export async function storyboardEpisodeForUser(
  storyboardId: number,
  userId: number,
): Promise<{ storyboard: StoryboardRow; episode: EpisodeRow; drama: DramaRow } | null> {
  return isMysqlDriver()
    ? mysql.storyboardEpisodeForUser(storyboardId, userId)
    : sqlite.storyboardEpisodeForUser(storyboardId, userId)
}

export async function imageGenerationForUser(genId: number, userId: number): Promise<ImageGenerationRow | null> {
  return isMysqlDriver()
    ? mysql.imageGenerationForUser(genId, userId)
    : sqlite.imageGenerationForUser(genId, userId)
}

export async function videoGenerationForUser(genId: number, userId: number): Promise<VideoGenerationRow | null> {
  return isMysqlDriver()
    ? mysql.videoGenerationForUser(genId, userId)
    : sqlite.videoGenerationForUser(genId, userId)
}

export async function storyboardsOwnedByUser(storyboardIds: number[], userId: number): Promise<boolean> {
  return isMysqlDriver()
    ? mysql.storyboardsOwnedByUser(storyboardIds, userId)
    : sqlite.storyboardsOwnedByUser(storyboardIds, userId)
}
