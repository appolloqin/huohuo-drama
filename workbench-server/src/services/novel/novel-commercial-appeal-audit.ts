/**
 * 吸引力审（与 21 维 continuity 解耦）
 * - 醒炕盘点 / 开篇无压力对峙 / 卖点首屏缺失 → 硬判「无」，触发 craft 修写
 * - 禁止写入 continuity_check / buildHardRejectContinuityCheck
 */
import type { DramaGateEntry, DramaGateLevel, ChapterCraftResult } from './novel-chapter-craft-check.js'

export type AppealDimCode =
  | 'opening_promise'
  | 'hook_on_page'
  | 'opening_exposition_soft'
  | 'wake_inventory_opening'
  | 'opening_pressure_window'
  | 'opening_sell_point'
  | 'opening_soft_collapse'
  | 'capability_sell_late'
  | 'repeat_inventory'
  | 'llm_feel_flat'

/** 新增 L1 三维适用章号（与既有醒炕/压力/卖点门槛解耦） */
export const APPEAL_L1_EXTENDED_MAX_CHAPTER = 8

export const APPEAL_CAPABILITY_SIGNAL_RE =
  /修(?:好|柴油|机器|农具)|柴油机|手艺|账本|识破|对赌|三天内|工分归我|揭穿|算盘|图纸|焊接|电路/

const COLLAPSE_PATTERNS: RegExp[] = [
  /脑子.{0,4}糊/,
  /记忆.{0,6}涌/,
  /一睁眼/,
  /太阳穴.{0,4}跳/,
  /嗓子干/,
  /灌了铅/,
  /乱七八糟/,
  /原主/,
  /穿越/,
  /重生/,
  /怎么一睁眼/,
]

const COUNTER_PATTERNS: RegExp[] = [
  /撕/,
  /拒签/,
  /不签/,
  /滚/,
  /拿来/,
  /账本/,
  /我自己还/,
  /嗤笑/,
  /对赌/,
  /三天/,
  /修好/,
]

const REPEAT_CLUSTERS: Array<{ name: string; re: RegExp }> = [
  { name: '契纸', re: /让房契|欠条|那张纸|按手印/g },
  { name: '骂名', re: /懒汉|二流子|打老婆|烂泥/g },
  { name: '怯弟妹', re: /怯怯|像看一头|挤在炕|三个孩子/g },
  { name: '家底瘫瞎', re: /爹瘫|娘瞎|工分债|正屋三间/g },
]

export type AppealDimVerdict = {
  code: AppealDimCode
  level: DramaGateLevel | 'soft'
  passed: boolean
  message: string
}

export type CommercialAppealAudit = {
  /** 固定层名：与 continuity 区分 */
  layer: 'appeal'
  passed: boolean
  summary: string
  dimensions: AppealDimVerdict[]
  checked_at: string
}

const EXPO_DENSE_RE =
  /没有系统|没有异能|没有功法|生存阶梯|成分不好这四个字|温饱线|隐形富豪|前世走了/

/** 去空白后的按字正文 */
export function appealNormalizedBody(content: string): string {
  return [...(content || '').replace(/\s+/g, '')].join('')
}

/** 开篇约前 N 字（按字计，去空白） */
export function appealOpeningHead(content: string, maxChars: number): string {
  return appealNormalizedBody(content).slice(0, maxChars)
}

/** 去空白下标 [start, end) 窗口 */
export function appealCharWindow(content: string, start: number, end: number): string {
  return appealNormalizedBody(content).slice(Math.max(0, start), Math.max(0, end))
}

/** 是否已有外部压力对白/对峙动作（结构启发式） */
export function hasOpeningExternalPressure(head: string): boolean {
  return (
    /[“「"][^”」"]{0,48}(?:催|欠|还钱|收走|搬走|点名|滚|赔|工分|懒汉|二流子)/.test(head)
    || /(?:二叔|队长|债主|会计|叔伯|婆婆|岳母|岳父).{0,20}(?:来|上门|闯|吼|骂|催|踹|推|拍)/.test(head)
    || /一把扯|一脚踹|欠条甩|拍在桌上|踹开门|闯进来/.test(head)
  )
}

