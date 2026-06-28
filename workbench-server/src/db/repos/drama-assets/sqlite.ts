import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'

const db = () => getSqliteDb()

export function saveCharactersBatch(dramaId: number, rows: Record<string, unknown>[], timestamp: string): void {
  for (const char of rows) {
    if (char.id) {
      db().update(schema.characters)
        .set({ ...char, updatedAt: timestamp })
        .where(eq(schema.characters.id, Number(char.id)))
        .run()
    } else {
      db().insert(schema.characters).values({
        ...char,
        dramaId,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as typeof schema.characters.$inferInsert).run()
    }
  }
}

export function saveEpisodesBatch(dramaId: number, rows: Record<string, unknown>[], timestamp: string): void {
  for (const ep of rows) {
    if (ep.id) {
      db().update(schema.episodes)
        .set({ ...ep, updatedAt: timestamp })
        .where(eq(schema.episodes.id, Number(ep.id)))
        .run()
    } else {
      db().insert(schema.episodes).values({
        ...ep,
        dramaId,
        episodeNumber: Number(ep.episode_number || ep.episodeNumber || 1),
        title: String(ep.title || '未命名'),
        createdAt: timestamp,
        updatedAt: timestamp,
      } as typeof schema.episodes.$inferInsert).run()
    }
  }
}
