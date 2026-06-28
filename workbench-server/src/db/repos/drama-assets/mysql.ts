import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'

const db = () => getMysqlDb()

export async function saveCharactersBatch(dramaId: number, rows: Record<string, unknown>[], timestamp: string): Promise<void> {
  for (const char of rows) {
    if (char.id) {
      await db().update(schema.characters)
        .set({ ...char, updatedAt: timestamp })
        .where(eq(schema.characters.id, Number(char.id)))
    } else {
      await db().insert(schema.characters).values({
        ...char,
        dramaId,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as typeof schema.characters.$inferInsert)
    }
  }
}

export async function saveEpisodesBatch(dramaId: number, rows: Record<string, unknown>[], timestamp: string): Promise<void> {
  for (const ep of rows) {
    if (ep.id) {
      await db().update(schema.episodes)
        .set({ ...ep, updatedAt: timestamp })
        .where(eq(schema.episodes.id, Number(ep.id)))
    } else {
      await db().insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber: Number(ep.episode_number || ep.episodeNumber || 1),
        title: String(ep.title || '未命名'),
        createdAt: timestamp,
        updatedAt: timestamp,
      } as typeof schema.episodes.$inferInsert)
    }
  }
}
