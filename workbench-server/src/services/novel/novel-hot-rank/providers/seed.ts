import { getSeedItems } from '../seed-data.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'

export async function fetchSeedRank(platform: HotRankPlatform): Promise<HotRankProviderItem[]> {
  return getSeedItems(platform)
}
