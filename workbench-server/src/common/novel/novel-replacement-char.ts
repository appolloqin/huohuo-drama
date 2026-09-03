/**
 * Unicode 替换符 U+FFFD（）检测与词表修复。
 * 成因：模型/网关对生僻汉字吐非法 UTF-8 或替换符，管道原样落库。
 * 程序兜底常见双字词；未知残留交由 maybeRepairNovelReplacementChars（模型短修补）。
 */

import { logTaskWarn } from '../task/task-logger.js'

export const REPLACEMENT_CHAR = '\uFFFD'

/** 第二字较生僻、易被打成 U+FFFD 的常见双字词（网文/文言） */
const DIGRAPHS = [
  '踉跄',
  '尴尬',
  '踌躇',
  '忐忑',
  '蜿蜒',
  '氤氲',
  '璀璨',
  '嶙峋',
  '怂恿',
  '峥嵘',
  '铿锵',
  '旖旎',
  '婆娑',
  '腼腆',
  '徘徊',
  '徜徉',
  '逡巡',
  '趑趄',
  '嗫嚅',
  '龌龊',
  '邋遢',
  '疙瘩',
  '囫囵',
  '龃龉',
  '饕餮',
  '貔貅',
  '嘀咕',
]

function uniqueDigraphs(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of DIGRAPHS) {
    const w = raw.trim()
    if ([...w].length !== 2) continue
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

type LexRule = { re: RegExp; word: string }

function buildLexRules(): LexRule[] {
  const digraphs = uniqueDigraphs()
  const firstHits = new Map<string, string[]>()
  const secondHits = new Map<string, string[]>()
  for (const w of digraphs) {
    const [a, b] = [...w]
    if (!firstHits.has(a)) firstHits.set(a, [])
    firstHits.get(a)!.push(w)
    if (!secondHits.has(b)) secondHits.set(b, [])
    secondHits.get(b)!.push(w)
  }

  const rules: LexRule[] = []
  for (const w of digraphs) {
    const [a, b] = [...w]
    if ((firstHits.get(a) || []).length === 1) {
      rules.push({ re: new RegExp(`${escapeRegExp(a)}${REPLACEMENT_CHAR}`, 'g'), word: w })
    }
    if ((secondHits.get(b) || []).length === 1) {
      rules.push({ re: new RegExp(`${REPLACEMENT_CHAR}${escapeRegExp(b)}`, 'g'), word: w })
    }
  }
  return rules
}

const LEX_RULES = buildLexRules()

export function countReplacementChars(text: string | null | undefined): number {
  if (!text) return 0
  let n = 0
  for (const ch of text) {
    if (ch === REPLACEMENT_CHAR) n += 1
  }
  return n
}

export function hasReplacementChars(text: string | null | undefined): boolean {
  return Boolean(text && text.includes(REPLACEMENT_CHAR))
}

/** 摘取含  的短上下文，供日志 */
export function sampleReplacementContexts(text: string, limit = 3): string[] {
  if (!text || !text.includes(REPLACEMENT_CHAR)) return []
  const out: string[] = []
  let from = 0
  while (out.length < limit) {
    const i = text.indexOf(REPLACEMENT_CHAR, from)
    if (i < 0) break
    const start = Math.max(0, i - 12)
    const end = Math.min(text.length, i + 13)
    out.push(text.slice(start, end).replace(/\s+/g, ' '))
    from = i + 1
  }
  return out
}

/**
 * 词表同步修复常见「字+」双字词。
 * 未知残留原样返回（留给模型短修补）。
 */
export function repairNovelReplacementCharsLexicon(text: string): string {
  if (!text || !text.includes(REPLACEMENT_CHAR)) return text
  const before = countReplacementChars(text)
  logTaskWarn('Novel', 'replacement-char-detected', {
    count: before,
    samples: sampleReplacementContexts(text),
  })
  let out = text
  for (const { re, word } of LEX_RULES) {
    out = out.replace(re, word)
  }
  const after = countReplacementChars(out)
  if (after < before) {
    logTaskWarn('Novel', 'replacement-char-lexicon-fixed', {
      before,
      after,
    })
  }
  return out
}
