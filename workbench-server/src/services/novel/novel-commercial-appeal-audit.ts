/**
 * 吸引力审（与 21 维 continuity 解耦）
 * - 醒炕盘点 / 开篇无压力对峙 / 卖点首屏缺失 → 硬判「无」，触发 craft 修写
 * - 禁止写入 continuity_check / buildHardRejectContinuityCheck
 */
import type { DramaGateEntry, DramaGateLevel, ChapterCraftResult } from './novel-chapter-craft-check.js'
import { detectAppealShuangIsomorph as detectAppealShuangIsomorphImpl } from './novel-commercial-appeal-isomorph.js'
import {
  detectStakesMismatchText,
  extractActiveDemandAmounts,
  extractCommonSenseAnchorAmount,
  evaluateStakesCommonSense,
  STAKES_COMMON_SENSE_MIN_MULTIPLIER,
} from './novel-stakes-common-sense.js'

export {
  detectStakesMismatchText,
  extractActiveDemandAmounts,
  extractCommonSenseAnchorAmount,
  evaluateStakesCommonSense,
  STAKES_COMMON_SENSE_MIN_MULTIPLIER,
}

export type AppealDimCode =
  | 'opening_promise'
  | 'hook_on_page'
  | 'opening_exposition_soft'
  | 'wake_inventory_opening'
  | 'opening_pressure_window'
  | 'opening_sell_point'
  | 'opening_soft_collapse'
  | 'hate_thin_decompress'
  | 'capability_sell_late'
  | 'repeat_inventory'
  | 'emotion_beats_missing'
  | 'emotion_beats_order'
  | 'post_climax_decompress'
  | 'hate_late'
  | 'pre_hate_inventory'
  | 'shuang_gap'
  | 'mid_monologue'
  | 'ji_pan_gap'
  | 'post_hook_dump'
  | 'stakes_mismatch'
  | 'soft_ending_dump'
  | 'shuang_isomorph'
  | 'llm_feel_flat'

/** 新增 L1 三维适用章号（与既有醒炕/压力/卖点门槛解耦） */
export const APPEAL_L1_EXTENDED_MAX_CHAPTER = 8

/** 节奏表常量（去空白按字） */
export const APPEAL_HATE_MAX = 120
export const APPEAL_SHUANG_GAP_MAX = 280
export const APPEAL_JI_PAN_GAP_MAX = 200
export const APPEAL_TAIL_WINDOW = 200
export const APPEAL_DUMP_MIN = 80

const WAKE_OPENING_PATTERNS: RegExp[] = [
  /猛一睁眼|一睁眼就|冻醒|雪沫子|可算醒了|烧了一宿/,
  /实验室|示波器|电路图|记忆碎片|一帧一帧/,
  /鼻腔里灌满|胳膊却沉得像|灌了铅|脑子里嗡嗡/,
]

const INVENTORY_OPENING_PATTERNS: RegExp[] = [
  /空米缸|房梁|土墙|漏风|草席|干辣椒/,
  /欠.{0,8}(?:债|工分)|工分债|一粒米/,
  /家徒四壁|破棉袄|补丁/,
]

/** 工序/缺件/拧螺丝等章尾泄压（与 DECOMPRESS_RE 叠加） */
const DUMP_PROCESS_RE =
  /拧螺丝|抠锈|缺件|缺油管|缺垫片|缺轴承|缺密封|缺扳手|缺棉纱|缺火花塞|缺垫圈|零件清单|工序|油管|垫片|拆开|锈屑/

export const APPEAL_CAPABILITY_SIGNAL_RE =
  /修(?:好|柴油|机器|农具)|柴油机|手艺|账本|识破|对赌|(?:[一二两三四五六七八九十半]|[0-9]{1,2})天内|工分归我|揭穿|算盘|图纸|焊接|电路/

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
  /(?:[一二两三四五六七八九十半]|[0-9]{1,2})天/,
  /修好/,
]

const REPEAT_CLUSTERS: Array<{ name: string; re: RegExp }> = [
  { name: '契纸', re: /让房契|欠条|那张纸|按手印/g },
  { name: '骂名', re: /懒汉|二流子|打老婆|烂泥/g },
  { name: '怯弟妹', re: /怯怯|像看一头|挤在炕|三个孩子/g },
  { name: '家底瘫瞎', re: /爹瘫|娘瞎|工分债|正屋三间/g },
]

/** 读者情绪四拍（题材无关结构启发式；催债/修机等仅为示例词） */
const HATE_BEAT_RE =
  /催|欠|还钱|收走|搬走|点名|滚|赔|工分|懒汉|二流子|抵|让房|夺|霸|羞辱|滚蛋|卷铺盖|踹门|闯进来|拍在|追杀|陷害|逼|威胁|嘲讽|驱逐|跪|废了|踩|扇|吐口水|当众/
