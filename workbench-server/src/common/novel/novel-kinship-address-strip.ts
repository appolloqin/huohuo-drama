/**
 * 压迫方/仇人对话里误用族内称（秦二叔/大伯/霄哥儿）→ 改成姓名或姓+爷。
 * 仅在引号对白且前文窗口命中压迫方线索时改写，不改叙述、不改族内人对白。
 */
import { logTaskWarn } from '../task/task-logger.js'

/** 压迫方/外人说话线索（题材常见角色壳，非场面词） */
const OUTSIDER_SPEAKER_CUE =
  /钱虎|钱爷|债主|外门|差役|捕快|衙役|师弟|跑腿|跟班|王麻子|催债|门派来人|尸傀门|讨债|放贷/

const KINSHIP_REPLACE: Array<{ re: RegExp; to: string }> = [
  { re: /秦大伯/g, to: '秦爷' },
  { re: /秦二叔/g, to: '秦二爷' },
  { re: /秦三叔/g, to: '秦三爷' },
  { re: /秦大婶|秦婶娘/g, to: '秦婶' },
  { re: /霄哥儿/g, to: '秦霄' },
  // 无姓时：对白开头/逗号后的光杆族内称
  { re: /(^|[，,；;！!\s])大伯(?=[，,；;！!\s”"』]|$)/g, to: '$1秦爷' },
  { re: /(^|[，,；;！!\s])二叔(?=[，,；;！!\s”"』]|$)/g, to: '$1秦二爷' },
  { re: /(^|[，,；;！!\s])三叔(?=[，,；;！!\s”"』]|$)/g, to: '$1秦三爷' },
]

function rewriteKinshipInQuote(quoteInner: string): string {
  let next = quoteInner
  for (const { re, to } of KINSHIP_REPLACE) {
    next = next.replace(re, to)
  }
  return next
}

export function stripOutsiderKinshipAddress(content: string): {
  text: string
  removed: boolean
} {
  const raw = content || ''
  if (!raw.trim()) return { text: raw, removed: false }

  let changed = false
  const quoteRe = /([“"])([^”"]+)([”"])/g
  const text = raw.replace(quoteRe, (full, open: string, inner: string, close: string, offset: number) => {
    const lookback = raw.slice(Math.max(0, offset - 120), offset)
    if (!OUTSIDER_SPEAKER_CUE.test(lookback)) return full
    if (!/秦[大二三]叔|秦大伯|霄哥儿|(?:^|[，,])\s*[大二三]叔|(?:^|[，,])\s*大伯/.test(inner)) {
      return full
    }
    const nextInner = rewriteKinshipInQuote(inner)
    if (nextInner === inner) return full
    changed = true
    return `${open}${nextInner}${close}`
  })

  if (!changed) return { text: raw, removed: false }

  logTaskWarn('Novel', 'outsider-kinship-address-stripped', {
    excerpt: raw.slice(0, 48).replace(/\s+/g, ' '),
  })
  return { text, removed: true }
}
