/**
 * 网文数字规范化：
 * - 时间：中文年月日时 → 阿拉伯（一九九零年 → 1990年）
 * - 金钱：中文金额 → 阿拉伯（八百元 → 800元，两千元 → 2000元）
 * - 对话引号：顺带「」→ “”（见 novel-dialogue-quotes）
 * - 装饰分节符：剥离 *** / * * * 等（模型爱用的场切符号）
 */
import { normalizeNovelDialogueQuotes } from './novel-dialogue-quotes.js'

const CN_DIGIT: Record<string, string> = {
  '零': '0',
  '〇': '0',
  '○': '0',
  '一': '1',
  '二': '2',
  '两': '2',
  '三': '3',
  '四': '4',
  '五': '5',
  '六': '6',
  '七': '7',
  '八': '8',
  '九': '9',
}

function cnDigitRunToArabic(run: string): string {
  return [...run].map((ch) => CN_DIGIT[ch] ?? ch).join('')
}

function parseCnMonthToken(token: string): number | null {
  if (token === '正') return 1
  if (token === '十') return 10
  if (token === '十一') return 11
  if (token === '十二') return 12
  if (token.length === 1 && CN_DIGIT[token]) return Number(CN_DIGIT[token])
  return null
}

/** 一～三十一日（含廿/卅/初一～初十） */
function parseCnDayToken(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token)
  // 农历「初一」～「初十」
  if (token.startsWith('初') && token.length >= 2) {
    return parseCnDayToken(token.slice(1))
  }
  if (token === '十') return 10
  if (token === '二十') return 20
  if (token === '三十') return 30
  if (token.startsWith('廿') && token.length === 2 && CN_DIGIT[token[1]!]) {
    return 20 + Number(CN_DIGIT[token[1]!])
  }
  if (token === '卅') return 30
  if (token.startsWith('卅') && token.length === 2 && CN_DIGIT[token[1]!]) {
    return 30 + Number(CN_DIGIT[token[1]!])
  }
  if (token.startsWith('二十') && token.length === 3 && CN_DIGIT[token[2]!]) {
    return 20 + Number(CN_DIGIT[token[2]!])
  }
  if (token.startsWith('三十') && token.length === 3 && CN_DIGIT[token[2]!]) {
    return 30 + Number(CN_DIGIT[token[2]!])
  }
  if (token.startsWith('十') && token.length === 2 && CN_DIGIT[token[1]!]) {
    return 10 + Number(CN_DIGIT[token[1]!])
  }
  if (token.length === 1 && CN_DIGIT[token]) return Number(CN_DIGIT[token])
  return null
}

function parseCnHourToken(token: string): number | null {
  if (token === '十') return 10
  if (token === '十一') return 11
  if (token === '十二') return 12
  if (token === '两') return 2
  if (token.length === 1 && CN_DIGIT[token]) return Number(CN_DIGIT[token])
  return null
}

/** 解析常见中文整数（含十百千万，供金额用） */
export function parseCnIntegerToken(token: string): number | null {
  if (!token) return null
  if (/^\d+$/.test(token)) return Number(token)
  const s = token.replace(/两/g, '二')
  if (!/^[零〇○一二三四五六七八九十百千万]+$/.test(s)) return null

  let result = 0
  let section = 0
  let number = 0
  for (const ch of s) {
    if (CN_DIGIT[ch] != null) {
      number = Number(CN_DIGIT[ch])
      continue
    }
    if (ch === '十') {
      section += (number || 1) * 10
      number = 0
      continue
    }
    if (ch === '百') {
      section += (number || 1) * 100
      number = 0
      continue
    }
    if (ch === '千') {
      section += (number || 1) * 1000
      number = 0
      continue
    }
    if (ch === '万') {
      section = (section + number) * 10000
      result += section
      section = 0
      number = 0
      continue
    }
    return null
  }
  const n = result + section + number
  return Number.isFinite(n) && n >= 0 ? n : null
}

function normalizeNovelMoneyNumerals(text: string): string {
  // 八百元 / 两千元 / 一万二千块钱
  // 裸「块」仅在数额段较长时转换（八百块），避免「三块五」「一块石头」误伤
  return text.replace(
    /([零〇○一二两三四五六七八九十百千万]{1,16})(元|块钱|块)(?![头石砖瓦板])/g,
    (full, token: string, unit: string) => {
      if (unit === '块' && token.length < 2) return full
      const n = parseCnIntegerToken(token)
      if (n == null || n > 999_999_999) return full
      return `${n}${unit}`
    },
  )
}

const TIME_OF_DAY_PREFIX = '凌晨|清晨|清早|早上|上午|中午|午后|下午|傍晚|晚上|夜里|深夜|半夜|傍晚时分'

/**
 * 钟点中文 → 阿拉伯。
 * 「一点汤」「最后一点」是少量义，不得改成 1点；须有时段前缀或 点半/点钟/点整。
 */
