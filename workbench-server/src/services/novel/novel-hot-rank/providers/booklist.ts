import { applyHeuristicMapping } from '../mapper.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'

/** Map our platform codes to booklist site path segments. */
const PLATFORM_TO_SITE: Record<HotRankPlatform, string> = {
  fanqie: 'fanqie',
  qidian: 'qidian',
  jinjiang: 'jinjiang',
  qimao: 'qimao',
}

type BooklistRawItem = {
  id?: string | number
  externalId?: string
  external_id?: string
  title?: string
  name?: string
  tags?: string[] | string
  heat?: number
  score?: number
  blurb?: string
  blurbShort?: string
  blurb_short?: string
  desc?: string
  description?: string
}

function parseTags(raw: BooklistRawItem['tags']): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(/[,，|/]/)
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return []
}

function truncateBlurb(text: string, max = 200): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function normalizeItem(platform: HotRankPlatform, raw: BooklistRawItem, index: number): HotRankProviderItem | null {
  const externalId = String(raw.externalId ?? raw.external_id ?? raw.id ?? '').trim()
  const title = String(raw.title ?? raw.name ?? '').trim()
  if (!externalId || !title) return null
  const tags = parseTags(raw.tags)
  const heat = Number(raw.heat ?? raw.score ?? 1000 - index)
  const blurbShort = truncateBlurb(
    String(raw.blurbShort ?? raw.blurb_short ?? raw.blurb ?? raw.desc ?? raw.description ?? ''),
  )
  return applyHeuristicMapping({
    platform,
    externalId,
    title,
    tags,
    heat: Number.isFinite(heat) ? heat : 1000 - index,
    blurbShort,
    mapped: { genreSecondary: [] },
    mapSource: null,
  })
}

/**
 * Fetch rankings from optional booklist HTTP API.
 * GET `${NOVEL_HOT_BOOKLIST_BASE_URL}/api/rankings/${site}`
 * Throws on network / non-OK / invalid payload (caller may fall back).
 */
export async function fetchBooklistRank(platform: HotRankPlatform): Promise<HotRankProviderItem[]> {
  const base = (process.env.NOVEL_HOT_BOOKLIST_BASE_URL || '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('NOVEL_HOT_BOOKLIST_BASE_URL is not set')

  const site = PLATFORM_TO_SITE[platform]
  const url = `${base}/api/rankings/${site}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    throw new Error(`booklist ranking HTTP ${res.status} for ${platform}`)
  }
  const body = (await res.json()) as unknown
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown })?.items)
      ? (body as { items: unknown[] }).items
      : Array.isArray((body as { data?: unknown })?.data)
        ? (body as { data: unknown[] }).data
        : null
  if (!list) throw new Error(`booklist ranking invalid payload for ${platform}`)

  const items: HotRankProviderItem[] = []
  for (let i = 0; i < list.length; i++) {
    const row = list[i]
    if (!row || typeof row !== 'object') continue
    const item = normalizeItem(platform, row as BooklistRawItem, i)
    if (item) items.push(item)
  }
  if (!items.length) throw new Error(`booklist ranking empty for ${platform}`)
  return items
}
