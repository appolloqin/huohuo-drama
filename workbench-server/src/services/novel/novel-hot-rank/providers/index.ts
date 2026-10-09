import { fetchBooklistRank } from './booklist.js'
import { fetchFanqieRank } from './fanqie.js'
import { fetchJinjiangRank } from './jinjiang.js'
import { fetchQidianRank } from './qidian.js'
import { fetchQimaoRank } from './qimao.js'
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

const LIVE_PROVIDERS: Record<HotRankPlatform, HotRankProviderFn> = {
  fanqie: fetchFanqieRank,
  qidian: fetchQidianRank,
  jinjiang: fetchJinjiangRank,
  qimao: fetchQimaoRank,
}

/**
 * 优先级：
 * 1) NOVEL_HOT_BOOKLIST_BASE_URL 外部 API（若配置）
 * 2) 各平台真实公开接口 / 页面元数据抓取
 * 不再默认使用内置种子。
 */
export function resolveProvider(platform: HotRankPlatform): HotRankProviderFn | null {
  if (!isProviderEnabled(platform)) return null
  const base = (process.env.NOVEL_HOT_BOOKLIST_BASE_URL || '').trim()
  if (base) return fetchBooklistRank
  return LIVE_PROVIDERS[platform] || null
}