function normalizeNovelClockNumerals(text: string): string {
  const re = new RegExp(
    `(${TIME_OF_DAY_PREFIX})?(十[一二]?|[两一二三四五六七八九])点(半|钟|整)?`,
    'g',
  )
  return text.replace(re, (full, tod: string | undefined, token: string, suffix: string | undefined) => {
    const n = parseCnHourToken(token)
    if (n == null) return full
    // 一点/两点：无时段、无半/钟/整 → 多为「少量」，不转
    if ((token === '一' || token === '两') && !tod && !suffix) return full
    // 其余裸「三点」等仍转（常见钟点）；有时段/半/钟一律转
    return `${tod || ''}${n}点${suffix || ''}`
  })
}

/** 剥离模型爱插的 *** / * * * / --- 场切装饰（改空行分段） */
export function stripNovelAsteriskSceneBreaks(text: string): string {
  if (!text) return text
  let out = text
  // 独立成行的装饰分隔
  out = out.replace(/^[ \t]*(?:\*(?:[ \t]*\*){2,}|_{3,}|-{3,}|={3,})[ \t]*$/gm, '')
  // 粘在段首/句中：「* * *屋里头」→ 空行 + 屋里头
  out = out.replace(/[ \t]*\*(?:[ \t]*\*){2,}[ \t]*/g, '\n\n')
  out = out.replace(/[ \t]*_{3,}[ \t]*/g, '\n\n')
  out = out.replace(/[ \t]*-{3,}[ \t]*/g, '\n\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim() ? out.replace(/^\n+/, '').replace(/\n+$/, '\n') : out
}

/** 剥离误入正文的流水线进度行（含编码损坏成 ???? 2/3 ??? 的形态） */
export function stripNovelPipelineStatusLeak(text: string): string {
  if (!text) return text
  let out = text
  // 整行/文末进度（含编码损坏 ???? 3/3 ???）
  out = out.replace(/\n*正在(?:大纲|审校|润色|降低|检测|补全|修复|模型|冷开篇|生成|连贯|修正)[^\n]{0,80}$/gm, '')
  out = out.replace(/\n*[?？\uFFFD]{3,}[^\n]{0,40}\d+\s*\/\s*\d+[^\n]{0,24}$/gm, '')
  out = out.replace(/\n*[?？\uFFFD]{6,}[^\n]{0,48}$/gm, '')
  out = out.replace(/\n*修正大纲落实\s*\d+\s*\/\s*\d+\s*轮[^\n]{0,12}$/gm, '')
  // 首尾成串弯引号/直引号装饰（非正文对白）
  out = out.replace(/^[‘’''""“”\s]{2,}/u, '')
  out = out.replace(/[‘’''""“”\s]{2,}$/u, '')
  return out
}

/** 将正文中的中文年月日时、金额转为阿拉伯数字；并清装饰分节符 */
export function normalizeNovelTemporalNumerals(text: string): string {
  if (!text) return text
  let out = text

  // 一九九零年 / 一九九〇年
  out = out.replace(/([零〇○一二三四五六七八九]{2,4})年/g, (_, run: string) => `${cnDigitRunToArabic(run)}年`)

  // 九零年代 / 八零年代
  out = out.replace(/([零〇一二三四五六七八九]{1,2})年代/g, (_, run: string) => `${cnDigitRunToArabic(run)}年代`)

  // 三月 / 十二月 / 正月（不含已是阿拉伯数字的）
  out = out.replace(/(正|十[一二]?|[一二三四五六七八九])月/g, (full, token: string) => {
    const n = parseCnMonthToken(token)
    return n != null ? `${n}月` : full
  })

  // 十五日 / 二十一日 / 廿三日 / 初三日
  out = out.replace(/(初?[正廿卅一二三四五六七八九十]{1,3})日/g, (full, token: string) => {
    if (token === '正' || token === '初正') return full
    const n = parseCnDayToken(token)
    return n != null && n >= 1 && n <= 31 ? `${n}日` : full
  })

  // 农历常见省略「日」：11月十七 / 正月十五 / 12月初三（勿伤「1月十七天」时长说法）
  out = out.replace(
    /(\d{1,2})月(初?[廿卅一二三四五六七八九十]{1,3})(?![日号岁个天点]|份)/g,
    (full, month: string, token: string) => {
      const n = parseCnDayToken(token)
      return n != null && n >= 1 && n <= 31 ? `${month}月${n}` : full
    },
  )

  // 十七号 / 初三号
  out = out.replace(/(初?[廿卅一二三四五六七八九十]{1,3})号/g, (full, token: string) => {
    const n = parseCnDayToken(token)
    return n != null && n >= 1 && n <= 31 ? `${n}号` : full
  })

  out = normalizeNovelClockNumerals(out)

  // 凌晨三时 / 下午四时
  // 勿伤成语/口语：「一时半会儿」「一时半刻」「一时兴起」等
  out = out.replace(
    /(十[一二]?|[两一二三四五六七八九])时(?![候间刻]|半会儿?|半刻|三刻|兴起)/g,
    (full, token: string) => {
      const n = parseCnHourToken(token)
      return n != null ? `${n}时` : full
    },
  )

  out = normalizeNovelMoneyNumerals(out)
  out = normalizeNovelDialogueQuotes(out)
  out = stripNovelAsteriskSceneBreaks(out)
  out = stripNovelPipelineStatusLeak(out)

  return out
}
