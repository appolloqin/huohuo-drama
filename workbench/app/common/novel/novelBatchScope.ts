import type { BatchScope } from '~/composables/use-api'

export type BatchScopeForm = {
  mode: 'remaining' | 'all' | 'range' | 'chapters'
  fromChapter: number
  toChapter: number
  chapterNumbersText: string
  productionPipeline?: 'ai_video' | 'frame_slideshow'
}

/** 解析「1,3,5-8」为章号列表 */
export function parseChapterNumbersInput(text: string, maxChapter?: number): number[] {
  const out = new Set<number>()
  for (const part of text.split(/[,，、\s]+/)) {
    const t = part.trim()
    if (!t) continue
    const range = t.match(/^(\d+)\s*[-–—~～]\s*(\d+)$/)
    if (range) {
      let a = parseInt(range[1], 10)
      let b = parseInt(range[2], 10)
      if (a > b) [a, b] = [b, a]
      for (let i = a; i <= b; i++) out.add(i)
      continue
    }
    const n = parseInt(t, 10)
    if (Number.isFinite(n) && n >= 1) out.add(n)
  }
  let arr = [...out].sort((a, b) => a - b)
  if (maxChapter && maxChapter > 0) {
    arr = arr.filter(n => n <= maxChapter)
  }
  return arr
}

export function buildBatchScope(form: BatchScopeForm): BatchScope {
  const pipeline = form.productionPipeline
    ? { production_pipeline: form.productionPipeline }
    : {}
  if (form.mode === 'all') {
    return { mode: 'all', overwrite: true, ...pipeline }
  }
  if (form.mode === 'range') {
    const from = Math.max(1, Math.floor(form.fromChapter) || 1)
    const to = Math.max(from, Math.floor(form.toChapter) || from)
    return { mode: 'range', from_chapter: from, to_chapter: to, overwrite: true, ...pipeline }
  }
  if (form.mode === 'chapters') {
    return {
      mode: 'chapters',
      chapter_numbers: parseChapterNumbersInput(form.chapterNumbersText),
      overwrite: true,
      ...pipeline,
    }
  }
  return { mode: 'remaining', overwrite: false, ...pipeline }
}

/** 前端预估待处理章/集数（与后端筛选逻辑大致一致） */
export function estimateBatchCount(
  form: BatchScopeForm,
  stats: { total: number; pending: number; written: number },
): number {
  const total = stats.total || 0
  if (!total) return 0
  if (form.mode === 'remaining') return stats.pending
  if (form.mode === 'all') return total
  if (form.mode === 'range') {
    const from = Math.max(1, Math.floor(form.fromChapter) || 1)
    const to = Math.min(total, Math.max(from, Math.floor(form.toChapter) || from))
    return Math.max(0, to - from + 1)
  }
  if (form.mode === 'chapters') {
    return parseChapterNumbersInput(form.chapterNumbersText, total).length
  }
  return 0
}
