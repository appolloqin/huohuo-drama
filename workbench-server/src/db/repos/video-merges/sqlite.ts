import { and, eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, VideoMergeRow } from '../types.js'

const db = () => getSqliteDb()

export type NewVideoMergeInput = typeof schema.videoMerges.$inferInsert

export function insertVideoMerge(input: NewVideoMergeInput): DbRunResult {
  const res = db().insert(schema.videoMerges).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateVideoMerge(id: number, patch: Record<string, unknown>): void {
  db().update(schema.videoMerges).set(patch).where(eq(schema.videoMerges.id, id)).run()
}

export function findVideoMergeById(id: number): VideoMergeRow | undefined {
  return db().select().from(schema.videoMerges).where(eq(schema.videoMerges.id, id)).get()
}

export function listVideoMergesByEpisode(episodeId: number): VideoMergeRow[] {
  return db().select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId)).all()
}

export function listVideoMergesByEpisodeAndPipeline(episodeId: number, motionPipeline: string): VideoMergeRow[] {
  return db().select().from(schema.videoMerges)
    .where(and(eq(schema.videoMerges.episodeId, episodeId), eq(schema.videoMerges.motionPipeline, motionPipeline)))
    .all()
}
