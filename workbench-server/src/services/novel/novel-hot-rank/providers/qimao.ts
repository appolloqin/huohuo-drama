/**
 * 七猫：书库点击榜解析书名、分类、简介（列表页已有，无需详情）。
 */

import { applyHeuristicMapping } from '../mapper.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'
import { fetchText, HOT_RANK_UA, truncateBlurb } from './http.js'

const RANK_URL = 'https://www.qimao.com/shuku/a-a-a-a-a-a-a-click-1/'

function isCleanTag(tag: string): boolean {
  const t = tag.trim()
  if (!t || t.length > 24) return false
  if (/^[\[{]/.test(t) || /连载|完结|万字|更新/.test(t)) return false
  return true
}

export async function fetchQimaoRank(_platform: HotRankPlatform): Promise<HotRankProviderItem[]> {
  const { text: html } = await fetchText(RANK_URL, {
    headers: {
      'User-Agent': HOT_RANK_UA,
      Accept: 'text/html',
      Referer: 'https://www.qimao.com/',
    },
  })

  // 列表块：标题链 + tags-gather（分类）+ s-desc
  const re =
    /href="https?:\/\/www\.qimao\.com\/shuku\/(\d+)\/?"[^>]*>([^<]{1,80})<\/a><\/span>\s*<span class="tags-gather"([\s\S]*?)<span class="s-desc"[^>]*>\s*([\s\S]*?)\s*<\/span>/g

  const seen = new Set<string>()
  const items: HotRankProviderItem[] = []
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html)) !== null) {
    const externalId = m[1]
    const title = m[2].replace(/\s+/g, ' ').trim()
    const gather = m[3] || ''
    const category = gather.match(/class="s-category"[^>]*>([^<]{1,24})<\/a>/)?.[1]?.trim() || ''
    const blurb = (m[4] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!externalId || !title || seen.has(externalId)) continue
    seen.add(externalId)
    const tags = [category].filter(isCleanTag)
    items.push(
      applyHeuristicMapping({
        platform: 'qimao',
        externalId,
        title,
        tags,
        heat: 1400 - i,
        blurbShort: truncateBlurb(blurb),
        mapped: { genreSecondary: [] },
        mapSource: null,
      }),
    )
    i += 1
    if (items.length >= 40) break
  }

  // 退化：封面 alt 仅书名（旧结构）
  if (!items.length) {
    const altRe =
      /href="https?:\/\/www\.qimao\.com\/shuku\/(\d+)\/?"[^>]*>\s*<img[^>]*alt="([^"]{1,80})"/g
    while ((m = altRe.exec(html)) !== null) {
      const externalId = m[1]
      const title = m[2].replace(/\s+/g, ' ').trim()
      if (!externalId || !title || seen.has(externalId)) continue
      seen.add(externalId)
      items.push(
        applyHeuristicMapping({
          platform: 'qimao',
          externalId,
          title,
          tags: [],
          heat: 1400 - items.length,
          blurbShort: '',
          mapped: { genreSecondary: [] },
          mapSource: null,
        }),
      )
      if (items.length >= 40) break
    }
  }

  if (!items.length) throw new Error('qimao: empty rank parse')
  return items
}