/** 开篇窗口是否见到卖点冲突物（债额/夺产/骂名等结构物） */
export function hasOpeningSellStake(head: string): boolean {
  return (
    /\d+\s*(?:块|元|工分)/.test(head)
    || /(?:半间|东屋|灶房|宅子|房子|房产).{0,12}(?:占|收|抢|夺|搬|要)/.test(head)
    || /[“「"][^”」"]{0,24}(?:懒汉|二流子|废物|欠债|滚)/.test(head)
    || /巨债|夺产|烂名声|身份错位|大辱/.test(head)
  )
}

/** 开篇窗口说明文密度软信号（题材无关结构启发式） */
export function detectAppealOpeningExpositionSoft(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber > 1) return null
  if (listOpeningAppealHardFails(content, chapterNumber).length) return null
  const head = appealOpeningHead(content, 400)
  if (head.length < 80) return null
  const hasDialogue = /[“「"]/.test(head)
  const expoHits = (head.match(new RegExp(EXPO_DENSE_RE.source, 'g')) || []).length
  if (expoHits >= 3) {
    return '开篇夹带过多说明/元叙述，宜删减（吸引力软提示）'
  }
  if (!hasDialogue && expoHits >= 2) {
    return '开篇偏说明/盘点，缺少对白或冲突动作切入（吸引力软提示）'
  }
  if (!hasDialogue && /确认着一个事实|回到了\d{4}年|喉头滚了一下/.test(head) && expoHits >= 1) {
    return '开篇以确认设定为主，建议改为冲突或对白开场（吸引力软提示）'
  }
  return null
}

/**
 * 醒炕/感官苏醒 + 家底盘点开篇（第1～3章）。
 * 有外部压力对白/上门对峙时不拦。
 */
export function detectAppealWakeInventoryOpening(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber > 3) return null
  const head = appealOpeningHead(content, 600)
  if (head.length < 120) return null

  const wakeScore = [
    /猛一睁眼|一睁眼就|冻醒|雪沫子|可算醒了|烧了一宿/,
    /实验室|示波器|电路图|记忆碎片|一帧一帧/,
    /鼻腔里灌满|胳膊却沉得像|灌了铅|脑子里嗡嗡/,
  ].filter((r) => r.test(head)).length

  const inventoryScore = [
    /空米缸|房梁|土墙|漏风|草席|干辣椒/,
    /欠.{0,8}(?:债|工分)|工分债|一粒米/,
    /家徒四壁|破棉袄|补丁/,
  ].filter((r) => r.test(head)).length

  const pressure = hasOpeningExternalPressure(head)
  if (wakeScore >= 2 && inventoryScore >= 1 && !pressure) {
    return '开篇为醒炕/感官苏醒+家底盘点，缺少外部对峙冲突（须改写开篇）'
  }
  if (wakeScore >= 2 && !pressure && head.length >= 400) {
    return '开篇长段苏醒/记忆灌入，未先落外部冲突对白或动作（须改写开篇）'
  }
  return null
}

/** 第1～5章：开篇约前300字须有压力方对白/对峙动作 */
export function detectAppealOpeningPressureWindow(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber > 5) return null
  const head = appealOpeningHead(content, 320)
  if (head.length < 80) return null
  if (hasOpeningExternalPressure(head)) return null
  return '开篇约前300字未出现压力方对白或对峙动作（须先落催债/夺产/点名等）'
}

/** 第1～5章：开篇约前500字须见卖点冲突物（债额/夺产/骂名等） */
export function detectAppealOpeningSellPoint(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber > 5) return null
  const head = appealOpeningHead(content, 500)
  if (head.length < 100) return null
  if (hasOpeningSellStake(head)) return null
  return '开篇窗口未见卖点冲突物（债额/夺产/骂名等），卖点不得拖到章中'
}

