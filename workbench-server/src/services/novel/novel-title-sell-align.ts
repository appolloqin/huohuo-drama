/**
 * 书名/梗概卖点 ↔ 大纲对齐（题材无关结构合同）
 * - 从书名冒号后钩子与「数词+量级名词」抽出硬钩（字面来自书名，不扩写题材词表）
 * - 硬钩须在第1章【信息增量】【盼】落地；禁止只写在总纲/分卷终局
 */
import { extractTagBlock, sliceOutlineChapterSection } from './novel-outline-drama-fields.js'
import { outlineBeatCoveredIn } from './novel-outline-beat-cover.js'

const TITLE_HOOK_MAX = 8

/**
 * 书名中的量级卖点：数词 + 可选万/亿/级 + 1～3 字名词
 * （结构抽取，不绑定兵/灵石等具体题材）
 */
const TITLE_MAGNITUDE_RE =
  /(?:[零一二两三四五六七八九十百千万亿]+|[0-9]+(?:\.[0-9]+)?)(?:万|亿)?(?:级|[\u4e00-\u9fff]{1,3})/g

/** 分章标签里常见的「另一小数额」——用于检测量级被顶替（不含章号） */
const OTHER_QTY_RE =
  /[一二两三四五六七八九十][一二三四五六七八九十百千]*|[1-9]\d{0,3}(?:万|亿|百|千)?/

function uniqKeepOrder(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const t = raw.replace(/\s+/g, '').trim()
    if ([...t].length < 2 || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= TITLE_HOOK_MAX) break
  }
  return out
}

/** 从书名（及可选梗概）抽出须在第1章兑现的卖点钩子 */
export function extractTitleSellHooks(title?: string, premise?: string): string[] {
  const t = (title || '').trim()
  if (!t) return []
  const hooks: string[] = []

  // 冒号/破折号后的商业钩（字面整段）
  const parts = t.split(/[：:——]/)
  const after = parts.slice(1).join('').trim()
  if ([...after].length >= 4) hooks.push(after)

  for (const m of t.matchAll(TITLE_MAGNITUDE_RE)) {
    if (m[0]) hooks.push(m[0])
  }

  // 梗概中与书名相同的量级短语（可选）
  const p = (premise || '').replace(/\s+/g, '').slice(0, 200)
  if (p) {
    for (const m of p.matchAll(TITLE_MAGNITUDE_RE)) {
      if (m[0] && t.includes(m[0])) hooks.push(m[0])
    }
  }

  return uniqKeepOrder(hooks)
}

function earlyBookTags(outline: string): string {
  return [
    extractTagBlock(outline, '总纲') || '',
    extractTagBlock(outline, '卖点偏转') || '',
    extractTagBlock(outline, '非常规压力源') || '',
    extractTagBlock(outline, '能力非常规用法') || '',
  ].join('\n')
}

/** 书名卖点分章落地窗口：仅第1章 */
function chapterOneSection(outline: string): string {
  return sliceOutlineChapterSection(outline || '', 1)
}

/** 第1章卖点相关标签（信息增量+盼，避免章号干扰量级检测） */
function chapterOneSellTags(outline: string): string {
  const section = chapterOneSection(outline)
  return [
    extractTagBlock(section, '信息增量') || '',
    extractTagBlock(section, '盼') || '',
    extractTagBlock(section, '局面变化') || '',
    extractTagBlock(section, '能力非常规用法') || '',
  ].join('\n')
}

/** 量级短语的数词段（去掉尾部名词/级） */
export function titleMagnitudeAmount(titleMag: string): string {
  const p = titleMag.replace(/\s+/g, '')
  const m = p.match(
    /^((?:[零一二两三四五六七八九十百千万亿]+|[0-9]+(?:\.[0-9]+)?)(?:万|亿)?)(级|[\u4e00-\u9fff]{1,3})$/,
  )
  return m?.[1] || p
}

/**
 * 文中「万/亿级」数词段（含百万/千万）。
 * 用于硬闸：只认字面，禁止意译/分句 OR 漏掉目标量级。
 */
