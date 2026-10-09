/**
 * 晋江：公开榜页 HTML（GBK）解析书名、频道标签、文案简介。
 */

import { applyHeuristicMapping } from '../mapper.js'
import type { HotRankPlatform, HotRankProviderItem } from '../types.js'
import { HOT_RANK_UA, truncateBlurb } from './http.js'

async function fetchGbkHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': HOT_RANK_UA,
      Accept: 'text/html',
      Referer: 'https://www.jjwxc.net/',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`jinjiang HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    return new TextDecoder('gb18030').decode(buf)
  } catch {
    return new TextDecoder('gbk').decode(buf)
  }
}

function isCleanTag(tag: string): boolean {
  const t = tag.trim()
  if (!t || t.length > 24) return false
  if (/^(原创|衍生)$/.test(t)) return false
  return true
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchJinjiangRank(_platform: HotRankPlatform): Promise<HotRankProviderItem[]> {
  // orderstr=2 常见为点击/热门类榜
  const html = await fetchGbkHtml('https://www.jjwxc.net/topten.php?orderstr=2')

  // 标题行 + 频道单元格 + 下一行文案
  const re =
    /onebook\.php\?novelid=(\d+)[^>]*>([^<]{1,80})<\/a>[\s\S]{0,500}?>([^<]*?(?:原创|衍生)-[^<]{2,60})</g

  const seen = new Set<string>()
  const items: HotRankProviderItem[] = []
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html)) !== null) {
    const externalId = m[1]
    const title = m[2].replace(/\s+/g, ' ').trim()
    const channel = (m[3] || '').replace(/\s+/g, '').trim()
    if (!externalId || !title || seen.has(externalId)) continue
    seen.add(externalId)

    const tags = channel
      .split(/[-－—]/)
      .map((t) => t.trim())
      .filter(isCleanTag)

    // 同段后续「文案：」简介（避免先命中标题行 </td>）
    const after = html.slice(m.index, m.index + 4500)
    const wi = after.indexOf('文案：')
    const blurb =
      wi >= 0
        ? stripHtml(after.slice(wi + '文案：'.length, wi + '文案：'.length + 900))
        : ''

    items.push(
      applyHeuristicMapping({
        platform: 'jinjiang',
        externalId,
        title,
        tags: tags.length ? tags : ['言情'],
        heat: 1500 - i,
        blurbShort: truncateBlurb(blurb),
        mapped: { genreSecondary: [] },
        mapSource: null,
      }),
    )
    i += 1
    if (items.length >= 40) break
  }

  // 退化：仅书名
  if (!items.length) {
    const simple = /onebook\.php\?novelid=(\d+)[^>]*>([^<]{1,80})/g
    while ((m = simple.exec(html)) !== null) {
      const externalId = m[1]
      const title = m[2].replace(/\s+/g, ' ').trim()
      if (!externalId || !title || seen.has(externalId)) continue
      seen.add(externalId)
      items.push(
        applyHeuristicMapping({
          platform: 'jinjiang',
          externalId,
          title,
          tags: ['言情'],
          heat: 1500 - items.length,
          blurbShort: '',
          mapped: { genreSecondary: [] },
          mapSource: null,
        }),
      )
      if (items.length >= 40) break
    }
  }

  if (!items.length) throw new Error('jinjiang: empty rank parse')
  return items
}
