import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, StoryboardRow } from '../types.js'
import { applyStoryboardTextPatch, hydrateStoryboardRow } from '../../../common/storage/text-blob-repo.js'
import type { NewStoryboardInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { NewStoryboardInput, StoryboardCastBinding } from './sqlite.js'

export async function insertStoryboard(input: NewStoryboardInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertStoryboard(input) : sqlite.insertStoryboard(input)
}

export async function findStoryboardById(id: number): Promise<StoryboardRow | null> {
  const row = isMysqlDriver() ? await mysql.findStoryboardById(id) : sqlite.findStoryboardById(id)
  return row ? hydrateStoryboardRow(row) : null
}

export async function updateStoryboard(id: number, patch: Record<string, unknown>): Promise<void> {
  const next = applyStoryboardTextPatch(id, patch)
  if (isMysqlDriver()) return mysql.updateStoryboard(id, next)
  sqlite.updateStoryboard(id, next)
}

export async function deleteStoryboard(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteStoryboard(id)
  sqlite.deleteStoryboard(id)
}

export async function listStoryboardCharacterIds(storyboardId: number): Promise<number[]> {
  return isMysqlDriver()
    ? mysql.listStoryboardCharacterIds(storyboardId)
    : sqlite.listStoryboardCharacterIds(storyboardId)
}

export async function listStoryboardCastBindings(storyboardId: number) {
  return isMysqlDriver()
    ? mysql.listStoryboardCastBindings(storyboardId)
    : sqlite.listStoryboardCastBindings(storyboardId)
}

export async function replaceStoryboardCastBindings(
  storyboardId: number,
  bindings: import('./sqlite.js').StoryboardCastBinding[],
): Promise<void> {
  if (isMysqlDriver()) return mysql.replaceStoryboardCastBindings(storyboardId, bindings)
  sqlite.replaceStoryboardCastBindings(storyboardId, bindings)
}

export async function listStoryboardPropIds(storyboardId: number): Promise<number[]> {
  return isMysqlDriver()
    ? mysql.listStoryboardPropIds(storyboardId)
    : sqlite.listStoryboardPropIds(storyboardId)
}

export async function replaceStoryboardProps(storyboardId: number, propIds: number[]): Promise<void> {
  if (isMysqlDriver()) return mysql.replaceStoryboardProps(storyboardId, propIds)
  sqlite.replaceStoryboardProps(storyboardId, propIds)
}

export async function listStoryboardPropLinksForIds(storyboardIds: number[]) {
  return isMysqlDriver()
    ? mysql.listStoryboardPropLinksForIds(storyboardIds)
    : sqlite.listStoryboardPropLinksForIds(storyboardIds)
}

export async function replaceStoryboardCharacters(storyboardId: number, characterIds: number[]): Promise<void> {
  if (isMysqlDriver()) return mysql.replaceStoryboardCharacters(storyboardId, characterIds)
  sqlite.replaceStoryboardCharacters(storyboardId, characterIds)
}

export async function deleteStoryboardCharactersByStoryboard(storyboardId: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteStoryboardCharactersByStoryboard(storyboardId)
  sqlite.deleteStoryboardCharactersByStoryboard(storyboardId)
}

export async function listStoryboardIdsByEpisode(episodeId: number): Promise<number[]> {
  return isMysqlDriver()
    ? mysql.listStoryboardIdsByEpisode(episodeId)
    : sqlite.listStoryboardIdsByEpisode(episodeId)
}

export async function listActiveStoryboardsByEpisode(episodeId: number): Promise<StoryboardRow[]> {
  const rows = isMysqlDriver()
    ? await mysql.listActiveStoryboardsByEpisode(episodeId)
    : sqlite.listActiveStoryboardsByEpisode(episodeId)
  return rows.map(hydrateStoryboardRow)
}

export async function deleteAllStoryboardsForEpisode(episodeId: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteAllStoryboardsForEpisode(episodeId)
  sqlite.deleteAllStoryboardsForEpisode(episodeId)
}

export async function listStoryboardsByIds(ids: number[]): Promise<StoryboardRow[]> {
  const rows = isMysqlDriver() ? await mysql.listStoryboardsByIds(ids) : sqlite.listStoryboardsByIds(ids)
  return rows.map(hydrateStoryboardRow)
}

export async function listStoryboardCharacterLinksForIds(storyboardIds: number[]) {
  return isMysqlDriver()
    ? mysql.listStoryboardCharacterLinksForIds(storyboardIds)
    : sqlite.listStoryboardCharacterLinksForIds(storyboardIds)
}

export async function updateStoryboardsByEpisode(episodeId: number, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updateStoryboardsByEpisode(episodeId, patch)
  sqlite.updateStoryboardsByEpisode(episodeId, patch)
}

export async function listStoryboardsByEpisodeIdsOrdered(episodeIds: number[], limit = 16): Promise<StoryboardRow[]> {
  const rows = isMysqlDriver()
    ? await mysql.listStoryboardsByEpisodeIdsOrdered(episodeIds, limit)
    : sqlite.listStoryboardsByEpisodeIdsOrdered(episodeIds, limit)
  return rows.map(hydrateStoryboardRow)
}