/**
 * 第1～8章：已有外部压力后，400～900 字窗仍大段糊糊且无反制。
 */
export function detectAppealOpeningSoftCollapse(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber < 1 || chapterNumber > APPEAL_L1_EXTENDED_MAX_CHAPTER) return null
  if (!hasOpeningExternalPressure(appealOpeningHead(content, 400))) return null
  const win = appealCharWindow(content, 400, 900)
  if (win.length < 80) return null
  const collapseHits = COLLAPSE_PATTERNS.filter((r) => r.test(win)).length
  const counterHits = COUNTER_PATTERNS.filter((r) => r.test(win)).length
  if (collapseHits >= 2 && counterHits === 0) {
    return '开篇已有外部压力，但随后长段苏醒/记忆糊糊且无主角反制（须尽快撕契/拒签/嘴炮）'
  }
  return null
}

/**
 * 第1～8章：已有卖点冲突物时，前800字须亮翻身手段/对赌/识破。
 */
export function detectAppealCapabilitySellLate(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber < 1 || chapterNumber > APPEAL_L1_EXTENDED_MAX_CHAPTER) return null
  if (!hasOpeningSellStake(appealOpeningHead(content, 500))) return null
  const head = appealOpeningHead(content, 800)
  if (head.length < 200) return null
  if (APPEAL_CAPABILITY_SIGNAL_RE.test(head)) return null
  return '开篇约前800字未见翻身手段/对赌/识破（如修机、账本、手艺），卖点能力不得拖到章中'
}

/**
 * 第1～8章：契纸/骂名/怯弟妹/家底同簇重复且跨距≥400字。
 */
export function detectAppealRepeatInventory(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber < 1 || chapterNumber > APPEAL_L1_EXTENDED_MAX_CHAPTER) return null
  const body = appealNormalizedBody(content)
  if (body.length < 500) return null
  for (const cluster of REPEAT_CLUSTERS) {
    const re = new RegExp(cluster.re.source, 'g')
    const idxs: number[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      idxs.push(m.index)
      if (m[0].length === 0) re.lastIndex += 1
    }
    if (idxs.length >= 2 && idxs[idxs.length - 1]! - idxs[0]! >= 400) {
      return `同章「${cluster.name}」信息重复盘点（须只落地一次）`
    }
  }
  return null
}

export type OpeningAppealHardFail = {
  code: Exclude<AppealDimCode, 'opening_promise' | 'hook_on_page' | 'opening_exposition_soft' | 'llm_feel_flat'>
  message: string
}

/** 开篇硬失败列表（既有门槛 + 第1～8章扩展三维） */
export function listOpeningAppealHardFails(
  content: string,
  chapterNumber = 1,
): OpeningAppealHardFail[] {
  const out: OpeningAppealHardFail[] = []
  const wake = detectAppealWakeInventoryOpening(content, chapterNumber)
  if (wake) out.push({ code: 'wake_inventory_opening', message: wake })
  const pressure = detectAppealOpeningPressureWindow(content, chapterNumber)
  if (pressure) out.push({ code: 'opening_pressure_window', message: pressure })
  const sell = detectAppealOpeningSellPoint(content, chapterNumber)
  if (sell) out.push({ code: 'opening_sell_point', message: sell })
  const softCollapse = detectAppealOpeningSoftCollapse(content, chapterNumber)
  if (softCollapse) out.push({ code: 'opening_soft_collapse', message: softCollapse })
  const capLate = detectAppealCapabilitySellLate(content, chapterNumber)
  if (capLate) out.push({ code: 'capability_sell_late', message: capLate })
  const repeat = detectAppealRepeatInventory(content, chapterNumber)
  if (repeat) out.push({ code: 'repeat_inventory', message: repeat })
  return out
}

