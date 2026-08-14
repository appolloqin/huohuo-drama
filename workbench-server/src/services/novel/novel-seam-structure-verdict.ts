/**
 * 章缝结构判定卡（审校/硬审权威）
 * @see docs/superpowers/specs/2026-08-12-seam-structure-verdict-design.md
 */
import type { ChapterEndSnapshot } from '../../common/novel/novel-continuity-state.js'
import {
  classifyPlaceCategory,
  guessPlaceLabel,
  normalizePlaceKey,
  type PlaceCategory,
} from './novel-chapter-end-snapshot.js'

export type SeamBridgeKind =
  | 'none'
  | 'cross_day_or_gap'
  | 'leave_or_move'
  | 'flashback_frame'
  | 'en_route'

export type SeamPlaceContinuity = 'same' | 'bridged' | 'jump'

export type SeamStructureVerdict = {
  prev_place: string
  open_place: string
  prev_place_cat: PlaceCategory
  open_place_cat: PlaceCategory
  bridge: SeamBridgeKind
  place_continuity: SeamPlaceContinuity
  visitor_from_outline: 'yes' | 'no' | 'n/a'
  summary: string
}

/** 开篇窗口内的场合/时间过渡（结构信号；非题材场面表） */
const FLASHBACK_RE = /回忆|想起|那时候|方才|此前|补叙|闪回/
const CROSS_DAY_RE =
  /次日|翌日|第二天|第二日|隔日|隔夜|数日(?:后|前)?|几天(?:后|前)?|过了几天|过了几日|隔了几天|旬日后|半月后|一月后|一夜过|过了一夜|一觉醒|天亮后|睡到天亮/
const LEAVE_MOVE_RE =
  /离开|出去|出了门|推门出去|动身|启程|迈出|走到|赶往|回到|赶回|返回|到了|抵达/
const EN_ROUTE_RE = /途中|路上/

export const SEAM_BRIDGE_RE = new RegExp(
  `${FLASHBACK_RE.source}|${CROSS_DAY_RE.source}|${LEAVE_MOVE_RE.source}|${EN_ROUTE_RE.source}`,
)

export function openingWindow(content: string, maxChars = 1200): string {
  const t = (content || '').trim()
  return t.slice(0, Math.min(t.length, maxChars))
}

export function classifySeamBridgeKind(content: string, maxChars = 1200): SeamBridgeKind {
  const opening = openingWindow(content, maxChars).replace(/\s+/g, '')
  if (!opening) return 'none'
  if (FLASHBACK_RE.test(opening)) return 'flashback_frame'
  if (CROSS_DAY_RE.test(opening)) return 'cross_day_or_gap'
  if (LEAVE_MOVE_RE.test(opening)) return 'leave_or_move'
  if (EN_ROUTE_RE.test(opening)) return 'en_route'
  return 'none'
}

export function hasSeamBridge(content: string, maxChars = 1200): boolean {
  return classifySeamBridgeKind(content, maxChars) !== 'none'
}

const BRIDGE_LABEL: Record<SeamBridgeKind, string> = {
  none: '无',
  cross_day_or_gap: '跨日/隔日',
  leave_or_move: '离场/位移',
  flashback_frame: '补叙/回忆框',
  en_route: '途中承接',
}

const STOP_NAME = new Set([
  '但是', '然后', '因为', '所以', '已经', '什么', '这个', '那个', '自己', '他们', '我们', '你们',
  '一个', '没有', '不是', '可以', '还是', '只是', '只得', '忽然', '于是', '门外', '外头', '屋里',
  '门口', '炕上', '灶房', '院门', '上午', '下午', '数日', '几天', '次日',
])