/** 含猛烈早·动作亮牌 / 认期限后亮牌 / 揽活反制（非仅撕契词表） */
const SHUANG_BEAT_RE =
  /撕|拒签|不签|不抵|我不抵|揭穿|识破|嗤笑|滚回|门儿都没有|账本呢|对不上|趁火打劫|反杀|怼回|甩脸|当场驳|一巴掌|不认|我不认|假的|认了|这账我|账我认|三天就三天|揽下|揽了|这活我|活我来|我来修|拍(?:在|到)炕|账本拍|拍出|亮出|老账|翻翻清楚/
/** 含日历死线（初十/腊月等），不限「N天」字面 */
const JI_BEAT_RE =
  /(?:[一二两三四五六七八九十半百]|[0-9]{1,2})天|五日|七日|旬|半月|月底|期限|对赌|之内还|明天|后日|时辰|限你|数到|倒计时|来收|日落前|天亮前|最后一次|再不|大会前|开春前|过年前|初[一二三四五六七八九十]|腊月|正月|来收契|收契|再来收/
const PAN_BEAT_RE =
  /修(?:好|柴油|机器|农具)|柴油机|手艺|账本|识破|对赌|工分归我|揭穿|算盘|图纸|焊接|电路|我能|拿手|功法|秘籍|证据|系统|灵根|配方|我修|我懂|看破|锈铁|水泵|站稳/
const DECOMPRESS_RE =
  /烧火|糊糊|掖了掖被|滚出.{0,4}泪|给你熬|蹲在灶|摸索着往灶|那是家|心里暖|眼眶湿|抱着哭/

function firstMatchIndex(body: string, re: RegExp): number {
  const m = body.match(re)
  return m?.index ?? -1
}

/** 在 [start, end) 内首次命中；无则 -1 */
export function firstMatchInRange(
  body: string,
  re: RegExp,
  start: number,
  end: number,
): number {
  const s = Math.max(0, start)
  const e = Math.max(s, end)
  const slice = body.slice(s, e)
  const m = slice.match(re)
  return m?.index != null ? s + m.index : -1
}

export type AppealBeatLoc = {
  body: string
  hateIdx: number
  shuangIdx: number
  jiIdx: number
  panIdx: number
}

/**
 * 共用拍定位（emotion + 节奏表）。
 * 急/盼以「恨后、优先爽后」首次为准，避免恨场顺带「三天/柴油机」抢拍导致顺序误杀。
 */
export function locateAppealEmotionBeats(content: string): AppealBeatLoc {
  const body = appealNormalizedBody(content)
  const hateIdx = firstMatchIndex(body, HATE_BEAT_RE)
  const shuangIdx = firstMatchIndex(body, SHUANG_BEAT_RE)
  const searchFrom = shuangIdx >= 0 ? shuangIdx : (hateIdx >= 0 ? hateIdx : 0)
  const jiIdx = firstMatchInRange(body, JI_BEAT_RE, searchFrom, body.length)
  const panIdx = firstMatchInRange(body, PAN_BEAT_RE, searchFrom, body.length)
  return {
    body,
    hateIdx,
    shuangIdx,
    jiIdx,
    panIdx,
  }
}

function inAppealExtendedChapter(chapterNumber: number): boolean {
  return chapterNumber >= 1 && chapterNumber <= APPEAL_L1_EXTENDED_MAX_CHAPTER
}

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

  const wakeScore = WAKE_OPENING_PATTERNS.filter((r) => r.test(head)).length

  const inventoryScore = INVENTORY_OPENING_PATTERNS.filter((r) => r.test(head)).length

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
 * 恨场偏虚（题材无关结构）：有外部压力起势，但前约200字未亮可见代价，
 * 且切感官苏醒/环境泄压。有金额/期限/夺产/职位/婚约等赌注则不拦。
 */
