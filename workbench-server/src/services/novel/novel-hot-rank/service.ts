import { randomUUID } from 'node:crypto'
import { now } from '../../../common/http/response.js'
import type { NovelHotRankItemInsert } from '../../../db/repos/novel-hot-rank/index.js'
import * as hotRankRepo from '../../../db/repos/novel-hot-rank/index.js'
import type { NovelHotRankItemRow } from '../../../db/repos/types.js'
import { applyHeuristicMapping } from './mapper.js'
import { resolveProvider, isProviderEnabled } from './providers/index.js'
import {
  HOT_RANK_PLATFORMS,
  type HotRankItem,
  type HotRankPlatform,
  type HotRankProviderItem,
  isHotRankPlatform,
} from './types.js'

export const HOT_RANK_STALE_MS = 12 * 60 * 60 * 1000

function isDisplayableTag(tag: string): boolean {
  const t = (tag || '').trim()
  if (!t || t.length > 24) return false
  // 拦截番茄 categoryV2 等误入库的 JSON 碎片
  if (/^[\[{]/.test(t) || /ObjectId|ExternalDesc|MainCategory|byteimg|https?:\/\//i.test(t)) {
    return false
  }
  return true
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.map((x) => String(x)).filter(isDisplayableTag)
  } catch {
    return []
  }
}

function truncateBlurb(text: string, max = 200): string {
  const t = (text || '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export function toHotRankItem(row: NovelHotRankItemRow): HotRankItem {
  const platform = isHotRankPlatform(row.platform) ? row.platform : 'fanqie'
  return {
    platform,
    externalId: row.externalId,
    title: row.title,
    tags: parseJsonStringArray(row.tagsJson),
    heat: row.heat ?? 0,
    blurbShort: truncateBlurb(row.blurbShort || ''),
    mapped: {
      genrePrimary: row.mappedGenrePrimary || undefined,
      genreSecondary: parseJsonStringArray(row.mappedGenreSecondaryJson),
      worldviewId: row.mappedWorldviewId || undefined,
      cultivationId: row.mappedCultivationId || undefined,
      goldenFingerId: row.mappedGoldenFingerId || undefined,
    },
    fetchedAt: row.fetchedAt,
  }
}

function providerItemToRow(item: HotRankProviderItem, fetchedAt: string): NovelHotRankItemInsert {
  const mapped = applyHeuristicMapping(item)
  return {
    id: randomUUID(),
    platform: mapped.platform,
    externalId: mapped.externalId,
    title: mapped.title,
    tagsJson: JSON.stringify((mapped.tags || []).filter(isDisplayableTag)),
    heat: mapped.heat,
    blurbShort: truncateBlurb(mapped.blurbShort || ''),
    mappedGenrePrimary: mapped.mapped.genrePrimary ?? null,
    mappedGenreSecondaryJson: JSON.stringify(mapped.mapped.genreSecondary || []),
    mappedWorldviewId: mapped.mapped.worldviewId ?? null,
    mappedCultivationId: mapped.mapped.cultivationId ?? null,
    mappedGoldenFingerId: mapped.mapped.goldenFingerId ?? null,
    mapSource: mapped.mapSource ?? null,
    fetchedAt,
  }
}

function isStale(fetchedAt: string | undefined): boolean {
  if (!fetchedAt) return true
  const t = Date.parse(fetchedAt)
  if (!Number.isFinite(t)) return true
  return Date.now() - t > HOT_RANK_STALE_MS
}

export type ListHotRankResult = {
  items: HotRankItem[]
  stale: boolean
  error?: string
}

async function persistProviderItems(platform: HotRankPlatform, items: HotRankProviderItem[]): Promise<number> {
  const fetchedAt = now()
  const rows = items.map((item) => providerItemToRow(item, fetchedAt))
  await hotRankRepo.replacePlatform(platform, rows)
  return rows.length
}

/** 缓存为空或过期时拉取真实 Provider */
async function ensureLiveForPlatform(platform: HotRankPlatform): Promise<{ error?: string }> {
  const provider = resolveProvider(platform)
  if (!provider) return { error: `平台 ${platform} Provider 已关闭` }
  try {
    const items = await provider(platform)
    await persistProviderItems(platform, items)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message || '热榜拉取失败' }
  }
}

export async function listHotRank(platform: HotRankPlatform): Promise<ListHotRankResult> {
  try {
    let rows = await hotRankRepo.listByPlatform(platform)
    let fetchError: string | undefined
    // 仅空缓存时自动拉取（避免每次打开页都打详情）；过期由前端 stale + 刷新按钮触发
    if (!rows.length) {
      const ensured = await ensureLiveForPlatform(platform)
      fetchError = ensured.error
      rows = await hotRankRepo.listByPlatform(platform)
    }
    if (!rows.length) {
      return {
        items: [],
        stale: true,
        error: fetchError || `平台 ${platform} 暂无热榜数据`,
      }
    }
    const fetchedAt = rows[0]?.fetchedAt
    return {
      items: rows.map(toHotRankItem),
      stale: isStale(fetchedAt),
      error: fetchError,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { items: [], stale: true, error: message || '热榜读取失败' }
  }
}

export type RefreshHotRankResult = {
  platforms: Array<{ platform: HotRankPlatform; count: number; skipped?: boolean; error?: string }>
  total: number
}

export async function refreshHotRank(platform?: HotRankPlatform): Promise<RefreshHotRankResult> {
  const targets: HotRankPlatform[] = platform ? [platform] : [...HOT_RANK_PLATFORMS]
  const platforms: RefreshHotRankResult['platforms'] = []
  let total = 0

  for (const p of targets) {
    if (!isProviderEnabled(p)) {
      platforms.push({ platform: p, count: 0, skipped: true })
      continue
    }
    const provider = resolveProvider(p)
    if (!provider) {
      platforms.push({ platform: p, count: 0, skipped: true })
      continue
    }
    try {
      const items = await provider(p)
      const count = await persistProviderItems(p, items)
      platforms.push({ platform: p, count })
      total += count
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      platforms.push({ platform: p, count: 0, error: message })
    }
  }

  return { platforms, total }
}
