/**
 * 番茄：榜单页取 bookId（列表字体反爬），详情页 JSON 解明文书名/简介。
 * 只请求公开页元数据，不取章节正文。
 */

import { applyHeuristicMapping } from '../mapper.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'
import {
  fetchText,
  HOT_RANK_UA,
  sleep,
  truncateBlurb,
  unescapeJsonString,
} from './http.js'

/** 男频阅读榜若干题材，覆盖常见赛道 */
const FANQIE_RANK_PATHS = [
  '1_2_258', // 传统玄幻
  '1_2_1140', // 东方仙侠
  '1_2_124', // 都市修真
  '1_2_8', // 科幻末世
  '1_2_261', // 都市日常
]

function extractIds(html: string): string[] {
  return [...new Set([...html.matchAll(/\/page\/(\d{10,})/g)].map((m) => m[1]))]
}

function field(html: string, key: string): string | undefined {
  const m = html.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`))
  return m?.[1] ? unescapeJsonString(m[1]) : undefined
}

/** 从 categoryV2（数组 / 转义 JSON 字符串）只提取 Name，绝不把整段 JSON 当标签 */
function extractCategoryNames(html: string): string[] {
  const names: string[] = []
  // "categoryV2":[{...},{"Name":"东方仙侠",...}]
  const arrMatch = html.match(/"categoryV2"\s*:\s*(\[[\s\S]*?\])\s*[,}]/)
  if (arrMatch?.[1]) {
    try {
      const arr = JSON.parse(arrMatch[1]) as Array<{ Name?: string; name?: string }>
      if (Array.isArray(arr)) {
        for (const row of arr) {
          const n = String(row?.Name || row?.name || '').trim()
          if (n && n.length <= 24) names.push(n)
        }
      }
    } catch {
      // fall through to Name regex
    }
  }
  if (!names.length) {
    // "categoryV2":"[{\"Name\":\"东方仙侠\"...}]" 转义串
    const strVal = field(html, 'categoryV2')
    if (strVal) {
      try {
        const parsed = JSON.parse(strVal) as unknown
        if (Array.isArray(parsed)) {
          for (const row of parsed as Array<{ Name?: string; name?: string }>) {
            const n = String(row?.Name || row?.name || '').trim()
            if (n && n.length <= 24) names.push(n)
          }
        }
      } catch {
        // ignore blob
      }
    }
  }
  if (!names.length) {
    for (const m of html.matchAll(/"categoryV2"[\s\S]{0,800}?"Name"\s*:\s*"([^"]{1,24})"/g)) {
      const n = m[1].trim()
      if (n) names.push(n)
    }
  }
  return [...new Set(names)]
}

function isCleanTag(tag: string): boolean {
  const t = tag.trim()
  if (!t || t.length > 24) return false
  if (/^[\[{]/.test(t) || t.includes('ObjectId') || t.includes('ExternalDesc')) return false
  if (t.includes('http://') || t.includes('https://') || t.includes('byteimg')) return false
  return true
}

async function fetchDetail(id: string): Promise<{
  title: string
  blurbShort: string
  tags: string[]
} | null> {
  const { text } = await fetchText(`https://fanqienovel.com/page/${id}`, {
    headers: {
      'User-Agent': HOT_RANK_UA,
      Accept: 'text/html',
      Referer: 'https://fanqienovel.com/rank',
    },
  })
  const title = field(text, 'bookName')?.trim()
  if (!title) return null
  const abstract = field(text, 'abstract') || ''
  const categories = extractCategoryNames(text)
  const tagFromAbs = [...abstract.matchAll(/【([^】]+)】/g)].flatMap((m) =>
    m[1].split(/[+、,，/]/).map((t) => t.trim()),
  )
  const tags = [...categories, ...tagFromAbs].filter(isCleanTag)
  return { title, blurbShort: truncateBlurb(abstract), tags }
}

export async function fetchFanqieRank(_platform: HotRankPlatform): Promise<HotRankProviderItem[]> {
  const idSet = new Set<string>()
  for (const path of FANQIE_RANK_PATHS) {
    try {
      const { text } = await fetchText(`https://fanqienovel.com/rank/${path}`, {
        headers: { 'User-Agent': HOT_RANK_UA, Accept: 'text/html' },
      })
      for (const id of extractIds(text)) idSet.add(id)
      await sleep(300)
    } catch {
      // 单题材失败继续
    }
  }
  const ids = [...idSet].slice(0, 24)
  if (!ids.length) throw new Error('fanqie: no book ids from rank pages')

  const items: HotRankProviderItem[] = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      const detail = await fetchDetail(id)
      if (!detail) continue
      items.push(
        applyHeuristicMapping({
          platform: 'fanqie',
          externalId: id,
          title: detail.title,
          tags: detail.tags,
          heat: 2000 - i,
          blurbShort: detail.blurbShort,
          mapped: { genreSecondary: [] },
          mapSource: null,
        }),
      )
    } catch {
      // skip one book
    }
    await sleep(250)
  }
  if (!items.length) throw new Error('fanqie: failed to decode any book detail')
  return items
}
