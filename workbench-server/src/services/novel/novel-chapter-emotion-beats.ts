/**
 * 第1～8章：分拍节点绑定恨→爽→急→盼（读者情绪四拍）。
 * 合同主轴：EmotionCoreContract SSOT（题材无关三刀）——见 novel-emotion-core-contract.ts
 * 优先读大纲显式【恨】【爽】【急】【盼】；戏剧标签须同拍共注，禁止因有情绪标签而丢弃。
 */
import { extractTagBlock, sliceOutlineChapterSection } from './novel-outline-drama-fields.js'
import {
  collectLockedMoneyForInfoDelta,
  isInfoDeltaResultStatePoint,
  outlineCatalystCoveredIn,
  splitInfoDeltaPointsForCover,
} from './novel-outline-beat-cover.js'
import { extractOutlineBeatItems, extractOutlineCatalystPhrases } from './novel-chapter-seam.js'
import {
  buildEmotionCorePhaseHardLine,
  buildEmotionCorePhaseHardRule,
  type EmotionCorePhase,
} from './novel-emotion-core-contract.js'

export const EMOTION_BEAT_PHASES = ['恨', '爽', '急', '盼'] as const
export type EmotionBeatPhase = (typeof EMOTION_BEAT_PHASES)[number]

/** 恨略重、爽短响、急短、盼最短 */
export const EMOTION_BEAT_WEIGHTS = [0.38, 0.28, 0.2, 0.14] as const

/** 盼场大纲过长时截成种子，避免过程句压过「短盼」 */
export const EMOTION_PAN_SEED_MAX_CHARS = 72

export function shouldBindEmotionBeats(chapterNumber: number | undefined): boolean {
  const n = Number(chapterNumber)
  return Number.isFinite(n) && n >= 1 && n <= 8
}

export function isEmotionBeatPhase(phase: string | undefined): phase is EmotionBeatPhase {
  return !!phase && (EMOTION_BEAT_PHASES as readonly string[]).includes(phase)
}

/**
 * 注入大纲场文案。盼：只保留短种子；其余相位保留原文（过长时轻截以免撑爆拍卡）。
 */