function gateMsg(code: 'opening_promise' | 'hook_on_page', g?: DramaGateEntry): string {
  if (code === 'opening_promise') {
    if (g?.level === '无') return g.note || '开篇约前300～800字缺少本章看点/冲突或对白承诺'
    if (g?.level === '弱') return g.note || '开篇承诺偏弱'
    return g?.note || '开篇承诺已落地'
  }
  if (g?.level === '无') return g.note || '章尾缺少未决具体事件钩'
  if (g?.level === '弱') return g.note || '章尾钩偏弱'
  return g?.note || '章尾钩已落地'
}

/**
 * 从章节质量审的 drama_gates 投影吸引力审（不调用 LLM）。
 * opening 硬失败 / hook「无」/ L2 flat → 吸引力未通过。
 */
export function buildCommercialAppealAudit(args: {
  craft: Pick<ChapterCraftResult, 'drama_gates' | 'checked_at'>
  content?: string
  chapterNumber?: number
  /** L2 观感结果；仅 flat===true 记硬失败维 */
  feel?: {
    flat: boolean
    mid_cooling?: boolean
    missing_payoff?: string
    fix_directive?: string
  } | null
}): CommercialAppealAudit {
  const gates = args.craft.drama_gates || {}
  const chapterNumber = args.chapterNumber ?? 1
  const hardOpens = args.content
    ? listOpeningAppealHardFails(args.content, chapterNumber)
    : []
  const opening = gates.opening_promise
  const feelFlat = args.feel?.flat === true
  const openingLevel: DramaGateLevel = (hardOpens.length || feelFlat || opening?.level === '无')
    ? '无'
    : (opening?.level || '无')
  const openingMsg = hardOpens[0]?.message
    || (feelFlat
      ? (args.feel?.fix_directive || args.feel?.missing_payoff || opening?.note || '观感审：开篇/中段平淡')
      : gateMsg('opening_promise', opening))

  const hook = gates.hook_on_page
  const dims: AppealDimVerdict[] = [
    {
      code: 'opening_promise',
      level: openingLevel,
      passed: openingLevel === '有' || openingLevel === '弱',
      message: openingMsg,
    },
    {
      code: 'hook_on_page',
      level: hook?.level || '无',
      passed: hook?.level === '有' || hook?.level === '弱',
      message: gateMsg('hook_on_page', hook),
    },
  ]

  for (const h of hardOpens) {
    dims.push({
      code: h.code,
      level: '无',
      passed: false,
      message: h.message,
    })
  }

  if (feelFlat) {
    dims.push({
      code: 'llm_feel_flat',
      level: '无',
      passed: false,
      message: args.feel?.fix_directive
        || args.feel?.missing_payoff
        || '观感审：开篇/中段平淡',
    })
  } else if (args.feel && args.feel.mid_cooling) {
    dims.push({
      code: 'llm_feel_flat',
      level: 'soft',
      passed: true,
      message: args.feel.missing_payoff || '观感审：中段偏降温（软提示）',
    })
  }

  const soft = args.content && !hardOpens.length && !feelFlat
    ? detectAppealOpeningExpositionSoft(args.content, chapterNumber)
    : null
  if (soft) {
    dims.push({
      code: 'opening_exposition_soft',
      level: 'soft',
      passed: true,
      message: soft,
    })
  }

  const hardFail = dims.some((d) => d.level === '无')
  const summary = hardFail
    ? dims.filter((d) => !d.passed).map((d) => d.message).join('；')
    : soft
      ? `吸引力基本达标（软提示：${soft}）`
      : '吸引力审通过：开篇对峙、卖点首屏与章尾钩已落地'

  return {
    layer: 'appeal',
    passed: !hardFail,
    summary,
    dimensions: dims,
    checked_at: args.craft.checked_at || new Date().toISOString(),
  }
}
