import { chineseChapterToNumber } from '../novel/novel-outline.js'

const EPISODE_HEADER_RE = /^(?:[-*•]\s*)?(?:第\s*(\d+)\s*集)\s*[：:.\-—]?\s*(.*)$/
const CHAPTER_HEADER_RE = /^(?:[-*•]\s*)?(?:第\s*(\d+)\s*章|第([一二三四五六七八九十百千零两]+)章)\s*[：:.\-—]?\s*(.*)$/

export type ParsedUnit = {
  episodeNumber: number
  title: string
  body: string
}

function parseEpisodeNumber(m: RegExpMatchArray): number {
  return Number(m[1]) || 1
}

function parseChapterNumber(m: RegExpMatchArray): number | null {
  if (m[1]) return Number(m[1])
  if (m[2]) return chineseChapterToNumber(m[2])
  return null
}

export function splitDramaEpisodes(text: string): ParsedUnit[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const units: ParsedUnit[] = []
  let current: ParsedUnit | null = null
  const buf: string[] = []

  const flush = () => {
    if (!current) return
    const body = buf.join('\n').trim()
    if (body) units.push({ ...current, body })
    buf.length = 0
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const m = trimmed.match(EPISODE_HEADER_RE)
    if (m) {
      flush()
      const num = parseEpisodeNumber(m)
      const rest = (m[2] || '').trim()
      current = { episodeNumber: num, title: rest ? `第${num}集 ${rest}` : `第${num}集`, body: '' }
      continue
    }
    if (current) buf.push(line)
  }
  flush()

  if (!units.length && text.trim()) {
    return [{ episodeNumber: 1, title: '第1集', body: text.trim() }]
  }
  return units.sort((a, b) => a.episodeNumber - b.episodeNumber)
}

export function splitNovelChapters(text: string): ParsedUnit[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const units: ParsedUnit[] = []
  let current: ParsedUnit | null = null
  const buf: string[] = []

  const flush = () => {
    if (!current) return
    const body = buf.join('\n').trim()
    if (body) units.push({ ...current, body })
    buf.length = 0
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const m = trimmed.match(CHAPTER_HEADER_RE)
    if (m) {
      flush()
      const num = parseChapterNumber(m) ?? units.length + 1
      const rest = (m[3] || '').trim()
      current = { episodeNumber: num, title: rest ? `第${num}章 ${rest}` : `第${num}章`, body: '' }
      continue
    }
    if (current) buf.push(line)
  }
  flush()

  if (!units.length && text.trim()) {
    return [{ episodeNumber: 1, title: '第1章', body: text.trim() }]
  }
  return units.sort((a, b) => a.episodeNumber - b.episodeNumber)
}

export function extractTextFromHtml(html: string): { title: string; text: string } {
  let title = ''
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  }

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')

  const articleMatch = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch?.[1]) body = articleMatch[1]
  else {
    const mainMatch = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    if (mainMatch?.[1]) body = mainMatch[1]
  }

  body = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!title && body) {
    const first = body.split('\n').find(l => l.trim())
    if (first && first.length <= 80) title = first.trim()
  }

  return { title, text: body }
}