export function detectAppealHateThinDecompress(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber > 3) return null
  const head = appealOpeningHead(content, 220)
  if (head.length < 60) return null
  const thinKick =
    /开门|装死|踹得砰砰|门板被踹|一脚踹|闯进来|拍门|砸门/.test(head)
    || hasOpeningExternalPressure(head)
  if (!thinKick) return null
  // 可见代价：数额/期限/物权/身份职级/契约婚约/修真资源等结构信号（非单一年代词表）
  const hasStake =
    /\d+\s*(?:块|元|万|亿|工分|灵石|贡献点)/.test(head)
    || /(?:房|宅|屋|院|铺|店|股份|职位|名额|婚约|灵根|丹方).{0,12}(?:占|收|抢|夺|搬|要|撵|废|退|取消|剥夺)/.test(head)
    || /[“「"][^”」"]{0,48}(?:滚出去|给我滚|欠|还钱|还债|还账|收走|搬走|撵出去|签字|离婚|退婚|开除|停职|除名|废掉|交出来|三天|限期)/.test(head)
    || /巨债|夺产|工分债|烂名声|净身出户|解除婚约|逐出师门/.test(head)
  if (hasStake) return null
  const decompressHits = [
    /一下睁了眼|猛一睁眼|一睁眼|睁开眼/,
    /房梁|土炕|被絮|墙缝|天花板|窗帘|被窝/,
    /北风|冷风|刀子似|刮脸|刺骨|阳光刺/,
  ].filter((r) => r.test(head)).length
  if (decompressHits < 2) return null
  return '开篇压迫偏虚（有起势无可见代价）且切感官/环境泄压；须当场亮谁要什么并续对峙'
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

/**
 * 第1～8章：读者情绪四拍恨→爽→急→盼（题材无关；每拍须可见，且顺序大致递增）。
 */
export function detectAppealEmotionBeats(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber < 1 || chapterNumber > APPEAL_L1_EXTENDED_MAX_CHAPTER) return null
  const { body, hateIdx: hate, shuangIdx: shuang, jiIdx: ji, panIdx: pan } =
    locateAppealEmotionBeats(content)
  if (body.length < 400) return null
  const missing: string[] = []
  if (hate < 0) missing.push('恨')
  if (shuang < 0) missing.push('爽')
  if (ji < 0) missing.push('急')
  if (pan < 0) missing.push('盼')
  if (missing.length) {
    return `缺少读者情绪拍【${missing.join('、')}】（须按恨→爽→急→盼各落地一次：欺压→硬刚打脸→期限对赌→本事结论）`
  }
  // 顺序：恨 < 爽 < min(急,盼) 可接受急盼互换，但须都在爽之后
  if (!(hate < shuang && shuang < ji && shuang < pan)) {
    return '情绪四拍顺序异常：须先恨（欺压）再爽（打脸）再急/盼（期限与本事）；禁止先温情/先穿越再补恨'
  }
  return null
}

/** 恨过晚或缺失（>120） */
export function detectAppealHateLate(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const { hateIdx } = locateAppealEmotionBeats(content)
  if (hateIdx < 0 || hateIdx > APPEAL_HATE_MAX) {
    return `恨拍过晚或缺失（须≤${APPEAL_HATE_MAX}字内出现欺压对白/踹门类动作）`
  }
  return null
}

/** 恨前醒炕/穷困盘点（≥2 条 wake/inventory 命中） */
export function detectAppealPreHateInventory(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const { body, hateIdx } = locateAppealEmotionBeats(content)
  if (hateIdx <= 0) return null
  const prefix = body.slice(0, hateIdx)
  if (prefix.length < 40) return null
  const hits = [...WAKE_OPENING_PATTERNS, ...INVENTORY_OPENING_PATTERNS]
    .filter((r) => r.test(prefix)).length
  if (hits >= 2) {
    return '恨拍之前先做醒炕/穷困盘点（须删前缀，开篇即压迫）'
  }
  return null
}

/** 恨→爽间距过大或爽缺失 */
export function detectAppealShuangGap(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const { hateIdx, shuangIdx } = locateAppealEmotionBeats(content)
  if (hateIdx < 0) return null
  if (shuangIdx < 0 || shuangIdx - hateIdx > APPEAL_SHUANG_GAP_MAX) {
    return `爽拍过晚或缺失（须在恨后≤${APPEAL_SHUANG_GAP_MAX}字内硬刚打脸）`
  }
  return null
}

/** 恨→爽缝大段浆糊/记忆且无反制 */
export function detectAppealMidMonologue(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const { body, hateIdx, shuangIdx } = locateAppealEmotionBeats(content)
  if (hateIdx < 0) return null
  const winEnd = shuangIdx >= 0
    ? shuangIdx
    : Math.min(body.length, hateIdx + APPEAL_SHUANG_GAP_MAX)
  if (winEnd <= hateIdx + 1) return null
  const win = body.slice(hateIdx + 1, winEnd)
  if (win.length < 40) return null
  const collapseHits = COLLAPSE_PATTERNS.filter((r) => r.test(win)).length
  const counterHits = COUNTER_PATTERNS.filter((r) => r.test(win)).length
  if (collapseHits >= 2 && counterHits === 0) {
    return '恨→爽缝为大段记忆/浆糊独白且无反制（须删缝，恨后尽快硬刚）'
  }
  return null
}

