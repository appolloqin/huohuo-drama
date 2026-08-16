/**
 * 恨场压迫标尺：常识锚 × 20（SSOT 配套）
 * 规格：docs/superpowers/specs/2026-08-16-stakes-common-sense-20x-design.md
 *
 * 压迫性 = 主催超出常识；全档最低主催 ≥ 锚 × 20。
 * 主催 = 压力方当场限期要交的那笔；旁衬总账不算。
 */

export const STAKES_COMMON_SENSE_MIN_MULTIPLIER = 20

/** 题材默认常识锚（生成注入种子；本书【常识锚】可覆盖） */
export const STAKES_DEFAULT_ANCHOR_SEEDS = [
  { cluster: '年代/乡土/现实农村', amount: 2, unit: '块', hint: '壮劳力月余约2块 → 主催至少约40块' },
  { cluster: '都市/职场/重生都市', amount: 5000, unit: '元', hint: '月薪约5000元 → 主催至少约10万元' },
  { cluster: '修真/玄幻', amount: 10, unit: '（本书单位）', hint: '同阶常见代价约10 → 主催至少约200' },
] as const

export function buildStakesCommonSensePromptBlock(): string {
  return [
    '【恨场压迫标尺 · 常识锚×20】',
    '- 压迫性=主催明显超出常识；**全档统一最低：主催 ≥ 常识锚 × 20**。',
    '- 【恨】【急】须写清：**常识锚**（数额+单位，如「月余约2块」）+ **当场主催**（限期要交的那笔）；「半个月口粮」等修辞不能代替倍数。',
    '- 主催≠旁衬总账/秋后另算；禁止用大数字旁衬给小主催背书。',
    '- **禁止**把「常识锚×N」里的 N 当成锚（那是倍数议论）；锚必须是月余/月薪等负担额。',
    '- 默认锚（本书可覆盖）：',
    ...STAKES_DEFAULT_ANCHOR_SEEDS.map((s) => `  - ${s.cluster}：${s.hint}`),
  ].join('\n')
}

function cnDebtTokenToNumber(token: string): number | null {
  const t = token.replace(/钱$/g, '')
  if (!t) return null
  if (t === '几' || t === '十几') return 15
  if (t === '二十来' || t === '廿') return 20
  const d: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  if (t === '十') return 10
  if (t.length === 1 && d[t] != null) return d[t]!
  if (/^十[一二三四五六七八九]$/.test(t)) return 10 + (d[t[1]!] ?? 0)
  if (/^[一二两三四五六七八九]十$/.test(t)) return (d[t[0]!] ?? 0) * 10
  if (/^[一二两三四五六七八九]十[一二三四五六七八九]$/.test(t)) {
    return (d[t[0]!] ?? 0) * 10 + (d[t[2]!] ?? 0)
  }
  if (t.includes('百')) {
    const [hi, rest = ''] = t.split('百')
    const hundreds = !hi || hi === '一' ? 1 : (d[hi] ?? 1)
    const low = rest ? cnDebtTokenToNumber(rest) : 0
    if (low == null) return hundreds * 100
    return hundreds * 100 + low
  }
  if (t.includes('千')) {
    const [hi, rest = ''] = t.split('千')
    const thousands = !hi || hi === '一' ? 1 : (d[hi] ?? 1)
    const low = rest ? cnDebtTokenToNumber(rest) : 0
    if (low == null) return thousands * 1000
    return thousands * 1000 + low
  }
  if (t.includes('万')) {
    const [hi, rest = ''] = t.split('万')
    const wan = !hi || hi === '一' ? 1 : (cnDebtTokenToNumber(hi) ?? d[hi!] ?? 1)
    const low = rest ? cnDebtTokenToNumber(rest) : 0
    if (low == null) return wan * 10000
    return wan * 10000 + low
  }
  return null
}

function matchAmountToken(tok: string): number | null {
  if (/^\d+$/.test(tok)) return Number(tok)
  return cnDebtTokenToNumber(tok)
}

const CN_OR_NUM = String.raw`(?:\d{1,8}|[一二两三四五六七八九十百千万零廿几]+(?:来)?)`
/** 金额左侧不得再接中文数词/数字，避免「三十二」被拆成「十二」 */
const AMOUNT_LEFT_BOUND = String.raw`(?<![一二两三四五六七八九十百千万零廿两\d])`

