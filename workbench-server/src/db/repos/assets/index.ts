import { isMysqlDriver } from '../../driver.js'
import type { AssetRow, DbRunResult } from '../types.js'
import type { AssetUpsertInput } from './sqlite.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export type { AssetUpsertInput } from './sqlite.js'

export async function findAssetByImageGenId(imageGenId: number): Promise<AssetRow | null> {
  return isMysqlDriver()
    ? mysql.findAssetByImageGenId(imageGenId)
    : sqlite.findAssetByImageGenId(imageGenId)
}

export async function findAssetByVideoGenId(videoGenId: number): Promise<AssetRow | null> {
  return isMysqlDriver()
    ? mysql.findAssetByVideoGenId(videoGenId)
    : sqlite.findAssetByVideoGenId(videoGenId)
}

export async function upsertAssetByImageGenId(input: AssetUpsertInput): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.upsertAssetByImageGenId(input)
    : sqlite.upsertAssetByImageGenId(input)
}

export async function upsertAssetByVideoGenId(input: AssetUpsertInput): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.upsertAssetByVideoGenId(input)
    : sqlite.upsertAssetByVideoGenId(input)
}