/** 爽后 200 字窗内急+盼须同时出现 */
export function detectAppealJiPanGap(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const { body, shuangIdx } = locateAppealEmotionBeats(content)
  if (shuangIdx < 0) return null
  const winEnd = shuangIdx + APPEAL_JI_PAN_GAP_MAX
  const jiIn = firstMatchInRange(body, JI_BEAT_RE, shuangIdx, winEnd)
  const panIn = firstMatchInRange(body, PAN_BEAT_RE, shuangIdx, winEnd)
  if (jiIn < 0 || panIn < 0) {
    return `急/盼开篇宣告过晚（须在爽后≤${APPEAL_JI_PAN_GAP_MAX}字内同时出现期限+本事）`
  }
  return null
}

/** 急盼已现后，章尾最后 200 字工序/缺件/温情泄压且跨度>80 */
export function detectAppealPostHookDump(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const { body, jiIdx, panIdx } = locateAppealEmotionBeats(content)
  if (jiIdx < 0 || panIdx < 0) return null
  const tailStart = Math.max(0, body.length - APPEAL_TAIL_WINDOW)
  const tail = body.slice(tailStart)
  const dumpRe = new RegExp(
    `(?:${DUMP_PROCESS_RE.source})|(?:${DECOMPRESS_RE.source})`,
  )
  const dumpIdx = firstMatchIndex(tail, dumpRe)
  if (dumpIdx < 0) return null
  const span = tail.length - dumpIdx
  if (span > APPEAL_DUMP_MIN) {
    return '章尾工序/缺件/温情泄压过长（最后200字禁说明书式收束，须停急/盼钩）'
  }
  return null
}

/** 中文债额粗解析（三/三十/一百二十） */
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
  return null
}

/** 抽出正文/大纲中的债额数字 */
export function extractDebtAmounts(text: string): number[] {
  const body = (text || '').replace(/\s+/g, '')
  const out: number[] = []
  for (const m of body.matchAll(/(\d{1,6})(?:块|元|工分)/g)) {
    out.push(Number(m[1]))
  }
  for (const m of body.matchAll(/([一二两三四五六七八九十百零廿几]+(?:来)?)(?:块|元|钱|工分)/g)) {
    const n = cnDebtTokenToNumber(m[1]!)
    if (n != null) out.push(n)
  }
  return out
}

/** 恨场压迫标尺：常识锚×20（见 novel-stakes-common-sense） */
export function detectAppealStakesMismatch(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const body = appealNormalizedBody(content)
  if (body.length < 200) return null
  return detectStakesMismatchText(body)
}

/** 章尾软收束：没准谱/心里没底等泄压 */
const SOFT_ENDING_RE =
  /心里.{0,8}(?:没|没有).{0,6}(?:准谱|底|数)|还没个准谱|没个准谱|走着瞧|以后再说|先这样吧|日子还长|走一步看一步|心里其实还/

export function detectAppealSoftEndingDump(
  content: string,
  chapterNumber = 1,
): string | null {
  if (!inAppealExtendedChapter(chapterNumber)) return null
  const body = appealNormalizedBody(content)
  if (body.length < 200) return null
  const tail = body.slice(Math.max(0, body.length - 160))
  if (!SOFT_ENDING_RE.test(tail)) return null
  return '章尾软收束泄压（没准谱/心里没底/走着瞧等），须停在未决急/盼具体事件钩上'
}

/** 第2～8章：与上章爽型同构（实现见 novel-commercial-appeal-isomorph.ts） */
export function detectAppealShuangIsomorph(
  content: string,
  chapterNumber = 1,
  priorContent?: string,
): string | null {
  return detectAppealShuangIsomorphImpl(content, chapterNumber, priorContent)
}

/**
 * 第1～8章：打脸/对赌高潮后禁止温情泄压收束（烧火/糊糊/哭泪当章尾）。
 */
export function detectAppealPostClimaxDecompress(
  content: string,
  chapterNumber = 1,
): string | null {
  if (chapterNumber < 1 || chapterNumber > APPEAL_L1_EXTENDED_MAX_CHAPTER) return null
  const body = appealNormalizedBody(content)
  const climax = Math.max(
    firstMatchIndex(body, /撕|拒签|不抵|门儿都没有/),
    firstMatchIndex(body, JI_BEAT_RE),
    firstMatchIndex(body, PAN_BEAT_RE),
  )
  if (climax < 0) return null
  const tail = body.slice(Math.max(0, body.length - 500))
  if (!DECOMPRESS_RE.test(tail)) return null
  // 泄压出现在高潮之后且落在文末窗口
  const decIdx = firstMatchIndex(body, DECOMPRESS_RE)
  if (decIdx > climax && decIdx > body.length - 600) {
    return '打脸/对赌后用温情泄压收束（烧火/糊糊/哭泪等），须改为停在未决急/盼钩上'
  }
  return null
}

