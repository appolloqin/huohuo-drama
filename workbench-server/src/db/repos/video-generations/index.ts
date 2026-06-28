import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, VideoGenerationRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'
import type { VideoGenerationListFilter } from './sqlite.js'
import type { IndustrySlug } from '../../../common/industry/industry-catalog.js'

export type { VideoGenerationListFilter } from './sqlite.js'

export async function findVideoGenerationById(id: number): Promise<VideoGenerationRow | null> {
  return isMysqlDriver()
    ? mysql.findVideoGenerationById(id)
    : sqlite.findVideoGenerationById(id)
}

export async function findVideoGenerationByTaskId(taskId: string): Promise<VideoGenerationRow | null> {
  return isMysqlDriver()
    ? mysql.findVideoGenerationByTaskId(taskId)
    : sqlite.findVideoGenerationByTaskId(taskId)
}

export async function listVideoGenerations(
  filters: VideoGenerationListFilter = {},
): Promise<VideoGenerationRow[]> {
  return isMysqlDriver()
    ? mysql.listVideoGenerations(filters)
    : sqlite.listVideoGenerations(filters)
}

export async function countVideoGenerations(
  filters: VideoGenerationListFilter = {},
): Promise<number> {
  return isMysqlDriver()
    ? mysql.countVideoGenerations(filters)
    : sqlite.countVideoGenerations(filters)
}

export async function listCompletedVideoGenerations(limit?: number): Promise<VideoGenerationRow[]> {
  return isMysqlDriver()
    ? mysql.listCompletedVideoGenerations(limit)
    : sqlite.listCompletedVideoGenerations(limit)
}

export async function listCompletedVideoGenerationsByIndustry(
  industry: IndustrySlug | string,
  limit?: number,
): Promise<VideoGenerationRow[]> {
  return isMysqlDriver()
    ? mysql.listCompletedVideoGenerationsByIndustry(industry, limit)
    : sqlite.listCompletedVideoGenerationsByIndustry(industry, limit)
}

export async function updateVideoGeneration(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateVideoGeneration(id, patch)
  sqlite.updateVideoGeneration(id, patch)
}

export async function insertVideoGeneration(input: Record<string, unknown>): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.insertVideoGeneration(input as never)
    : sqlite.insertVideoGeneration(input as never)
}

export async function deleteVideoGeneration(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteVideoGeneration(id)
  sqlite.deleteVideoGeneration(id)
}
