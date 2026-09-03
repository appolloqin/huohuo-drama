/**
 * 正文含 U+FFFD 时：词表未修尽则模型短修补含乱码的段落。
 */
import { chatCompletionText, sanitizeModelCreativeOutput, type TextBillingContext } from '../ai/ai.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  countReplacementChars,
  hasReplacementChars,
  repairNovelReplacementCharsLexicon,
  sampleReplacementContexts,
  REPLACEMENT_CHAR,
} from '../../common/novel/novel-replacement-char.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'

const MAX_PARAS = 8
const MAX_PARA_CHARS = 800

type Chunk = { kind: 'para' | 'sep'; value: string }

function splitKeepSeparators(text: string): Chunk[] {
  const out: Chunk[] = []
  const re = /\n\n+/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: 'para', value: text.slice(last, m.index) })
    out.push({ kind: 'sep', value: m[0]! })
    last = m.index + m[0]!.length
  }
  if (last < text.length || text.length === 0) {
    out.push({ kind: 'para', value: text.slice(last) })
  }
  return out
}

async function repairOneParagraph(args: {
  paragraph: string
  billing?: TextBillingContext
  chapterNumber?: number
}): Promise<string | null> {
  const para = args.paragraph.trim()
  if (!para || !para.includes(REPLACEMENT_CHAR)) return null
  const clipped = [...para].length > MAX_PARA_CHARS
    ? [...para].slice(0, MAX_PARA_CHARS).join('')
    : para

  const system = [
    '你是中文小说校对。正文里出现了 Unicode 替换符 U+FFFD（常显示为问号方块），通常是某个汉字损坏。',
    '任务：只把替换符补成正确汉字；其余文字、标点、换行、引号一律不动。',
    '禁止改写情节、禁止增删句子、禁止输出说明或 markdown。',
    '只输出修复后的同一段落全文。',
  ].join('\n')

  const user = `【含乱码段落】\n${clipped}`

  try {
    const raw = await chatCompletionText(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      {
        maxTokens: Math.min(2048, Math.max(256, Math.round([...clipped].length * 2.2))),
        temperature: 0.1,
        billing: args.billing
          ? { ...args.billing, reason: '小说替换符乱码短修补' }
          : undefined,
      },
    )
    let fixed = sanitizeModelCreativeOutput(raw) || ''
    fixed = normalizeNovelTemporalNumerals(fixed).trim()
    if (!fixed || [...fixed].length < Math.max(8, Math.floor([...clipped].length * 0.5))) {
      logTaskWarn('Novel', 'replacement-char-llm-too-short', {
        chapterNumber: args.chapterNumber,
        inLen: [...clipped].length,
        outLen: [...fixed].length,
      })
      return null
    }
    if (hasReplacementChars(fixed)) {
      logTaskWarn('Novel', 'replacement-char-llm-still-fffd', {
        chapterNumber: args.chapterNumber,
        samples: sampleReplacementContexts(fixed),
      })
      return null
    }
    return fixed
  } catch (err: any) {
    logTaskWarn('Novel', 'replacement-char-llm-failed', {
      chapterNumber: args.chapterNumber,
      error: err?.message || 'unknown',
    })
    return null
  }
}

/**
 * 检测 U+FFFD → 词表修复 → 残留段落模型短修补。
 * 应在正文收口路径调用（pipeline 落库前）。
 */
export async function maybeRepairNovelReplacementChars(args: {
  content: string
  chapterNumber?: number
  billing?: TextBillingContext
}): Promise<{ content: string; repaired: boolean; residual: number }> {
  let content = args.content || ''
  const before = countReplacementChars(content)
  if (before === 0) {
    return { content, repaired: false, residual: 0 }
  }

  // 词表路径内部会打 replacement-char-detected / lexicon-fixed
  content = repairNovelReplacementCharsLexicon(content)
  const afterLex = countReplacementChars(content)
  if (afterLex === 0) {
    return { content, repaired: true, residual: 0 }
  }

  logTaskWarn('Novel', 'replacement-char-needs-llm', {
    chapterNumber: args.chapterNumber,
    residual: afterLex,
    samples: sampleReplacementContexts(content),
  })

  const chunks = splitKeepSeparators(content)
  let paraHits = 0
  let anyLlm = false
  for (const chunk of chunks) {
    if (chunk.kind !== 'para' || !chunk.value.includes(REPLACEMENT_CHAR)) continue
    if (paraHits >= MAX_PARAS) break
    paraHits += 1
    const fixed = await repairOneParagraph({
      paragraph: chunk.value,
      billing: args.billing,
      chapterNumber: args.chapterNumber,
    })
    if (fixed) {
      // 保留原段首尾空白，只替换 trim 后的正文
      const leading = chunk.value.match(/^\s*/)?.[0] ?? ''
      const trailing = chunk.value.match(/\s*$/)?.[0] ?? ''
      chunk.value = `${leading}${fixed}${trailing}`
      anyLlm = true
    }
  }

  content = chunks.map(c => c.value).join('')
  content = repairNovelReplacementCharsLexicon(content)
  const residual = countReplacementChars(content)
  if (residual > 0) {
    logTaskWarn('Novel', 'replacement-char-residual', {
      chapterNumber: args.chapterNumber,
      residual,
      samples: sampleReplacementContexts(content),
    })
  } else if (anyLlm) {
    logTaskWarn('Novel', 'replacement-char-llm-fixed', {
      chapterNumber: args.chapterNumber,
      before,
    })
  }

  return {
    content,
    repaired: afterLex < before || anyLlm,
    residual,
  }
}