export type OpeningAppealHardFail = {
  code: Exclude<AppealDimCode, 'opening_promise' | 'hook_on_page' | 'opening_exposition_soft' | 'llm_feel_flat'>
  message: string
}

/**
 * 开篇硬失败列表。
 *
 * 恨→爽→急→盼是语义场：禁止用词表首击/字距硬拦（会把「拍在炕」当爽、「腊月」当急，
 * 与 craft 语义审打架并空转重写×3）。四拍有无交给 craft / 生成注入；硬拦只留字面可验结构。
 *
 * 仍导出 detectAppealHateLate / ShuangGap / … 供诊断与冒烟，但不进入本列表。
 */
export function listOpeningAppealHardFails(
  content: string,
  chapterNumber = 1,
  priorChapterContent?: string,
): OpeningAppealHardFail[] {
  const out: OpeningAppealHardFail[] = []

  const postDump = detectAppealPostHookDump(content, chapterNumber)
  if (postDump) out.push({ code: 'post_hook_dump', message: postDump })
  const stakes = detectAppealStakesMismatch(content, chapterNumber)
  if (stakes) out.push({ code: 'stakes_mismatch', message: stakes })
  const softEnd = detectAppealSoftEndingDump(content, chapterNumber)
  if (softEnd) out.push({ code: 'soft_ending_dump', message: softEnd })

  const isomorph = detectAppealShuangIsomorph(content, chapterNumber, priorChapterContent)
  if (isomorph) out.push({ code: 'shuang_isomorph', message: isomorph })

  const wake = detectAppealWakeInventoryOpening(content, chapterNumber)
  if (wake) out.push({ code: 'wake_inventory_opening', message: wake })
  const pressure = detectAppealOpeningPressureWindow(content, chapterNumber)
  if (pressure) out.push({ code: 'opening_pressure_window', message: pressure })
  const sell = detectAppealOpeningSellPoint(content, chapterNumber)
  if (sell) out.push({ code: 'opening_sell_point', message: sell })
  const hateThin = detectAppealHateThinDecompress(content, chapterNumber)
  if (hateThin) out.push({ code: 'hate_thin_decompress', message: hateThin })
  const softCollapse = detectAppealOpeningSoftCollapse(content, chapterNumber)
  if (softCollapse) out.push({ code: 'opening_soft_collapse', message: softCollapse })
  // repeat_inventory：骂名/契纸在对峙章常多次出现（大纲也要求骂名声对撞），词距硬拦会误杀 → 仅软提示
  const decompress = detectAppealPostClimaxDecompress(content, chapterNumber)
  if (decompress) out.push({ code: 'post_climax_decompress', message: decompress })
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
  /** 上章正文（同构对比；缺则跳过同构维） */
  priorChapterContent?: string
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
    ? listOpeningAppealHardFails(args.content, chapterNumber, args.priorChapterContent)
    : []
  const opening = gates.opening_promise
  const feelFlat = args.feel?.flat === true
  const openingLevel: DramaGateLevel = (hardOpens.length || feelFlat || opening?.level === '无')
    ? '无'
    : (opening?.level || '无')
  const openingMsg = hardOpens.length
    ? hardOpens
      .slice(0, 2)
      .map((h) => (h.message.length > 80 ? `${h.message.slice(0, 80)}…` : h.message))
      .join('；')
    : (feelFlat
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

  const repeatSoft = args.content && !feelFlat
    ? detectAppealRepeatInventory(args.content, chapterNumber)
    : null
  if (repeatSoft) {
    dims.push({
      code: 'repeat_inventory',
      level: 'soft',
      passed: true,
      message: repeatSoft,
    })
  }

  const hardFail = dims.some((d) => d.level === '无')
  const summary = hardFail
    ? dims.filter((d) => !d.passed).map((d) => d.message).join('；')
    : [soft, repeatSoft].filter(Boolean).length
      ? `吸引力基本达标（软提示：${[soft, repeatSoft].filter(Boolean).join('；')}）`
      : '吸引力审通过：开篇对峙、卖点首屏与章尾钩已落地'

  return {
    layer: 'appeal',
    passed: !hardFail,
    summary,
    dimensions: dims,
    checked_at: args.craft.checked_at || new Date().toISOString(),
  }
}
