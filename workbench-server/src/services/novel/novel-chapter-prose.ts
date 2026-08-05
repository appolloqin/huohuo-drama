/**
 * 小说章节「读者正文」解析：章缝 / 审校 / snapshot 共用。
 * 禁止把 scriptContent（常见为写作说明）当上章故事正文。
 */
import type { EpisodeRow } from '../../db/repos/types.js'
import {
  splitProseAndChangeRecord,
  stripLengthAdjustInstructionEcho,
} from '../../common/novel/novel-change-record.js'
import { hydrateNovelEpisode } from './novel-chapter-service.js'

export { stripLengthAdjustInstructionEcho } from '../../common/novel/novel-change-record.js'

/** 整篇更像「本章写作说明」模板，而非叙事正文 */
export function looksLikeWritingBriefDocument(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  if (/^##\s*本章写作说明/m.test(t)) return true
  const head = t.slice(0, 360)
  if (/\*\*情节目标\*\*/.test(head) && /\*\*(建议出场人物|场景氛围|篇幅侧重|情绪基调)\*\*/.test(t)) {
    return true
  }
  return false
}

/**
 * 剥离变更记录、一致性账本/提醒；若整篇仍是写作说明则返回空串（章缝勿注入）。
 */
export function stripChapterSeamNoise(text: string): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  if (looksLikeWritingBriefDocument(raw)) return ''
  let prose = splitProseAndChangeRecord(raw).prose || raw
  prose = stripLengthAdjustInstructionEcho(prose)
  prose = prose
    .replace(/【[*＊]?一致性提醒[*＊]?】[\s\S]*$/u, '')
    .replace(/【[*＊]?一致性账本[*＊]?】[\s\S]*$/u, '')
    .replace(/\n{0,2}\*\*章末钩子\*\*[\s\S]*$/u, '')
    .trim()
  if (!prose || looksLikeWritingBriefDocument(prose)) return ''
  return prose
}

/** 从 episode 解析可用于章缝的故事正文（hydrate 磁盘，忽略 scriptContent） */
export function resolveNovelEpisodeStoryProse(ep: EpisodeRow): string {
  const hydrated = hydrateNovelEpisode(ep)
  const raw = (hydrated.content || '').trim()
  if (!raw) return ''
  return stripChapterSeamNoise(raw)
}