export function extractScaleAmountTokens(text: string): string[] {
  const t = (text || '').replace(/\s+/g, '')
  if (!t) return []
  const out: string[] = []
  if (t.includes('百万')) out.push('百万')
  if (t.includes('千万')) out.push('千万')
  for (const m of t.matchAll(/(?:[零一二两三四五六七八九十百千]+|[0-9]+)(?:万|亿)/g)) {
    if (m[0]) out.push(m[0])
  }
  return [...new Set(out)]
}

/** 书名中的量级数词（如百万）；无量级书名则空 */
export function extractTitleScaleAmount(title?: string): string {
  const mag = (title || '').match(TITLE_MAGNITUDE_RE)?.[0]
  if (!mag) return ''
  return titleMagnitudeAmount(mag)
}

function hookCoveredIn(haystack: string, hook: string): boolean {
  const h = haystack.replace(/\s+/g, '')
  const p = hook.replace(/\s+/g, '')
  if (!p) return true
  if (h.includes(p)) return true
  // 量级钩：必须字面数词段，禁止 outlineBeatCoveredIn 意译把「三百」当成「百万兵」
  const scales = extractScaleAmountTokens(p)
  if (scales.length) {
    return scales.every(s => h.includes(s))
  }
  const mag = p.match(
    /^((?:[零一二两三四五六七八九十百千万亿]+|[0-9]+)(?:万|亿)?)(级|[\u4e00-\u9fff]{1,3})$/,
  )
  if (mag) {
    const [, amount, unit] = mag
    if (amount && unit && h.includes(amount) && h.includes(unit)) return true
    return false
  }
  if (outlineBeatCoveredIn(h, p)) return true
  return false
}

export type TitleSellAlignResult = {
  ok: boolean
  reasons: string[]
  hooks: string[]
}

/**
 * 第1章分章须兑现书名硬钩；量级不得只写在总纲/终局，也不得被无关小数额顶替。
 */
export function assertOutlineTitleSellAlignment(
  outline: string,
  title?: string,
  premise?: string,
): TitleSellAlignResult {
  const hooks = extractTitleSellHooks(title, premise)
  if (!hooks.length) return { ok: true, reasons: [], hooks }

  const book = earlyBookTags(outline || '')
  const ch1 = chapterOneSection(outline || '')
  const sellTags = chapterOneSellTags(outline || '')
  const ch1Window = [ch1, sellTags].join('\n')

  if ([...ch1.replace(/\s+/g, '')].length < 40) {
    return { ok: false, reasons: ['第1章分章过短，无法核对书名卖点'], hooks }
  }

  const reasons: string[] = []
  const missing = hooks.filter(h => !hookCoveredIn(ch1Window, h))
  if (missing.length) {
    reasons.push(
      `书名卖点未写入第1章：${missing.slice(0, 4).join('、')}（须在【信息增量】【盼】落地；禁止只写在总纲/分卷终局）`,
    )
  }

  const titleMag = (title || '').match(TITLE_MAGNITUDE_RE)?.[0]
  if (titleMag) {
    const amount = titleMagnitudeAmount(titleMag)
    const inCh1 = amount.length >= 2 && (ch1Window.includes(amount) || sellTags.includes(amount))
    const inBookOnly = amount.length >= 2 && !inCh1 && book.includes(amount)
    if (inBookOnly) {
      reasons.push(
        `书名量级「${titleMag}」仅出现在总纲/偏转标签，未写入第1章分章；须在第1章交代通向「${amount}」的目标，禁止推到卷末/终局`,
      )
    }
    // 量级缩水：第1章卖点标签出现其他数额，却不见书名数词段
    const hasOtherQty = OTHER_QTY_RE.test(sellTags.replace(/\s+/g, ''))
    if (hasOtherQty && !inCh1 && amount.length >= 2) {
      reasons.push(
        `第1章【信息增量】【盼】用了其他数额，却未点名书名量级「${titleMag}」（须同章写清目标/阶梯仍是「${amount}」）`,
      )
    }
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], hooks }
}

