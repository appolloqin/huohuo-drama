import { and, eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, VideoMergeRow } from '../types.js'
import type { NewVideoMergeInput } from './sqlite.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return { lastInsertRowid: Number(header?.insertId ?? 0), changes: header?.affectedRows }
}

export async function insertVideoMerge(input: NewVideoMergeInput): Promise<DbRunResult> {
  const result = await db().insert(schema.videoMerges).values(input)
  return normalizeRun(result)
}

export async function updateVideoMerge(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.videoMerges).set(patch).where(eq(schema.videoMerges.id, id))
}

export async function findVideoMergeById(id: number): Promise<VideoMergeRow | undefined> {
  const rows = await db().select().from(schema.videoMerges).where(eq(schema.videoMerges.id, id)).limit(1)
  return rows[0]
}

export async function listVideoMergesByEpisode(episodeId: number): Promise<VideoMergeRow[]> {
  return db().select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId))
}

export async function listVideoMergesByEpisodeAndPipeline(episodeId: number, motionPipeline: string): Promise<VideoMergeRow[]> {
  return db().select().from(schema.videoMerges)
    .where(and(eq(schema.videoMerges.episodeId, episodeId), eq(schema.videoMerges.motionPipeline, motionPipeline)))
}
