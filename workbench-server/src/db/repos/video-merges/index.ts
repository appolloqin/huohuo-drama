import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, VideoMergeRow } from '../types.js'
import type { NewVideoMergeInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewVideoMergeInput } from './sqlite.js'

export async function insertVideoMerge(input: NewVideoMergeInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertVideoMerge(input) : sqlite.insertVideoMerge(input)
}

export async function updateVideoMerge(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateVideoMerge(id, patch)
  sqlite.updateVideoMerge(id, patch)
}

export async function findVideoMergeById(id: number): Promise<VideoMergeRow | undefined> {
  return isMysqlDriver()
    ? mysql.findVideoMergeById(id)
    : sqlite.findVideoMergeById(id)
}

export async function listVideoMergesByEpisode(episodeId: number): Promise<VideoMergeRow[]> {
  return isMysqlDriver()
    ? mysql.listVideoMergesByEpisode(episodeId)
    : sqlite.listVideoMergesByEpisode(episodeId)
}

export async function listVideoMergesByEpisodeAndPipeline(
  episodeId: number,
  motionPipeline: string,
): Promise<VideoMergeRow[]> {
  return isMysqlDriver()
    ? mysql.listVideoMergesByEpisodeAndPipeline(episodeId, motionPipeline)
    : sqlite.listVideoMergesByEpisodeAndPipeline(episodeId, motionPipeline)
}