/** 注入大纲生成的硬性书名合同（辅助模型；闸门在 assert） */
export function buildTitleSellHardRequirement(title?: string, premise?: string): string {
  const hooks = extractTitleSellHooks(title, premise)
  if (!hooks.length) return ''
  const mag = (title || '').match(TITLE_MAGNITUDE_RE)?.[0]
  const amount = mag ? titleMagnitudeAmount(mag) : ''
  const magLine = amount
    ? `第1章【信息增量】与【盼】必须字面出现「${amount}」：可写「眼前先得到一笔较小的，目标/总量仍是${mag}」；禁止只把「${mag}」写在分卷高潮、卷末或终局。`
    : ''
  return [
    `【书名卖点硬合同】书名钩子：${hooks.join('、')}。`,
    '第1章【信息增量】与【盼】必须写清该书名卖点如何落地；总纲【卖点偏转】【能力非常规用法】可点名同一卖点，但不能替代第1章分章。',
    magLine,
    '若第1章还拿不到书名上的全量，必须在同一章分章标签写明完整目标仍是书名硬钩，禁止改成无关小数额或推迟到后文规划。',
  ].filter(Boolean).join('')
}

/**
 * 第1章正文写引导（注入生成 prompt，非交付后检查）。
 */
export function buildChapterTitleSellHardRequirement(
  title?: string,
  premise?: string,
  chapterNumber = 1,
): string {
  if (chapterNumber !== 1) return ''
  const hooks = extractTitleSellHooks(title, premise)
  if (!hooks.length) return ''
  const mag = (title || '').match(TITLE_MAGNITUDE_RE)?.[0]
  const amount = mag ? titleMagnitudeAmount(mag) : ''
  const magLine = amount
    ? [
      `书名量级（同场面两步，机制以【信息增量】为准）：`,
      `①写出眼前得到的这一笔/这一步；②写清它和字面「${amount}」的关系（目标/总量/上限/累计）。`,
      `正文须出现字面「${amount}」；禁止只写眼前小数额、却不提「${amount}」这个目标。`,
    ].join('')
    : ''
  return [
    `【书名卖点·写引导｜第1章】钩子：${hooks.join('、')}。`,
    '正文场面化写出书名卖点（勿只写无关压力而丢掉书名硬钩）；具体机制/道具跟大纲，勿另造题材套路。',
    magLine,
  ].filter(Boolean).join('')
}

/**
 * 第1章读者正文须兑现书名硬钩（与大纲闸门同钩子）。
 */
export function assertChapterTitleSellAlignment(
  prose: string,
  title?: string,
  premise?: string,
  chapterNumber = 1,
): TitleSellAlignResult {
  if (chapterNumber !== 1) return { ok: true, reasons: [], hooks: [] }
  const hooks = extractTitleSellHooks(title, premise)
  if (!hooks.length) return { ok: true, reasons: [], hooks }
  const window = (prose || '').replace(/\s+/g, '')
  if ([...window].length < 80) {
    return { ok: false, reasons: ['正文过短，无法核对书名卖点'], hooks }
  }

  const reasons: string[] = []
  const missing = hooks.filter(h => !hookCoveredIn(window, h))
  if (missing.length) {
    reasons.push(
      `第1章正文未兑现书名卖点：${missing.slice(0, 4).join('、')}（须场面化点名书名硬钩；量级须字面出现或写清目标）`,
    )
  }

  const titleMag = (title || '').match(TITLE_MAGNITUDE_RE)?.[0]
  if (titleMag) {
    const amount = titleMagnitudeAmount(titleMag)
    // 硬闸：书名量级数词必须字面出现（可同时写小数额到账）；不再依赖「有无其他数额」才检
    if (amount.length >= 2 && !window.includes(amount)) {
      reasons.push(
        `第1章未点明书名量级「${titleMag}」字面「${amount}」（可写「今日只到账部分，目标仍是${titleMag}」；禁止只写小数额）`,
      )
    }
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], hooks }
}
