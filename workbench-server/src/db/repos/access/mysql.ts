import { and, eq, isNull } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type {
  CharacterRow,
  DramaRow,
  EpisodeRow,
  ImageGenerationRow,
  PropRow,
  SceneRow,
  StoryboardRow,
  VideoGenerationRow,
  CharacterFormRow,
} from '../types.js'

const db = () => getMysqlDb()

export async function dramaOwnedByUser(dramaId: number, userId: number): Promise<DramaRow | null> {
  const rows = await db().select().from(schema.dramas)
    .where(and(
      eq(schema.dramas.id, dramaId),
      isNull(schema.dramas.deletedAt),
      eq(schema.dramas.userId, userId),
    ))
  return rows[0] ?? null
}

export async function episodeAndDramaForUser(
  episodeId: number,
  userId: number,
): Promise<{ episode: EpisodeRow; drama: DramaRow } | null> {
  const eps = await db().select().from(schema.episodes)
    .where(and(eq(schema.episodes.id, episodeId), isNull(schema.episodes.deletedAt)))
  const ep = eps[0]
  if (!ep) return null
  const drama = await dramaOwnedByUser(ep.dramaId, userId)
  if (!drama) return null
  return { episode: ep, drama }
}

export async function characterDramaForUser(
  characterId: number,
  userId: number,
): Promise<{ character: CharacterRow; drama: DramaRow } | null> {
  const chars = await db().select().from(schema.characters)
    .where(and(eq(schema.characters.id, characterId), isNull(schema.characters.deletedAt)))
  const ch = chars[0]
  if (!ch) return null
  const drama = await dramaOwnedByUser(ch.dramaId, userId)
  if (!drama) return null
  return { character: ch, drama }
}

export async function sceneDramaForUser(
  sceneId: number,
  userId: number,
): Promise<{ scene: SceneRow; drama: DramaRow } | null> {
  const scenes = await db().select().from(schema.scenes)
    .where(and(eq(schema.scenes.id, sceneId), isNull(schema.scenes.deletedAt)))
  const sc = scenes[0]
  if (!sc) return null
  const drama = await dramaOwnedByUser(sc.dramaId, userId)
  if (!drama) return null
  return { scene: sc, drama }
}

export async function characterFormDramaForUser(
  formId: number,
  userId: number,
): Promise<{ form: CharacterFormRow; drama: DramaRow } | null> {
  const forms = await db().select().from(schema.characterForms)
    .where(and(eq(schema.characterForms.id, formId), isNull(schema.characterForms.deletedAt)))
  const form = forms[0]
  if (!form) return null
  const drama = await dramaOwnedByUser(form.dramaId, userId)
  if (!drama) return null
  return { form, drama }
}

export async function propDramaForUser(
  propId: number,
  userId: number,
): Promise<{ prop: PropRow; drama: DramaRow } | null> {
  const props = await db().select().from(schema.props)
    .where(and(eq(schema.props.id, propId), isNull(schema.props.deletedAt)))
  const prop = props[0]
  if (!prop) return null
  const drama = await dramaOwnedByUser(prop.dramaId, userId)
  if (!drama) return null
  return { prop, drama }
}

export async function storyboardEpisodeForUser(
  storyboardId: number,
  userId: number,
): Promise<{ storyboard: StoryboardRow; episode: EpisodeRow; drama: DramaRow } | null> {
  const boards = await db().select().from(schema.storyboards)
    .where(and(eq(schema.storyboards.id, storyboardId), isNull(schema.storyboards.deletedAt)))
  const sb = boards[0]
  if (!sb) return null
  const pack = await episodeAndDramaForUser(sb.episodeId, userId)
  if (!pack) return null
  return { storyboard: sb, episode: pack.episode, drama: pack.drama }
}

export async function imageGenerationForUser(genId: number, userId: number): Promise<ImageGenerationRow | null> {
  const rows = await db().select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, genId))
  const row = rows[0]
  if (!row) return null
  if (row.dramaId != null) return (await dramaOwnedByUser(row.dramaId, userId)) ? row : null
  if (row.storyboardId != null) return (await storyboardEpisodeForUser(row.storyboardId, userId)) ? row : null
  return null
}

export async function videoGenerationForUser(genId: number, userId: number): Promise<VideoGenerationRow | null> {
  const rows = await db().select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, genId))
  const row = rows[0]
  if (!row) return null
  if (row.dramaId != null) return (await dramaOwnedByUser(row.dramaId, userId)) ? row : null
  if (row.storyboardId != null) return (await storyboardEpisodeForUser(row.storyboardId, userId)) ? row : null
  return null
}

export async function storyboardsOwnedByUser(storyboardIds: number[], userId: number): Promise<boolean> {
  const ids = [...new Set(storyboardIds.filter(Boolean))]
  if (!ids.length) return false
  for (const sid of ids) {
    if (!(await storyboardEpisodeForUser(sid, userId))) return false
  }
  return true
}
