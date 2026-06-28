import { and, eq, isNull } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AssetRow, DbRunResult } from '../types.js'
import type { AssetUpsertInput } from './sqlite.js'

const db = () => getMysqlDb()

export async function findAssetByImageGenId(imageGenId: number): Promise<AssetRow | null> {
  const rows = await db().select().from(schema.assets)
    .where(and(eq(schema.assets.imageGenId, imageGenId), isNull(schema.assets.deletedAt)))
  return (rows[0] as AssetRow | undefined) ?? null
}

export async function findAssetByVideoGenId(videoGenId: number): Promise<AssetRow | null> {
  const rows = await db().select().from(schema.assets)
    .where(and(eq(schema.assets.videoGenId, videoGenId), isNull(schema.assets.deletedAt)))
  return (rows[0] as AssetRow | undefined) ?? null
}

export async function insertAsset(input: typeof schema.assets.$inferInsert): Promise<DbRunResult> {
  const [result] = await db().insert(schema.assets).values(input)
  return { lastInsertRowid: Number(result.insertId ?? 0), changes: 1 }
}

export async function updateAsset(id: number, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.assets).set(patch).where(eq(schema.assets.id, id))
}

export async function upsertAssetByImageGenId(input: AssetUpsertInput): Promise<DbRunResult> {
  const existing = input.imageGenId ? await findAssetByImageGenId(input.imageGenId) : null
  if (existing) {
    await updateAsset(existing.id, {
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

export async function upsertAssetByVideoGenId(input: AssetUpsertInput): Promise<DbRunResult> {
  const existing = input.videoGenId ? await findAssetByVideoGenId(input.videoGenId) : null
  if (existing) {
    await updateAsset(existing.id, {
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
