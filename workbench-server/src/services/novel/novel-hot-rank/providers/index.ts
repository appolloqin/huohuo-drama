import { fetchBooklistRank } from './booklist.js'
import { fetchSeedRank } from './seed.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'

export type HotRankProviderFn = (platform: HotRankPlatform) => Promise<HotRankProviderItem[]>

function envProviderFlag(platform: HotRankPlatform): boolean {
  const key = `NOVEL_HOT_PROVIDER_${platform.toUpperCase()}`
  const raw = process.env[key]
  if (raw === undefined || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

export function isProviderEnabled(platform: HotRankPlatform): boolean {
  return envProviderFlag(platform)
}

/**
 * Prefer booklist when NOVEL_HOT_BOOKLIST_BASE_URL is set; otherwise seed.
 * Returns null when platform provider is disabled via NOVEL_HOT_PROVIDER_<PLATFORM>=0.
 */
export function resolveProvider(platform: HotRankPlatform): HotRankProviderFn | null {
  if (!isProviderEnabled(platform)) return null
  const base = (process.env.NOVEL_HOT_BOOKLIST_BASE_URL || '').trim()
  if (base) return fetchBooklistRank
  return fetchSeedRank
}
