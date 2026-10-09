/** 起点：移动端 majax 公开 JSON（需 cookie 中的 _csrfToken） */

import { applyHeuristicMapping } from '../mapper.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'
import {
  fetchJson,
  fetchText,
  HOT_RANK_MOBILE_UA,
  parseHeatNumber,
  truncateBlurb,
} from './http.js'

type QidianRecord = {
  bid?: string
  bName?: string
  bAuth?: string
  desc?: string
  cat?: string
  subCat?: string
  rankCnt?: string
  rankNum?: number
}

type QidianPayload = {
  code?: number
  data?: { records?: QidianRecord[] }
}

function yearMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

function extractCsrf(setCookie: string | null, html: string): string {
  const fromHeader = setCookie?.match(/_csrfToken=([^;]+)/)?.[1]
  if (fromHeader) return decodeURIComponent(fromHeader)
  const fromHtml = html.match(/_csrfToken["'\s:=]+([A-Za-z0-9_-]+)/)?.[1]
  if (fromHtml) return fromHtml
  throw new Error('qidian: missing _csrfToken')
}

export async function fetchQidianRank(_platform: HotRankPlatform): Promise<HotRankProviderItem[]> {
  const boot = await fetchText('https://m.qidian.com/rank/yuepiao/', {
    headers: {
      'User-Agent': HOT_RANK_MOBILE_UA,
      Accept: 'text/html',
    },
  })
  const setCookie = boot.headers.get('set-cookie')
  const csrf = extractCsrf(setCookie, boot.text)
  const ym = yearMonth()
  const api =
    `https://m.qidian.com/majax/rank/yuepiaolist` +
    `?_csrfToken=${encodeURIComponent(csrf)}` +
    `&gender=male&pageNum=1&catId=-1&yearmonth=${ym}`

  const payload = await fetchJson<QidianPayload>(api, {
    headers: {
      'User-Agent': HOT_RANK_MOBILE_UA,
      Referer: 'https://m.qidian.com/rank/yuepiao/',
      Cookie: `_csrfToken=${csrf}`,
      Accept: 'application/json',
    },
  })

  if (payload.code !== 0 || !Array.isArray(payload.data?.records)) {
    throw new Error(`qidian: unexpected payload code=${payload.code}`)
  }

  const items: HotRankProviderItem[] = []
  for (let i = 0; i < payload.data!.records!.length; i++) {
    const row = payload.data!.records![i]
    const externalId = String(row.bid || '').trim()
    const title = String(row.bName || '').trim()
    if (!externalId || !title) continue
    const tags = [row.cat, row.subCat].filter(Boolean).map((t) => String(t).trim())
    const heat = parseHeatNumber(row.rankCnt, 1000 - i)
    items.push(
      applyHeuristicMapping({
        platform: 'qidian',
        externalId,
        title,
        tags,
        heat,
        blurbShort: truncateBlurb(String(row.desc || '')),
        mapped: { genreSecondary: [] },
        mapSource: null,
      }),
    )
  }
  if (!items.length) throw new Error('qidian: empty rank list')
  return items.slice(0, 40)
}
