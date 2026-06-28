import { isMysqlDriver } from '../../driver.js'
import type { CharacterRow, DbRunResult, DramaRow, EpisodeRow, NewDramaInput, PropRow, SceneRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type OwnedDramaPageFilter = {
  status?: string
  keyword?: string
  projectType?: string
}

export async function listOwnedDramasPage(
  userId: number,
  filter: OwnedDramaPageFilter = {},
  page: number = 1,
  pageSize: number = 20,
): Promise<Partial<DramaRow>[]> {
  if (isMysqlDriver()) return mysql.listOwnedDramasPage(userId, filter, page, pageSize)
  return sqlite.listOwnedDramasPage(userId, filter, page, pageSize)
}

export async function countOwnedDramas(
  userId: number,
  filter: OwnedDramaPageFilter = {},
): Promise<number> {
  return isMysqlDriver()
    ? mysql.countOwnedDramas(userId, filter)
    : sqlite.countOwnedDramas(userId, filter)
}

export async function countOwnedDramasByStatus(
  userId: number,
): Promise<{ status: string; count: number }[]> {
  return isMysqlDriver()
    ? mysql.countOwnedDramasByStatus(userId)
    : sqlite.countOwnedDramasByStatus(userId)
}

export type NovelImportScope = mysql.NovelImportScope & sqlite.NovelImportScope

type NovelImportRow = DramaRow & { scope: NovelImportScope }

export async function listNovelImportSourcesPage(args: {
  viewerUserId: number
  isAdmin: boolean
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<{ items: NovelImportRow[]; total: number }> {
  return isMysqlDriver()
    ? mysql.listNovelImportSourcesPage(args)
    : sqlite.listNovelImportSourcesPage(args)
}

export async function insertDrama(input: NewDramaInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertDrama(input) : sqlite.insertDrama(input)
}

export async function findDramaById(id: number): Promise<DramaRow | null> {
  return isMysqlDriver() ? mysql.findDramaById(id) : sqlite.findDramaById(id)
}

export async function updateDrama(id: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateDrama(id, patch)
  sqlite.updateDrama(id, patch)
}

export async function softDeleteDrama(id: number, deletedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.softDeleteDrama(id, deletedAt)
  sqlite.softDeleteDrama(id, deletedAt)
}

export async function hardDeleteDrama(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.hardDeleteDrama(id)
  sqlite.hardDeleteDrama(id)
}

export async function seedEpisodeStubs(
  dramaId: number,
  unitCount: number,
  unitLabel: string,
  timestamp: string,
): Promise<void> {
  if (isMysqlDriver()) return mysql.seedEpisodeStubs(dramaId, unitCount, unitLabel, timestamp)
  sqlite.seedEpisodeStubs(dramaId, unitCount, unitLabel, timestamp)
}

export async function listEpisodesByDrama(dramaId: number): Promise<EpisodeRow[]> {
  return isMysqlDriver() ? mysql.listEpisodesByDrama(dramaId) : sqlite.listEpisodesByDrama(dramaId)
}

export async function listCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return isMysqlDriver() ? mysql.listCharactersByDrama(dramaId) : sqlite.listCharactersByDrama(dramaId)
}

export async function listScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  return isMysqlDriver() ? mysql.listScenesByDrama(dramaId) : sqlite.listScenesByDrama(dramaId)
}

export async function listActiveEpisodesByDrama(dramaId: number): Promise<EpisodeRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveEpisodesByDrama(dramaId)
    : sqlite.listActiveEpisodesByDrama(dramaId)
}

export async function listPropsByDrama(dramaId: number): Promise<PropRow[]> {
  return isMysqlDriver() ? mysql.listPropsByDrama(dramaId) : sqlite.listPropsByDrama(dramaId)
}

export async function listPublishedTemplates(): Promise<DramaRow[]> {
  return isMysqlDriver() ? mysql.listPublishedTemplates() : sqlite.listPublishedTemplates()
}

export async function findPublishedTemplate(id: number): Promise<DramaRow | null> {
  return isMysqlDriver() ? mysql.findPublishedTemplate(id) : sqlite.findPublishedTemplate(id)
}

export async function listActiveCharactersByDrama(dramaId: number): Promise<CharacterRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveCharactersByDrama(dramaId)
    : sqlite.listActiveCharactersByDrama(dramaId)
}

export async function listActiveScenesByDrama(dramaId: number): Promise<SceneRow[]> {
  return isMysqlDriver()
    ? mysql.listActiveScenesByDrama(dramaId)
    : sqlite.listActiveScenesByDrama(dramaId)
}

export async function batchListEpisodesByDramaIds(dramaIds: number[]): Promise<EpisodeRow[]> {
  return isMysqlDriver()
    ? mysql.batchListEpisodesByDramaIds(dramaIds)
    : sqlite.batchListEpisodesByDramaIds(dramaIds)
}

export async function batchListCharactersByDramaIds(dramaIds: number[]): Promise<CharacterRow[]> {
  return isMysqlDriver()
    ? mysql.batchListCharactersByDramaIds(dramaIds)
    : sqlite.batchListCharactersByDramaIds(dramaIds)
}

export async function batchListScenesByDramaIds(dramaIds: number[]): Promise<SceneRow[]> {
  return isMysqlDriver()
    ? mysql.batchListScenesByDramaIds(dramaIds)
    : sqlite.batchListScenesByDramaIds(dramaIds)
}

export type { ProjectListStats } from './mysql.js'
export async function getProjectListStatsByDramaIds(
  dramaIds: number[],
  novelDramaIds: number[] = [],
): Promise<mysql.ProjectListStats[]> {
  return isMysqlDriver()
    ? mysql.getProjectListStatsByDramaIds(dramaIds, novelDramaIds)
    : (sqlite.getProjectListStatsByDramaIds(dramaIds, novelDramaIds) as unknown as Promise<mysql.ProjectListStats[]>)
}
