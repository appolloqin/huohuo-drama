/**
 * 剥模型把提示词任务标签写进正文的泄漏（如「（恨拍）」「【爽】」单独成行）。
 * 题材无关：只剥恨/爽/急/盼拍元标记，不碰叙事正文。
 */
import { logTaskWarn } from '../task/task-logger.js'

/** 单独成行的情绪拍标签 */
const BEAT_META_LINE_RE =
  /^\s*[（(【\[]?\s*(?:恨|爽|急|盼)\s*拍\s*[）)】\]]?\s*[:：]?\s*$/gm

/** 【恨】【爽】【急】【盼】单独成行（无「拍」字） */
const PHASE_BRACKET_LINE_RE =
  /^\s*[【\[]\s*(?:恨|爽|急|盼)\s*[】\]]\s*[:：]?\s*$/gm

/** 行首粘连的（恨拍）后再接正文 */
const BEAT_META_LEAD_RE =
  /^\s*[（(【\[]\s*(?:恨|爽|急|盼)\s*拍\s*[）)】\]]\s*[:：]?\s*/gm

/** 【本拍任务 — …】整行泄漏 */
const BEAT_TASK_HEADER_RE = /^\s*【本拍任务[^】]{0,80}】\s*$/gm

/** 第 N/M 拍 · 恨 类任务行 */
const BEAT_INDEX_PHASE_LINE_RE =
  /^\s*第\s*\d+\s*[/／]\s*\d+\s*拍\s*[·・.|｜]?\s*(?:恨|爽|急|盼)\s*[:：]?\s*$/gm

function normalizeWs(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
}

export function stripEmotionBeatMetaLabels(content: string): {
  text: string
  removed: boolean
} {
  const raw = content || ''
  if (!raw.trim()) return { text: raw, removed: false }

  const before = normalizeWs(raw)
  let text = raw
  text = text.replace(BEAT_META_LINE_RE, '')
  text = text.replace(PHASE_BRACKET_LINE_RE, '')
  text = text.replace(BEAT_TASK_HEADER_RE, '')
  text = text.replace(BEAT_INDEX_PHASE_LINE_RE, '')
  text = text.replace(BEAT_META_LEAD_RE, '')
  text = normalizeWs(text)

  if (text === before) return { text: before, removed: false }

  logTaskWarn('Novel', 'emotion-beat-meta-stripped', {
    excerpt: before.slice(0, 48).replace(/\s+/g, ' '),
  })
  return { text, removed: true }
}