export function clipEmotionOutlineSeed(
  phase: EmotionBeatPhase,
  raw: string,
  maxChars = phase === '盼' ? EMOTION_PAN_SEED_MAX_CHARS : 160,
): string {
  const t = (raw || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const body = [...t].length <= maxChars
    ? t
    : `${[...t].slice(0, maxChars).join('')}…`
  if (phase === '盼') {
    return `大纲盼场种子（只取缺一环/短复验，禁止展开翻找过程）：${body}`
  }
  return `大纲${phase}场：${body}`
}

/** 戏剧标签共注行（有则注入；过长轻截） */
function dramaFieldLine(label: string, raw: string, maxChars = 140): string {
  const t = (raw || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const body = [...t].length <= maxChars ? t : `${[...t].slice(0, maxChars).join('')}…`
  return `【${label}·须本拍落地】${body}`
}

/** 把【信息增量】拆成要点（按破折号/句读），避免模型只抄引号里半句 */
export function splitInfoDeltaPoints(raw: string, maxPoints = 6): string[] {
  return splitInfoDeltaPointsForCover(raw, maxPoints)
}

function formatInfoDeltaPointLine(point: string, index: number): string {
  const n = index + 1
  if (!isInfoDeltaResultStatePoint(point)) return `${n}. ${point}`
  // 极性提示只引用本条原文结构，不注入题材场面词；禁止「改日再交/另册待办」式拖延句冒充
  return `${n}. ${point} → 本条为结果态：正文须写该结果已发生（已完成），禁止用未完成/旧态/改日再办冒充落地。`
}

/**
 * 【信息增量】须完整落地：内容全部来自本章大纲原文拆条（题材无关、无静态书情）。
 * 若某条自身是结果态动词，另注极性：禁止用未完成态冒充。
 * lockedAmounts：仅本章结果态分条从上下文回收到的金额字面（本章无该条则不注入）。
 */
export function buildInfoDeltaMustLandBlock(
  raw: string,
  lockedAmounts?: string[],
): string {
  const points = splitInfoDeltaPoints(raw)
  if (!points.length) return ''
  const hasResult = points.some(isInfoDeltaResultStatePoint)
  const locked = (lockedAmounts || []).filter(Boolean)
  return [
    '【信息增量·须逐条落地】',
    ...points.map((p, i) => formatInfoDeltaPointLine(p, i)),
    '以上各条均须在正文场面化写出（可内心/对白/规则一句）；禁止只写其中一条；具体名词以本条原文为准。',
    hasResult
      ? '极性硬规：标了结果态的条目，正文须写「已发生」，禁止用尚未/仍欠/还没等旧态冒充落地。'
      : '',
    locked.length
      ? `【已锁定钱数】${locked.join('、')}——与本章结果态条同题的金额须用上述字面，禁止另造。`
      : '',
  ].filter(Boolean).join('\n')
}

/** 从本章信息增量 + 全书/前章上下文回收锁定钱数，供生成/专修注入 */
export function resolveInfoDeltaLockedAmounts(
  infoDelta: string,
  amountContext?: string,
): string[] {
  return collectLockedMoneyForInfoDelta(infoDelta, [infoDelta, amountContext || ''])
}

function tagValForChapter(outline: string, chapterNumber: number, label: string): string {
  const section = sliceOutlineChapterSection(outline, chapterNumber)
  const scope = (section && section.trim()) ? section : outline
  return (extractTagBlock(scope, label) || extractTagBlock(outline, label) || '')
    .trim()
    .replace(/\s+/g, ' ')
}

export type EmotionBeatSpec = {
  phase: EmotionBeatPhase
  /** 写入 ChapterBeatBudgetItem.beat 的本拍任务全文 */
  beat: string
  tag: EmotionBeatPhase
  /** 本拍须落地大纲原文（供写前合同；可与 beat 文案内清单一致） */
  mustLand?: string[]
}

/**
 * 从本章大纲拼出四拍任务。
 * 情绪四拍 + 戏剧标签同拍共注（有【恨】仍须带欲望/阻碍等，禁止互斥丢弃）。
 */
export function buildEmotionBeatSpecs(args: {
  chapterOutline: string
  chapterNumber: number
  prevChapterTail?: string
  /** 全书大纲等：回收信息增量锁定钱数 */
  amountContext?: string
  /** 保留入参兼容；信息增量落地不依赖书名旁路 */
  title?: string
}): EmotionBeatSpec[] {
  const outline = (args.chapterOutline || '').trim()
  const ch = args.chapterNumber
  const prev = args.prevChapterTail || ''
  const lockedAmounts = resolveInfoDeltaLockedAmounts(
    tagValForChapter(outline, ch, '信息增量'),
    args.amountContext || '',
  )

  const time = tagValForChapter(outline, ch, '本章时间')
  const place = tagValForChapter(outline, ch, '本章地点')
  const cast = tagValForChapter(outline, ch, '本章人物')
  const catalyst = tagValForChapter(outline, ch, '本章起因')
  const desire = tagValForChapter(outline, ch, '欲望')
  const obstacle = tagValForChapter(outline, ch, '阻碍')
  const stakes = tagValForChapter(outline, ch, '局面变化')
  const choice = tagValForChapter(outline, ch, '人物选择')
  const endingQ = tagValForChapter(outline, ch, '章末问题')
  const infoDelta = tagValForChapter(outline, ch, '信息增量')
  const themeEcho = tagValForChapter(outline, ch, '主题回响')
  const shuangType = tagValForChapter(outline, ch, '爽型')
  const emotionCraft = tagValForChapter(outline, ch, '情绪手法')

  const hateTag = tagValForChapter(outline, ch, '恨')
  const shuangTag = tagValForChapter(outline, ch, '爽')
  const jiTag = tagValForChapter(outline, ch, '急')
  const panTag = tagValForChapter(outline, ch, '盼')

  const hasExplicit = !!(hateTag || shuangTag || jiTag || panTag)
  const hasDrama = !!(obstacle || desire || choice || stakes || endingQ || catalyst)
  const plotItems = extractOutlineBeatItems(outline, 12)
  const legacy = !hasExplicit && !hasDrama
    ? plotItems.map(i => i.beat).filter(Boolean)
    : []

  const catalysts = extractOutlineCatalystPhrases(outline)
  const pendingCatalysts = catalysts.filter(c => !prev.trim() || !outlineCatalystCoveredIn(prev, c))
  const catalystPending = pendingCatalysts[0] || (catalyst && (!prev.trim() || !outlineCatalystCoveredIn(prev, catalyst))
    ? catalyst
    : '')

  // 结构化标签先于情绪场长对白，避免模型只演恨场台词丢掉信息增量
  const hateLines = [
    '【恨】冲突前置（本拍只演恨；下列大纲字段须场面化，禁止只演情绪词）',
    dramaFieldLine('本章起因', catalystPending || catalyst),
    dramaFieldLine('阻碍', obstacle),
    dramaFieldLine('欲望', desire, 100),
    infoDelta
      ? [
        '【信息增量·本章必写】下列要点最迟爽拍写完（恨拍能场面化则本拍写）：',
        ...splitInfoDeltaPoints(infoDelta).map((p, i) => formatInfoDeltaPointLine(p, i)),
        lockedAmounts.length
          ? `已锁定钱数：${lockedAmounts.join('、')}（本章结果态条同题金额须用字面，禁止另造）`
          : '',
        '禁止只写半句；结果态条须写已发生，禁止用未完成/旧态冒充。结构化标签优先于下方恨场对白扩写。',
      ].filter(Boolean).join('\n')
      : '',
    time ? `时间锚：${time}` : '',
    place ? `地点锚：${place}` : '',
    cast ? `在场：${cast}` : '',
    hateTag ? clipEmotionOutlineSeed('恨', hateTag, infoDelta ? 96 : 160) : '',
    emotionCraft ? `调性：${emotionCraft}` : '',
    !hateTag && !obstacle && legacy[0] ? `压迫场面：${legacy[0]}` : '',
    buildEmotionCorePhaseHardLine('恨'),
  ].filter(Boolean)

  const shuangLines = [
    '【爽】动作震慑 + 本事露尖（本拍只演爽；立约可留但不得单独当爽）',
    // 信息增量置顶：内容=大纲原文拆条；新事实 ≠ 无新信息的条款复读
    buildInfoDeltaMustLandBlock(infoDelta, lockedAmounts),
    infoDelta
      ? '硬性澄清：【信息增量】新事实优先于「禁止重报已立条款」；后者仅禁无新信息的复读。未写完信息增量不得进入急/盼。'
      : '',
    shuangTag ? clipEmotionOutlineSeed('爽', shuangTag, infoDelta ? 96 : 160) : '',
    shuangType ? `爽型：${shuangType}` : '',
    cast ? `在场：${cast}` : '',
    dramaFieldLine('人物选择', choice),
    dramaFieldLine('局面变化', stakes),
    !shuangTag && !choice && !infoDelta && legacy[1] ? `硬刚：${legacy[1]}` : '',
    buildEmotionCorePhaseHardLine('爽'),
  ].filter(Boolean)

  const jiLines = [
    '【急】倒计时压迫（本拍开口不收束；勿重报已立条款；须加压未决）',
    jiTag ? clipEmotionOutlineSeed('急', jiTag) : '',
    dramaFieldLine('章末问题', endingQ, 100),
    obstacle ? `加压锚（勿复读全文）：${[...obstacle].slice(0, 48).join('')}` : '',
    !jiTag && !endingQ && legacy[2] ? `加码：${legacy[2]}` : '',
    '硬性：若前拍已立金额/期限，本拍只加压手段与反应，禁止再完整宣读合同。',
    buildEmotionCorePhaseHardLine('急'),
  ].filter(Boolean)

  const panLines = [
    '【盼】短复验或缺一环（短；非金手指首亮——首亮在爽拍信息增量/人物选择）',
    panTag ? clipEmotionOutlineSeed('盼', panTag) : '',
    dramaFieldLine('章末问题', endingQ, 72),
    dramaFieldLine('主题回响', themeEcho, 48),
    !panTag && legacy[3] ? `结论：${legacy[3]}` : '',
    cast ? `人物对齐：${cast}` : '',
    buildEmotionCorePhaseHardLine('盼'),
  ].filter(Boolean)

  const infoPoints = splitInfoDeltaPoints(infoDelta)
  const hateMust = [catalystPending || catalyst, obstacle, desire]
    .map(s => (s || '').replace(/\s+/g, ' ').trim())
    .filter(s => [...s].length >= 4)
  return [
    { phase: '恨', tag: '恨', beat: hateLines.join('\n'), mustLand: hateMust },
    { phase: '爽', tag: '爽', beat: shuangLines.join('\n'), mustLand: infoPoints },
    {
      phase: '急',
      tag: '急',
      beat: jiLines.join('\n'),
      mustLand: endingQ ? [endingQ.replace(/\s+/g, ' ').trim()].filter(s => [...s].length >= 4) : [],
    },
    {
      phase: '盼',
      tag: '盼',
      beat: panLines.join('\n'),
      mustLand: endingQ ? [[...endingQ].slice(0, 80).join('').replace(/\s+/g, ' ').trim()].filter(Boolean) : [],
    },
  ]
}

/** 单拍生成时追加的硬规则（动态注入，只含本拍；同源 SSOT） */
export function buildEmotionBeatHardRule(phase: EmotionBeatPhase): string {
  return buildEmotionCorePhaseHardRule(phase as EmotionCorePhase)
}

/**
 * 由本章大纲 BeatPack 生成分拍任务（mustLand 原文优先，相位合同为辅）。
 */
export function buildEmotionBeatSpecsFromPack(args: {
  pack: {
    beats: Array<{
      phase: EmotionBeatPhase
      focus: string
      mustLand: string[]
      weightHint: number
    }>
  }
  chapterOutline: string
  chapterNumber: number
  amountContext?: string
}): EmotionBeatSpec[] {
  const infoDelta = tagValForChapter(args.chapterOutline, args.chapterNumber, '信息增量')
  const lockedAmounts = resolveInfoDeltaLockedAmounts(infoDelta, args.amountContext || '')
  return args.pack.beats.map((b) => {
    const mustLand = (b.mustLand || [])
      .map(m => m.replace(/\s+/g, ' ').trim())
      .filter(m => [...m].length >= 2)
    const landLines = mustLand
      .map((m, i) => `${i + 1}. ${m}`)
      .join('\n')
    const needsInfoLock = mustLand.some(m =>
      infoDelta && compactIncludes(infoDelta, m),
    )
    const lines = [
      `【${b.phase}】${b.focus || `本拍演${b.phase}`}`,
      landLines ? `【须本拍落地·大纲原文】\n${landLines}` : '',
      needsInfoLock && lockedAmounts.length
        ? `已锁定钱数：${lockedAmounts.join('、')}（本章结果态条同题金额须用字面，禁止另造）`
        : '',
      '以上 mustLand 须场面化；禁止只演情绪词、禁止发明大纲外情节。',
      buildEmotionCorePhaseHardLine(b.phase),
    ].filter(Boolean)
    return { phase: b.phase, tag: b.phase, beat: lines.join('\n'), mustLand }
  })
}

function compactIncludes(hay: string, needle: string): boolean {
  const h = (hay || '').replace(/\s+/g, '')
  const n = (needle || '').replace(/\s+/g, '')
  return !!n && h.includes(n)
}
