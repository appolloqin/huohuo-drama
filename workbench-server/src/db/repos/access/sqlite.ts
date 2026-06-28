import { and, eq, isNull } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type {
  CharacterRow,
  DramaRow,
  EpisodeRow,
  ImageGenerationRow,
  SceneRow,
  StoryboardRow,
  VideoGenerationRow,
} from '../types.js'

const db = () => getSqliteDb()

export function dramaOwnedByUser(dramaId: number, userId: number): DramaRow | null {
  const [row] = db().select().from(schema.dramas)
    .where(and(
      eq(schema.dramas.id, dramaId),
      isNull(schema.dramas.deletedAt),
      eq(schema.dramas.userId, userId),
    )).all()
  return row ?? null
}

export function episodeAndDramaForUser(episodeId: number, userId: number): { episode: EpisodeRow; drama: DramaRow } | null {
  const [ep] = db().select().from(schema.episodes)
    .where(and(eq(schema.episodes.id, episodeId), isNull(schema.episodes.deletedAt))).all()
  if (!ep) return null
  const drama = dramaOwnedByUser(ep.dramaId, userId)
  if (!drama) return null
  return { episode: ep, drama }
}

export function characterDramaForUser(characterId: number, userId: number): { character: CharacterRow; drama: DramaRow } | null {
  const [ch] = db().select().from(schema.characters)
    .where(and(eq(schema.characters.id, characterId), isNull(schema.characters.deletedAt))).all()
  if (!ch) return null
  const drama = dramaOwnedByUser(ch.dramaId, userId)
  if (!drama) return null
  return { character: ch, drama }
}

export function sceneDramaForUser(sceneId: number, userId: number): { scene: SceneRow; drama: DramaRow } | null {
  const [sc] = db().select().from(schema.scenes)
    .where(and(eq(schema.scenes.id, sceneId), isNull(schema.scenes.deletedAt))).all()
  if (!sc) return null
  const drama = dramaOwnedByUser(sc.dramaId, userId)
  if (!drama) return null
  return { scene: sc, drama }
}

export function storyboardEpisodeForUser(storyboardId: number, userId: number): {
  storyboard: StoryboardRow
  episode: EpisodeRow
  drama: DramaRow
} | null {
  const [sb] = db().select().from(schema.storyboards)
    .where(and(eq(schema.storyboards.id, storyboardId), isNull(schema.storyboards.deletedAt))).all()
  if (!sb) return null
  const pack = episodeAndDramaForUser(sb.episodeId, userId)
  if (!pack) return null
  return { storyboard: sb, episode: pack.episode, drama: pack.drama }
}

export function imageGenerationForUser(genId: number, userId: number): ImageGenerationRow | null {
  const [row] = db().select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, genId)).all()
  if (!row) return null
  if (row.dramaId != null) return dramaOwnedByUser(row.dramaId, userId) ? row : null
  if (row.storyboardId != null) return storyboardEpisodeForUser(row.storyboardId, userId) ? row : null
  return null
}

export function videoGenerationForUser(genId: number, userId: number): VideoGenerationRow | null {
  const [row] = db().select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, genId)).all()
  if (!row) return null
  if (row.dramaId != null) return dramaOwnedByUser(row.dramaId, userId) ? row : null
  if (row.storyboardId != null) return storyboardEpisodeForUser(row.storyboardId, userId) ? row : null
  return null
}

export function storyboardsOwnedByUser(storyboardIds: number[], userId: number): boolean {
  const ids = [...new Set(storyboardIds.filter(Boolean))]
  if (!ids.length) return false
  for (const sid of ids) {
    if (!storyboardEpisodeForUser(sid, userId)) return false
  }
  return true
}
