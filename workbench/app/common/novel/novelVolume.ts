/** 从全书大纲【分卷设计】解析各卷章节范围，供章节列表分组展示 */

export type OutlineVolume = {
  label: string
  start: number
  end: number
  blurb?: string
}

const VOLUME_RANGE_RE = /第\s*(\d+)\s*[～~\-—]\s*(\d+)\s*章/
const VOLUME_NAME_RE = /第([一二三四五六七八九十百\d]+)卷[《「]([^》」]+)[》」]?/

function splitEvenChapterRanges(totalChapters: number, chunkSize: number): OutlineVolume[] {
  const size = Math.max(10, chunkSize)
  const out: OutlineVolume[] = []
  for (let start = 1; start <= totalChapters; start += size) {
    const end = Math.min(totalChapters, start + size - 1)
    out.push({ label: `第${start}～${end}章`, start, end })
  }
  return out
}

export function parseVolumeRangesFromOutline(
  outline: string,
  totalChapters = 0,
): OutlineVolume[] {
  const text = outline?.trim()
  if (!text) return []

  const startIdx = text.indexOf('【分卷设计】')
  const section = startIdx >= 0
    ? text.slice(startIdx).split(/\n【分章概要】/)[0]
    : text

  const volumes: OutlineVolume[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('【')) continue
    const rangeM = trimmed.match(VOLUME_RANGE_RE)
    if (!rangeM) continue
    const start = Number(rangeM[1])
    const end = Number(rangeM[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) continue
    const volM = trimmed.match(VOLUME_NAME_RE)
    const label = volM ? `第${volM[1]}卷《${volM[2]}》` : `第${start}～${end}章`
    volumes.push({ label, start, end, blurb: trimmed })
  }

  if (volumes.length) {
    volumes.sort((a, b) => a.start - b.start)
    return volumes
  }

  if (totalChapters > 0) {
    return splitEvenChapterRanges(totalChapters, 50)
  }
  return []
}

export function resolveVolumeForChapter(
  volumes: OutlineVolume[],
  chapterNumber: number,
): OutlineVolume | null {
  if (!chapterNumber || !volumes.length) return null
  return volumes.find(v => chapterNumber >= v.start && chapterNumber <= v.end) ?? null
}

export type ChapterListBlock =
  | { type: 'volume'; key: string; volume: OutlineVolume }
  | { type: 'chapter'; key: string; ep: Record<string, unknown> }

export function buildChapterListBlocks(
  episodes: Array<Record<string, unknown>>,
  volumes: OutlineVolume[],
): ChapterListBlock[] {
  if (!volumes.length) {
    return episodes.map(ep => ({
      type: 'chapter' as const,
      key: `ep-${ep.id}`,
      ep,
    }))
  }

  const blocks: ChapterListBlock[] = []
  let lastVolumeKey = ''

  for (const ep of episodes) {
    const num = Number(ep.episode_number ?? ep.episodeNumber ?? 0)
    const vol = resolveVolumeForChapter(volumes, num)
    const volKey = vol ? `${vol.start}-${vol.end}` : ''
    if (vol && volKey !== lastVolumeKey) {
      blocks.push({
        type: 'volume',
        key: `vol-${volKey}`,
        volume: vol,
      })
      lastVolumeKey = volKey
    }
    blocks.push({
      type: 'chapter',
      key: `ep-${ep.id}`,
      ep,
    })
  }
  return blocks
}