/** 大纲/开篇人名候选（结构比对，非角色类型词表） */
export function extractOutlineNameCandidates(text: string, max = 10): string[] {
  // 人称称谓常见 2～3 字；用 4 字会把「刘干事上」粘成一块导致开篇对不上
  const re = /[\u4e00-\u9fff]{2,3}/g
  const counts = new Map<string, number>()
  let m: RegExpExecArray | null
  while ((m = re.exec(text || '')) !== null) {
    const w = m[0]
    if (STOP_NAME.has(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, max)
}

function resolveVisitorFromOutline(opening: string, chapterOutline?: string): 'yes' | 'no' | 'n/a' {
  const outline = (chapterOutline || '').trim()
  if (!outline) return 'n/a'
  const names = extractOutlineNameCandidates(outline, 12)
  if (!names.length) return 'n/a'
  const head = opening.replace(/\s+/g, '')
  const hit = names.filter(n => n.length >= 2 && head.includes(n))
  if (hit.length) return 'yes'
  // 大纲有人名候选但开篇未出现 → no（仅参考，不硬拦）
  return 'no'
}

/**
 * 是否构成「场合跳切条件」（尚不计桥）。与历史 detectSeamPlaceJump 条件对齐。
 */
export function evaluatePlaceJumpCondition(args: {
  content: string
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
}): {
  qualifies: boolean
  prev_place: string
  open_place: string
  prev_place_cat: PlaceCategory
  open_place_cat: PlaceCategory
} | null {
  const tip = (args.prevChapterTail || '').trim().slice(-400)
  const snapPlace = (args.prevSnapshot?.place || '').trim()
  if ((!snapPlace || snapPlace === '未明示') && !tip) return null

  const opening = openingWindow(args.content, 1000)
  if ([...opening].length < 28) return null

  const openHead = opening.slice(0, 520)
  let prevCat = classifyPlaceCategory(snapPlace)
  if (prevCat === 'unknown') prevCat = classifyPlaceCategory(tip)
  const openCat = classifyPlaceCategory(openHead)

  const prevKey = normalizePlaceKey(snapPlace || guessPlaceLabel(tip) || '')
  let openKey = normalizePlaceKey(guessPlaceLabel(openHead) || '')
  if (openCat === 'threshold' || /院门|家门|门口|门外/.test(openHead.replace(/\s+/g, ''))) {
    const doorKey = normalizePlaceKey(openHead)
    if (doorKey === '室外') openKey = '室外'
  }

  const catJump =
    (prevCat === 'enclosed' && openCat === 'away')
    || (prevCat === 'away' && (openCat === 'enclosed' || openCat === 'threshold'))

  const indoorOutdoor =
    !!prevKey && !!openKey && prevKey !== openKey
    && (
      (prevKey === '室内' && openKey === '室外' && openCat === 'away')
      || (prevKey === '室外' && openKey === '室内' && prevCat === 'away')
    )

  const keyJump =
    !!prevKey && !!openKey && prevKey !== openKey
    && prevKey !== '室内' && prevKey !== '室外'
    && (openCat === 'enclosed' || openCat === 'threshold')
    && (prevCat === 'enclosed' || prevCat === 'threshold' || prevCat === 'unknown')

  const qualifies = !!(catJump || indoorOutdoor || keyJump)
  const prev_place = (snapPlace && snapPlace !== '未明示')
    ? snapPlace
    : (prevKey || prevCat || '未明示')
  const open_place = openKey || openCat || '未明示'

  return {
    qualifies,
    prev_place,
    open_place,
    prev_place_cat: prevCat,
    open_place_cat: openCat,
  }
}

export function computeSeamStructureVerdict(args: {
  content: string
  chapterNumber: number
  prevChapterTail?: string
  prevSnapshot?: ChapterEndSnapshot | null
  chapterOutline?: string
}): SeamStructureVerdict | null {
  if (args.chapterNumber < 2) return null

  const bridge = classifySeamBridgeKind(args.content, 1200)
  const cond = evaluatePlaceJumpCondition({
    content: args.content,
    prevChapterTail: args.prevChapterTail,
    prevSnapshot: args.prevSnapshot,
  })

  const opening = openingWindow(args.content, 1200)
  const visitor_from_outline = resolveVisitorFromOutline(opening, args.chapterOutline)

  if (!cond) {
    return {
      prev_place: (args.prevSnapshot?.place || '').trim() || '未明示',
      open_place: '未明示',
      prev_place_cat: classifyPlaceCategory(args.prevSnapshot?.place),
      open_place_cat: 'unknown',
      bridge,
      place_continuity: 'same',
      visitor_from_outline,
      summary: `场合连续：无法判定跳切；过渡桥=${BRIDGE_LABEL[bridge]}；大纲来者=${visitor_from_outline}`,
    }
  }

  let place_continuity: SeamPlaceContinuity = 'same'
  if (cond.qualifies) {
    place_continuity = bridge === 'none' ? 'jump' : 'bridged'
  }

  const summary =
    `上章末「${cond.prev_place}」→开篇「${cond.open_place}」；`
    + `连续=${place_continuity}；桥=${BRIDGE_LABEL[bridge]}；大纲来者=${visitor_from_outline}`

  return {
    prev_place: cond.prev_place,
    open_place: cond.open_place,
    prev_place_cat: cond.prev_place_cat,
    open_place_cat: cond.open_place_cat,
    bridge,
    place_continuity,
    visitor_from_outline,
    summary,
  }
}

export function formatSeamStructureVerdictBlock(v: SeamStructureVerdict): string {
  return [
    '【章缝结构判定｜权威·禁止覆写】',
    `上章末场合：${v.prev_place}（${v.prev_place_cat}）`,
    `本章开篇场合：${v.open_place}（${v.open_place_cat}）`,
    `过渡桥：${v.bridge}`,
    `场合连续：${v.place_continuity}`,
    `大纲来者：${v.visitor_from_outline}`,
    `摘要：${v.summary}`,
    '纪律：时间线/地点/场景/刚发生的「跳切/无过渡」结论必须与「场合连续」一致；'
      + 'same/bridged 禁止判无过渡跳变；仅 jump 可判场合不衔接；'
      + 'visitor_from_outline=yes 时禁止判对应人物无铺垫空降。',
  ].join('\n')
}

/** 模型违纪：卡非 jump 却仍报跳切类 → 对齐剔除 */
export const SEAM_JUMP_CLAIM_RE =
  /跳变|跳切|无过渡|无任何时间过渡|无场景切换|节奏断裂|动作无承接|未承接上章|突然出场|无铺垫即出现|违反在场相位|变化突兀/

export function enforceSeamStructureOnDimensionReport(
  report: {
    complete: boolean
    failCount: number
    dimensions: Array<{ dimension: string; status: 'ok' | 'fail' | 'na'; reason: string; excerpt?: string }>
    overallReason: string
  } | null,
  verdict: SeamStructureVerdict | null,
): typeof report {
  if (!report || !verdict) return report
  if (verdict.place_continuity === 'jump') return report

  let failCount = 0
  const dimensions = report.dimensions.map((d) => {
    if (d.status !== 'fail') return d
    const blob = `${d.reason}${d.excerpt || ''}`
    const jumpDim = /时间线|地点|场景|刚发生|时间节奏|动作逻辑|一致性提醒|本章变化|人物|人际势力/.test(d.dimension)
    if (jumpDim && SEAM_JUMP_CLAIM_RE.test(blob)) {
      return {
        ...d,
        status: 'ok' as const,
        reason: `章缝结构卡 place_continuity=${verdict.place_continuity}，跳切类判定已按卡对齐`,
        excerpt: undefined,
      }
    }
    if (
      verdict.visitor_from_outline === 'yes'
      && (d.dimension === '人物' || d.dimension === '人际势力')
      && /无.*铺垫|突然.*出场|突然在场|无因果.*在场|无任何引入|违反在场相位/.test(blob)
    ) {
      return {
        ...d,
        status: 'ok' as const,
        reason: '结构卡 visitor_from_outline=yes，不以无铺垫空降判人物维',
        excerpt: undefined,
      }
    }
    failCount += 1
    return d
  })

  let overallReason = report.overallReason
  if (failCount === 0 && SEAM_JUMP_CLAIM_RE.test(overallReason)) {
    overallReason = `章缝结构卡 place_continuity=${verdict.place_continuity}；跳切类误判已按卡对齐`
  }

  return { ...report, dimensions, failCount, overallReason }
}

export function enforceSeamStructureOnConflictMessages(
  messages: string[],
  verdict: SeamStructureVerdict | null,
): string[] {
  if (!verdict || verdict.place_continuity === 'jump') {
    // jump 时仍可按 visitor 卡洗空降
    if (!verdict || verdict.visitor_from_outline !== 'yes') return messages
    return messages.filter(m => !/突然.*出场|无铺垫|违反在场相位/.test(m))
  }
  return messages.filter((m) => {
    const t = m.replace(/\s+/g, ' ')
    if (SEAM_JUMP_CLAIM_RE.test(t) && /时间|地点|场景|刚发生|节奏|动作|提醒|本章变化|跳变|跳切|人物|人际/.test(t)) {
      return false
    }
    if (
      verdict.visitor_from_outline === 'yes'
      && /突然.*出场|无铺垫|违反在场相位/.test(t)
    ) {
      return false
    }
    return true
  })
}
