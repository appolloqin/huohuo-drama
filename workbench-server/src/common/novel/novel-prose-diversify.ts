/**
 * 润色级统计指纹打散（写作质量，非检测逻辑）。
 * 覆盖：短语复读（了一 / —— / 。他）、与数字规范化同类——只改写法，不碰检测接口。
 * 句长均匀、用词分布需模型改句，见 WEBNOVEL_STAT_FINGERPRINT_GUIDE + 去 AI 味专项。
 */

import { countNovelChars } from './novel-char-limit.js'
import { diversifyAiTransitionTells } from './novel-ai-tells.js'
import {
  enforceMaxSentencesPerParagraph,
  varyNovelParagraphRhythm,
} from './novel-paragraph-format.js'

export function countSubstring(text: string, needle: string): number {
  let n = 0
  let i = 0
  while ((i = text.indexOf(needle, i)) !== -1) {
    n++
    i += needle.length
  }
  return n
}

/** 「了一」至多 3 处（≥4 易被标短语重复） */
export function maxLeYiKeep(charCount: number): number {
  if (charCount < 400) return 2
  return 3
}

export function maxEmDashKeep(charCount: number): number {
  if (charCount < 200) return 2
  return Math.min(5, Math.max(2, Math.ceil(charCount / 800)))
}

export function maxSentenceStartPronounKeep(charCount: number): number {
  if (charCount < 400) return 4
  return Math.min(8, Math.max(5, Math.ceil(charCount / 400)))
}

function isHan(ch: string | undefined): boolean {
  return !!ch && /[\u4e00-\u9fff]/.test(ch)
}

function replaceLeYiAt(text: string, index: number, variant: number): string {
  const prev = text[index - 1]

  if (text.slice(index, index + 3) === '了一眼') {
    const mode = variant % 3
    if (mode === 0) return text.slice(0, index) + '一眼' + text.slice(index + 3)
    if (mode === 1 && isHan(prev)) {
      return text.slice(0, index - 1) + '瞅了瞅' + text.slice(index + 3)
    }
    if (mode === 2 && isHan(prev)) {
      return text.slice(0, index - 1) + '望了望' + text.slice(index + 3)
    }
    return text.slice(0, index) + '一眼' + text.slice(index + 3)
  }

  if (text.slice(index, index + 3) === '了一下') {
    if (variant % 2 === 0) return text.slice(0, index) + '一下' + text.slice(index + 3)
    if (isHan(prev)) return text.slice(0, index + 1) + prev + text.slice(index + 3)
    return text.slice(0, index) + '一下' + text.slice(index + 3)
  }

  if (text.slice(index, index + 4) === '了一会儿') {
    const alts = ['片刻', '一会', '半晌']
    return text.slice(0, index) + alts[variant % alts.length] + text.slice(index + 4)
  }
  if (text.slice(index, index + 3) === '了一会') {
    const alts = ['片刻', '一会', '半晌']
    return text.slice(0, index) + alts[variant % alts.length] + text.slice(index + 3)
  }

  const next1 = text[index + 2] || ''
  if (/[阵口声截段把只条块回趟遍顿]/.test(next1)) {
    return text.slice(0, index) + text.slice(index + 2)
  }
  return text.slice(0, index) + '了' + text.slice(index + 2)
}

export function diversifyMechanicalLeYi(text: string, maxKeep?: number): string {
  if (!text) return text
  const budget = maxKeep ?? maxLeYiKeep(countNovelChars(text))
  const hits: number[] = []
  let idx = 0
  while ((idx = text.indexOf('了一', idx)) !== -1) {
    hits.push(idx)
    idx += 2
  }
  if (hits.length <= budget) return text

  const step = hits.length / budget
  const keep = new Set<number>()
  for (let k = 0; k < budget; k++) {
    keep.add(hits[Math.min(hits.length - 1, Math.floor(k * step))])
  }

  let out = text
  let variant = 0
  for (let i = hits.length - 1; i >= 0; i--) {
    const at = hits[i]
    if (keep.has(at)) continue
    if (out.slice(at, at + 2) !== '了一') continue
    out = replaceLeYiAt(out, at, variant++)
  }
  return out
}

function isOnomatopoeiaEmDash(before: string): boolean {
  return /[隆轰砰啪哐咚嘶呼嗷哇啊哎]/.test(before.slice(-6))
}

/** 打散叙述破折号刷屏；拟声优先保留 */
export function diversifyEmDashes(text: string, maxKeep?: number): string {
  const budget = maxKeep ?? maxEmDashKeep(countNovelChars(text))
  const hits: number[] = []
  let m: RegExpExecArray | null
  const re = /——/g
  while ((m = re.exec(text)) !== null) hits.push(m.index)
  if (hits.length <= budget) return text

  const keep = new Set<number>()
  for (const idx of hits) {
    if (keep.size >= budget) break
    if (isOnomatopoeiaEmDash(text.slice(0, idx))) keep.add(idx)
  }
  const need = budget - keep.size
  if (need > 0) {
    const candidates = hits.filter(i => !keep.has(i))
    for (let k = 0; k < need && candidates.length; k++) {
      keep.add(candidates[Math.floor((k + 0.5) * candidates.length / need)])
    }
  }

  let out = ''
  let cursor = 0
  let kept = 0
  for (const idx of hits) {
    out += text.slice(cursor, idx)
    if (keep.has(idx) && kept < budget) {
      out += '——'
      kept++
    } else {
      const prev = text[idx - 1] || ''
      const next = text[idx + 2] || ''
      if (!/[，。！？；：、“”…\n]/.test(prev) && !/[，。！？；：、“”…\n]/.test(next)) {
        out += '，'
      }
    }
    cursor = idx + 2
  }
  return out + text.slice(cursor)
}

const SENTENCE_START_PRONOUN_RE = /([。！？\n])([他她])(?![们的么俩娘妈])/g

/** 打散「。他/。她」句首复读 → 零主语承接 */
export function diversifySentenceStartPronouns(text: string, maxKeep?: number): string {
  const budget = maxKeep ?? maxSentenceStartPronounKeep(countNovelChars(text))
  const hits: Array<{ index: number; punct: string; pronoun: string }> = []
  let m: RegExpExecArray | null
  const re = new RegExp(SENTENCE_START_PRONOUN_RE.source, 'g')
  while ((m = re.exec(text)) !== null) {
    hits.push({ index: m.index, punct: m[1], pronoun: m[2] })
  }
  if (hits.length <= budget) return text

  const step = hits.length / budget
  const keep = new Set<number>()
  for (let k = 0; k < budget; k++) {
    keep.add(hits[Math.min(hits.length - 1, Math.floor(k * step))].index)
  }

  let out = text
  for (let i = hits.length - 1; i >= 0; i--) {
    const { index, punct, pronoun } = hits[i]
    if (keep.has(index)) continue
    if (out.slice(index, index + 2) !== punct + pronoun) continue
    out = out.slice(0, index + 1) + out.slice(index + 2)
  }
  return out
}

/** 润色收口：短语复读 + 衔接词/空转修饰打散 + 段落节奏 */
export function diversifyNovelProseTells(text: string): string {
  if (!text?.trim()) return text
  let out = diversifyAiTransitionTells(text)
  out = diversifyEmDashes(out)
  out = diversifyMechanicalLeYi(out)
  out = diversifySentenceStartPronouns(out)
  out = enforceMaxSentencesPerParagraph(out)
  out = varyNovelParagraphRhythm(out)
  return out
}
