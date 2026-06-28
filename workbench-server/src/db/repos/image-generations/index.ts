import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, ImageGenerationRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'
import type { ImageGenerationListFilter } from './sqlite.js'
import type { IndustrySlug } from '../../../common/industry/industry-catalog.js'

export type { ImageGenerationListFilter } from './sqlite.js'

export async function insertImageGeneration(input: Record<string, unknown>): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.insertImageGeneration(input as never)
    : sqlite.insertImageGeneration(input as never)
}

export async function findImageGenerationById(id: number): Promise<ImageGenerationRow | null> {
  return isMysqlDriver()
    ? mysql.findImageGenerationById(id)
    : sqlite.findImageGenerationById(id)
}

export async function listImageGenerations(
  filters: ImageGenerationListFilter = {},
): Promise<ImageGenerationRow[]> {
  return isMysqlDriver()
    ? mysql.listImageGenerations(filters)
    : sqlite.listImageGenerations(filters)
}

export async function countImageGenerations(
  filters: ImageGenerationListFilter = {},
): Promise<number> {
  return isMysqlDriver()
    ? mysql.countImageGenerations(filters)
    : sqlite.countImageGenerations(filters)
}

export async function listCompletedImageGenerations(limit?: number): Promise<ImageGenerationRow[]> {
  return isMysqlDriver()
    ? mysql.listCompletedImageGenerations(limit)
    : sqlite.listCompletedImageGenerations(limit)
}

export async function listCompletedImageGenerationsByIndustry(
  industry: IndustrySlug | string,
  limit?: number,
): Promise<ImageGenerationRow[]> {
  return isMysqlDriver()
    ? mysql.listCompletedImageGenerationsByIndustry(industry, limit)
    : sqlite.listCompletedImageGenerationsByIndustry(industry, limit)
}

export async function updateImageGeneration(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateImageGeneration(id, patch)
  sqlite.updateImageGeneration(id, patch)
}

export async function deleteImageGeneration(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteImageGeneration(id)
  sqlite.deleteImageGeneration(id)
}
