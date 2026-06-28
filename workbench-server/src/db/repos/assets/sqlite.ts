import { and, eq, isNull } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { AssetRow, DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export type AssetUpsertInput = {
  dramaId?: number | null
  episodeId?: number | null
  storyboardId?: number | null
  storyboardNum?: number | null
  name?: string | null
  description?: string | null
  type: string
  category?: string | null
  url?: string | null
  localPath?: string | null
  imageGenId?: number | null
  videoGenId?: number | null
  width?: number | null
  height?: number | null
  duration?: number | null
  createdAt: string
  updatedAt: string
}

export function findAssetByImageGenId(imageGenId: number): AssetRow | null {
  const [row] = db().select().from(schema.assets)
    .where(and(eq(schema.assets.imageGenId, imageGenId), isNull(schema.assets.deletedAt)))
    .all()
  return row ?? null
}

export function findAssetByVideoGenId(videoGenId: number): AssetRow | null {
  const [row] = db().select().from(schema.assets)
    .where(and(eq(schema.assets.videoGenId, videoGenId), isNull(schema.assets.deletedAt)))
    .all()
  return row ?? null
}

export function insertAsset(input: typeof schema.assets.$inferInsert): DbRunResult {
  const res = db().insert(schema.assets).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateAsset(id: number, patch: Record<string, unknown>): void {
  db().update(schema.assets).set(patch).where(eq(schema.assets.id, id)).run()
}

export function upsertAssetByImageGenId(input: AssetUpsertInput): DbRunResult {
  const existing = input.imageGenId ? findAssetByImageGenId(input.imageGenId) : null
  if (existing) {
    updateAsset(existing.id, {
      dramaId: input.dramaId,
      episodeId: input.episodeId,
      storyboardId: input.storyboardId,
      storyboardNum: input.storyboardNum,
      name: input.name,
      description: input.description,
      type: input.type,
      category: input.category,
      url: input.url,
      localPath: input.localPath,
      width: input.width,
      height: input.height,
      updatedAt: input.updatedAt,
    })
    return { lastInsertRowid: existing.id, changes: 1 }
  }
  return insertAsset({
    dramaId: input.dramaId ?? null,
    episodeId: input.episodeId ?? null,
    storyboardId: input.storyboardId ?? null,
    storyboardNum: input.storyboardNum ?? null,
    name: input.name ?? null,
    description: input.description ?? null,
    type: input.type,
    category: input.category ?? null,
    url: input.url ?? null,
    localPath: input.localPath ?? null,
    imageGenId: input.imageGenId ?? null,
    videoGenId: null,
    width: input.width ?? null,
    height: input.height ?? null,
    duration: input.duration ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
}

export function upsertAssetByVideoGenId(input: AssetUpsertInput): DbRunResult {
  const existing = input.videoGenId ? findAssetByVideoGenId(input.videoGenId) : null
  if (existing) {
    updateAsset(existing.id, {
      dramaId: input.dramaId,
      episodeId: input.episodeId,
      storyboardId: input.storyboardId,
      storyboardNum: input.storyboardNum,
      name: input.name,
      description: input.description,
      type: input.type,
      category: input.category,
      url: input.url,
      localPath: input.localPath,
      width: input.width,
      height: input.height,
      duration: input.duration,
      updatedAt: input.updatedAt,
    })
    return { lastInsertRowid: existing.id, changes: 1 }
  }
  return insertAsset({
    dramaId: input.dramaId ?? null,
    episodeId: input.episodeId ?? null,
    storyboardId: input.storyboardId ?? null,
    storyboardNum: input.storyboardNum ?? null,
    name: input.name ?? null,
    description: input.description ?? null,
    type: input.type,
    category: input.category ?? null,
    url: input.url ?? null,
    localPath: input.localPath ?? null,
    imageGenId: null,
    videoGenId: input.videoGenId ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    duration: input.duration ?? null,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
}