/** 抽出常识锚数额（【常识锚】或月余/月薪；禁止把「常识锚×16」当锚） */
export function extractCommonSenseAnchorAmount(text: string): number | null {
  const body = (text || '').replace(/\s+/g, '')
  if (!body) return null
  const patterns = [
    /【常识锚】[^【】×]{0,100}?(?:约|大概|左右)?(\d{1,8})(?:块|元|工分|灵石|钱)/,
    /【常识锚】[^【】×]{0,100}?(?:约|大概|左右)?([一二两三四五六七八九十百千万零廿几]+(?:来)?)(?:块|元|工分|灵石|钱)/,
    /(?:壮劳力)?月余[^。！？；×]{0,12}?(?:约|大概|左右)?(\d{1,8})(?:块|元|钱)/,
    /(?:壮劳力)?月余[^。！？；×]{0,12}?(?:约|大概|左右)?([一二两三四五六七八九十百千万零廿几]+)(?:块|元|钱)/,
    /月薪[^。！？；×]{0,12}?(?:约|大概|左右)?(\d{1,8})(?:元|块|钱)/,
    /(?:一袋口粮|口粮价)[^。！？；×]{0,12}?(?:约|大概|左右)?(\d{1,8})(?:块|元|钱)/,
    /同阶[^。！？；]{0,12}?代价[^。！？；×]{0,10}?(?:约|大概|左右)?(\d{1,8})/,
  ]
  for (const re of patterns) {
    const m = body.match(re)
    if (!m?.[1]) continue
    const n = matchAmountToken(m[1])
    if (n != null && n > 0) return n
  }
  return null
}

/**
 * 当场主催额。金额紧贴「块/元…」，且不被「三十二→十二」拆词。
 */
export function extractActiveDemandAmounts(text: string): number[] {
  const body = (text || '').replace(/\s+/g, '')
  const out: number[] = []
  const patterns = [
    new RegExp(
      `(?:要清|催缴|催|逼|拿不出|必须还|拍出来|顶账|抵账|现钱|交清|凑齐)[^。！？；]{0,8}?${AMOUNT_LEFT_BOUND}(${CN_OR_NUM})(?:块|元|钱|工分|灵石)`,
      'g',
    ),
    new RegExp(`(?:要|还)${AMOUNT_LEFT_BOUND}(${CN_OR_NUM})(?:块|元|钱|工分|灵石)`, 'g'),
    new RegExp(`欠(?:他的|下的|着|队里)?${AMOUNT_LEFT_BOUND}(${CN_OR_NUM})(?:块|元|钱|工分|灵石)`, 'g'),
    new RegExp(`欠[^。！？；块元]{0,6}?${AMOUNT_LEFT_BOUND}(${CN_OR_NUM})(?:块|元|钱|工分|灵石)`, 'g'),
    new RegExp(
      `${AMOUNT_LEFT_BOUND}(${CN_OR_NUM})(?:块|元)(?:[零一二三四五六七八九十两\\d毛分角]+)?(?:今天|今儿|天亮前|天黑前)?(?:必须还|拍出来|拿不出|顶账|抵账|不还就|交清|凑齐)`,
      'g',
    ),
    new RegExp(
      `${AMOUNT_LEFT_BOUND}(${CN_OR_NUM})(?:块|元)钱?(?:今天|今儿|三日(?:内|里)?|限期|天亮前|天黑前)[^。！？]{0,12}?(?:还|拿不出|卸(?:门|走)|顶账|交清|凑齐|扣粮)`,
      'g',
    ),
  ]
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      if (!m[1]) continue
      const n = matchAmountToken(m[1])
      if (n != null && n > 0) out.push(n)
    }
  }
  return [...new Set(out)]
}

/** 由题材/正文词推断默认锚（无显式【常识锚】时） */
export function inferDefaultAnchorAmount(text: string): number {
  const t = text || ''
  if (/修真|玄幻|仙侠|灵石|功法|宗门/.test(t)) return 10
  if (/都市|职场|公司|月薪|白领|霸总/.test(t)) return 5000
  return 2
}

export type StakesCommonSenseResult = {
  ok: boolean
  message: string | null
  anchor: number | null
  demands: number[]
  minRequired: number | null
}

/**
 * 恨场压迫是否够格（锚×20）。
 * - 无主催数额线索 → 不判金钱标尺
 * - 有主催 → 必须锚×20；缺显式锚时用题材默认锚
 */
export function evaluateStakesCommonSense(text: string): StakesCommonSenseResult {
  const body = (text || '').trim()
  if (body.length < 12) {
    return { ok: true, message: null, anchor: null, demands: [], minRequired: null }
  }
  const demands = extractActiveDemandAmounts(body)
  if (!demands.length) {
    return { ok: true, message: null, anchor: null, demands: [], minRequired: null }
  }
  const explicit = extractCommonSenseAnchorAmount(body)
  const anchor = explicit ?? inferDefaultAnchorAmount(body)
  const minRequired = anchor * STAKES_COMMON_SENSE_MIN_MULTIPLIER
  const tooSmall = demands.filter((d) => d < minRequired)
  if (tooSmall.length) {
    const shown = Math.max(...tooSmall)
    return {
      ok: false,
      message:
        `赌注错位：恨场压迫主催须≥常识锚×${STAKES_COMMON_SENSE_MIN_MULTIPLIER}`
        + `（锚${anchor}→至少${minRequired}）；当前主催约${shown}，压迫性不足。`
        + `须抬主催或改锚；禁止旁衬大数字洗白；勿把「常识锚×N」里的N当成锚。`,
      anchor,
      demands,
      minRequired,
    }
  }
  return { ok: true, message: null, anchor, demands, minRequired }
}

/** 文本级赌注错位（大纲分章与正文共用） */
export function detectStakesMismatchText(text: string): string | null {
  return evaluateStakesCommonSense(text).message
}
