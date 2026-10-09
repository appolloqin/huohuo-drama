import { desc, eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { NovelHotRankItemRow } from '../types.js'
import type { NovelHotRankItemInsert } from './sqlite.js'

const db = () => getMysqlDb()

export async function listByPlatform(platform: string): Promise<NovelHotRankItemRow[]> {
  return db()
    .select()
    .from(schema.novelHotRankItems)
    .where(eq(schema.novelHotRankItems.platform, platform))
    .orderBy(desc(schema.novelHotRankItems.heat))
}

export async function deleteByPlatform(platform: string): Promise<void> {
  await db().delete(schema.novelHotRankItems).where(eq(schema.novelHotRankItems.platform, platform))
}

export async function upsertMany(rows: NovelHotRankItemInsert[]): Promise<void> {
  if (!rows.length) return
  for (const row of rows) {
    await db()
      .insert(schema.novelHotRankItems)
      .values(row)
      .onDuplicateKeyUpdate({
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
  }
}

export async function replacePlatform(platform: string, rows: NovelHotRankItemInsert[]): Promise<void> {
  await deleteByPlatform(platform)
  if (!rows.length) return
  await db().insert(schema.novelHotRankItems).values(rows)
}
