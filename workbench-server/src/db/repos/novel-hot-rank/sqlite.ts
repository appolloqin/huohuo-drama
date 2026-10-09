import { desc, eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { NovelHotRankItemRow } from '../types.js'

const db = () => getSqliteDb()

export type NovelHotRankItemInsert = typeof schema.novelHotRankItems.$inferInsert

export function listByPlatform(platform: string): NovelHotRankItemRow[] {
  return db()
    .select()
    .from(schema.novelHotRankItems)
    .where(eq(schema.novelHotRankItems.platform, platform))
    .orderBy(desc(schema.novelHotRankItems.heat))
    .all()
}

export function deleteByPlatform(platform: string): void {
  db().delete(schema.novelHotRankItems).where(eq(schema.novelHotRankItems.platform, platform)).run()
}

export function upsertMany(rows: NovelHotRankItemInsert[]): void {
  if (!rows.length) return
  for (const row of rows) {
    db()
      .insert(schema.novelHotRankItems)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.novelHotRankItems.platform, schema.novelHotRankItems.externalId],
        set: {
          title: row.title,
          tagsJson: row.tagsJson,
          heat: row.heat,
          blurbShort: row.blurbShort,
          mappedGenrePrimary: row.mappedGenrePrimary,
          mappedGenreSecondaryJson: row.mappedGenreSecondaryJson,
          mappedWorldviewId: row.mappedWorldviewId,
          mappedCultivationId: row.mappedCultivationId,
          mappedGoldenFingerId: row.mappedGoldenFingerId,
          mapSource: row.mapSource,
          fetchedAt: row.fetchedAt,
        },
      })
      .run()
  }
}

/** Delete platform rows then insert — atomic-enough for P1 cache replace. */
export function replacePlatform(platform: string, rows: NovelHotRankItemInsert[]): void {
  db().transaction((tx) => {
    tx.delete(schema.novelHotRankItems).where(eq(schema.novelHotRankItems.platform, platform)).run()
    if (!rows.length) return
    tx.insert(schema.novelHotRankItems).values(rows).run()
  })
}
