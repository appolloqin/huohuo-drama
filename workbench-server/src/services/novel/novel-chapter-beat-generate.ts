/**
 * P1：按拍顺序多次生成并拼接；第1～8章分拍节点绑定恨→爽→急→盼。
 * 每拍独立 token 预算，超长截到句号。
 */
import {
  WEBNOVEL_CHAPTER_PROSE_GUIDE,
  WEBNOVEL_COLLOQUIAL_GUIDE,
  WEBNOVEL_NARRATIVE_TECHNIQUE_GUIDE,
  WEBNOVEL_STAT_FINGERPRINT_GUIDE,
} from '../../agents/webnovel-prose-style.js'
import { countNovelChars, assertNovelChapterLengthBand } from '../../common/novel/novel-char-limit.js'
import {
  isBeatSequentialGenerateEnabled,
  parseNovelMetadata,
  resolveNovelGenreSkillKey,
  type NovelMetadata,
} from '../../common/novel/novel-meta.js'
import { extractChapterOutline } from '../../common/novel/novel-outline.js'
import { normalizeNovelTemporalNumerals } from '../../common/novel/novel-temporal-numerals.js'
import { stripEmotionBeatMetaLabels } from '../../common/novel/novel-emotion-beat-meta-strip.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import {
  chatCompletionText,
  sanitizeModelCreativeOutput,
  type TextBillingContext,
} from '../ai/ai.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { buildNovelAgentSystem, buildNovelAgentSystemForDrama, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import {
  resolveChapterBeatBudgets,
  shouldUseBeatSequentialGenerate,
  truncateProseToCharBudget,
  type ChapterBeatBudgetItem,
} from './novel-chapter-beat-budget.js'
import {
  buildEmotionBeatHardRule,
  isEmotionBeatPhase,
  shouldBindEmotionBeats,
} from './novel-chapter-emotion-beats.js'
import { loadPrevChapterEndSnapshot } from './novel-chapter-end-snapshot.js'
import {
  buildChapterSeamWriteBlock,
  buildForcedSeamOpeningBlock,
  buildOutlineStaleBlock,
  buildRewriteAntiSeamBlock,
  detectChapterSeamColdOpen,
  detectChapterSeamReplay,
  extractOutlineCatalystPhrases,
  formatNextChapterForbidBlock,
  formatNextChapterForwardSeamBlock,
  stripForwardSeamCopyEnding,
  stripSeamReplayOpening,
} from './novel-chapter-seam.js'
import {
  detectCatalystAgencyFail,
  detectChapterForwardSeamCopy,
} from './novel-outline-compliance.js'
import { outlineBeatCoveredIn, outlineCatalystCoveredIn } from './novel-outline-beat-cover.js'
import { buildNovelWriteContext, loadNextChapterContentHead, loadPrevChapterContentTail } from './novel-continuity.js'
import {
  assertOutlineChapterFields,
  buildChapterOutlineDramaPromptBlock,
  OUTLINE_DRAMA_PRIORITY_LINE,
} from './novel-outline-drama-fields.js'
import { alignNovelChapterOutlineBoundary } from './novel-outline-boundary.js'
import { chapterLengthTokenBudget, polishNovelChapterProse } from './novel-prose-polish.js'
import { buildFrozenPresencePhaseBlock } from './novel-presence-phase.js'

const PRIOR_TAIL_CHARS = 720

export type BeatSequentialGenerateArgs = {
  dramaTitle: string
  chapterNumber: number
  chapterTitle: string
  prompt: string
  chapterOutline?: string
  meta: NovelMetadata
  dramaId: number
  chapterId: number
  existingText?: string
  targetLength?: number
  mode?: 'generate' | 'rewrite'
  /** 默认仅 rewrite；一次生成/数字作家为 false */
  includeNextChapter?: boolean
  /**
   * 每拍落稿后回调（供 SSE 流式预览）。
   * textDelta 为相对上一拍的增量，前端按 chunk 拼接。
   */
  onBeatProgress?: (info: {
    beatIndex: number
    beatTotal: number
    status: string
    textDelta?: string
    polishing?: boolean
  }) => void
}

function priorTail(frozen: string): string {
  const t = frozen.trim()
  if (!t) return ''
  const chars = [...t]
  if (chars.length <= PRIOR_TAIL_CHARS) return t
  return chars.slice(-PRIOR_TAIL_CHARS).join('')
}

/**
 * 已写正文进度锚点（题材无关）：后拍勿把已写到完成态的过程无交代再完整演一遍。
 */
function buildFrozenProgressNoReplayBlock(frozenProse: string): string {
  const t = frozenProse.trim()
  if (!t) return ''
  const chars = [...t]
  const anchor = chars.length <= 320 ? t : chars.slice(-320).join('')
  return [
    '【已写进度 — 勿回卷】',
    '已写正文中写到完成态的过程：可一句承接，禁止无闪回框又以当前进行时完整换皮再写一遍。只推进本拍尚未完成的新冲突。',
    '已写正文若已立金额/期限/证物条款：本拍禁止再完整宣读同一套合同；急拍用手段升级与倒计时感加压，勿另报不同天数。',
    `…${anchor.replace(/\s+/g, ' ').trim()}`,
  ].join('\n')
}

/** 供 verify */
export function buildFrozenProgressNoReplayBlockForTest(frozenProse: string): string {
  return buildFrozenProgressNoReplayBlock(frozenProse)
}

function joinBlocks(blocks: string[]): string {
  return blocks.filter(Boolean).join('\n\n')
}

function excerptRelatedDraft(existing: string | undefined, beat: string): string {
  const draft = existing?.trim()
  if (!draft || !beat.trim()) return ''
  const key = beat.replace(/\s+/g, '').slice(0, 8)
  if (!key) return ''
  const norm = draft.replace(/\s+/g, '')
  const idx = norm.indexOf(key)
  if (idx < 0) return ''
  // 粗定位：取附近一段原文供重写参考（非照抄结构）
  const window = 280
  const start = Math.max(0, idx - 40)
  const slice = [...draft].slice(start, start + window).join('')
  return slice.trim() ? `【旧稿本拍相关摘录（可吸收细节，禁止照抄结构/回放）】\n${slice.trim()}` : ''
}

async function loadNextChapterOutlineText(dramaId: number, chapterNumber: number): Promise<string> {
  if (!(dramaId > 0) || !(chapterNumber >= 1)) return ''
  try {
    const next = await episodesRepo.findEpisodeByDramaAndNumber(dramaId, chapterNumber + 1)
    const fromEp = next?.description?.trim()
    if (fromEp) return fromEp
    const drama = await dramasRepo.findDramaById(dramaId)
    const meta = parseNovelMetadata(drama?.metadata)
    return extractChapterOutline(meta.outline || '', chapterNumber + 1).trim()
  } catch {
    return ''
  }
}

/**
 * 首拍开篇规则（题材无关）：第1章可直接冲突/对白；第≥2章先承接再爆发。
 * 导出供合同冒烟断言。
 */
export function buildBeatOpeningRule(args: {
  chapterNumber: number
  seamRetryHint?: string
  hasPriorFrozen?: boolean
  priorTail?: string
}): string {
  const { chapterNumber, seamRetryHint, hasPriorFrozen, priorTail } = args
  if (chapterNumber >= 2) {
    return [
      '【开篇硬性 — 章缝承接后再爆发】',
      '1. 先轻锚承接上章已发生事实 / 落地未决【本章起因】；禁止跳切吃书、禁止复述上章收束对白。',
      '2. 承接后立刻进入本拍冲突或对白，短平快；环境最多一句锚，禁止开篇大段盘点。',
      '3. 禁止照抄上章末特色词组（若提示中列出了「勿再复述」条目，更不得沿用）。',
      seamRetryHint ? `【上轮硬伤】${seamRetryHint}` : '',
    ].filter(Boolean).join('\n')
  }
  if (hasPriorFrozen && priorTail) {
    return `【已写正文（已冻结，禁止重写/删改/回放）】\n…${priorTail}`
  }
  return [
    '【开篇硬性 — 冲突前置·对峙高潮】',
    '首句即压力方对白或拍桌/踹门类动作；环境最多一句锚。',
    '家底/困境只从对白与动作带出，禁止先苏醒盘点再冲突。',
    '本拍若标【恨】：只演极限压迫（规则压迫+恶语可细）；金手指露尖与立约反杀留给【爽】拍，勿在恨拍提前翻盘。',
    '约前300字内必须出现压力方对白或动作；约前500字内须亮出卖点冲突物。',
    '禁止开篇大段设定/家底盘点/元说明（如「没有系统」）。',
    '禁止开篇长段冻醒/感官苏醒/记忆灌入；穿越身份最多嵌一句。',
  ].join('\n')
}

/** 末拍收束规则：必须落到未决钩，禁止纯感慨 */
export function buildBeatEndingRule(args: {
  hasNextHead: boolean
  seamRetryHint?: string
}): string {
  const hookLine =
    '【章尾挖坑】必须落到大纲【章末问题】所指未决事件；停在急/盼钩；章尾禁工序/缺件/温情泄压与「没准谱/心里没底/走着瞧」（看最后200字）；禁止「心里松了」「那是家」等纯感慨收束代替钩子。'
  if (args.hasNextHead) {
    return [
      '【末拍双目标】',
      '1. 写完本拍（本章大纲末拍）即收束本章主冲突。',
      '2. 再留短落点：时间/地点/在场须使下章能自然续上，不得时空打架。',
      '3. 章末停在下章开篇之前；禁止照抄/复述下章已写开篇（提示中不下发下章原文）。',
      '4. 禁止另起下章未接续的支线终局；禁止再开新人物登门。',
      hookLine,
      args.seamRetryHint ? `【上轮硬伤】${args.seamRetryHint}` : '',
    ].filter(Boolean).join('\n')
  }
  return [
    '【末拍】写完本拍即整章收束；写到本章大纲硬止点即停；禁止再开新场面/新人物登门/新完成态；不考虑下章。',
    hookLine,
  ].join('\n')
}

async function generateOneBeat(args: {
  sharedSystem: string
  sharedUserPrefix: string
  item: ChapterBeatBudgetItem
  beatIndex: number
  beatTotal: number
  frozenProse: string
  chapterNumber: number
  chapterOutline?: string
  isRewrite: boolean
  existingText?: string
  prevTail?: string
  prevSnapshot?: import('../../common/novel/novel-continuity-state.js').ChapterEndSnapshot | null
  nextChapterHead?: string
  billing?: TextBillingContext
  seamRetryHint?: string
}): Promise<string> {
  const { item, frozenProse, beatIndex, beatTotal } = args
  const isFirst = beatIndex === 0
  const isLast = beatIndex === beatTotal - 1
  const prior = priorTail(frozenProse)
  const hasNextHead = !!args.nextChapterHead?.trim()

  const openingRule = isFirst
    ? buildBeatOpeningRule({
      chapterNumber: args.chapterNumber,
      seamRetryHint: args.seamRetryHint,
      hasPriorFrozen: !!prior && args.chapterNumber < 2,
      priorTail: prior,
    })
    : prior
      ? `【已写正文（已冻结，禁止重写/删改/回放）】\n…${prior}`
      : '【开篇】按大纲本拍开写。'

  // 第2章起第一拍：勿灌旧稿开篇摘录（常含章缝回放毒句）
  const draftExcerpt = args.isRewrite && !(isFirst && args.chapterNumber >= 2)
    ? excerptRelatedDraft(args.existingText, item.beat)
    : ''

  const lastBeatRule = isLast
    ? buildBeatEndingRule({
      hasNextHead,
      seamRetryHint: args.seamRetryHint,
    })
    : `【禁止】提前写第 ${item.index + 1} 拍及之后情节；禁止发明大纲未列后续。`

  const frozenNoReplay = !isFirst && frozenProse.trim()
    ? buildFrozenProgressNoReplayBlock(frozenProse)
    : ''
  const frozenPresence = !isFirst && frozenProse.trim()
    ? buildFrozenPresencePhaseBlock(frozenProse)
    : ''

  const emotionHard = isEmotionBeatPhase(item.phase)
    ? buildEmotionBeatHardRule(item.phase)
    : ''

  const beatUser = joinBlocks([
    args.sharedUserPrefix,
    openingRule,
    prior && !(args.chapterNumber >= 2 && isFirst)
      ? `【已写正文（已冻结，禁止重写/删改/回放）】\n…${prior}`
      : '',
    frozenNoReplay,
    frozenPresence,
    `【本拍任务 — 第 ${item.index}/${beatTotal} 拍｜情绪职：${item.phase}｜标签禁止写入正文】\n${item.beat}`,
    emotionHard,
    item.tag === '本章起因' || item.phase === '起因'
      ? '【本拍】写清该起因由【本章人物】完成；禁止续写上章末悬念正文。'
      : '',
    item.phase === '恨' && args.chapterNumber >= 2
      ? '【本拍】若有待落地【本章起因】，须在恨场压迫中由本章人物完成；禁止续写上章末悬念正文。'
      : '',
    !isFirst
      ? '【本拍】只推进本情绪职尚未完成的部分；已完成态过程勿无交代完整再演（一句承接即可）。'
      : '',
    `【本拍篇幅】须写约 ${item.minChars}～${item.maxChars} 字（目标 ${item.targetChars}）；写完本拍即停。`,
    lastBeatRule,
    draftExcerpt,
    '【输出】只输出本拍简体中文正文；禁止输出（恨拍）（爽拍）（急拍）（盼拍）、【恨】【爽】【急】【盼】等任务标签/小标题；不要章节标题；不要复述已写正文；不要输出说明标记。',
  ])

  const maxTokens = chapterLengthTokenBudget(item.maxChars)
  let options = await novelAgentCompletionOptions('novel_chapter_writer', {
    maxTokens,
    temperature: args.isRewrite ? 0.84 : 0.8,
  })
  options = {
    ...options,
    maxTokens: Math.min(maxTokens, Number(options.maxTokens) || maxTokens),
  }

  const raw = await chatCompletionText(
    [
      { role: 'system', content: args.sharedSystem },
      { role: 'user', content: beatUser },
    ],
    {
      ...options,
      billing: args.billing
        ? { ...args.billing, reason: `${args.billing.reason || 'novel-chapter'}-beat-${item.index}` }
        : undefined,
    },
  )

  let text = normalizeNovelTemporalNumerals(sanitizeModelCreativeOutput(raw) || raw.trim())
  text = stripEmotionBeatMetaLabels(text).text
  if (prior && text.replace(/\s+/g, '').startsWith(prior.replace(/\s+/g, '').slice(0, 24))) {
    const cut = text.indexOf(prior.slice(-12))
    if (cut > 0) text = text.slice(cut + 12).trim()
  }
  const before = countNovelChars(text)
  text = truncateProseToCharBudget(text, item.maxChars)
  if (countNovelChars(text) < before) {
    logTaskWarn('Novel', 'beat-truncated-to-budget', {
      beat: item.index,
      phase: item.phase,
      before,
      after: countNovelChars(text),
      maxChars: item.maxChars,
    })
  }
  return text
}

/** 第一拍：章缝回放重试；待落地起因须覆盖才优先冻结，失败只软警告不抛错 */
async function generateFirstBeatWithSeamGuard(args: Parameters<typeof generateOneBeat>[0]): Promise<string> {
  let text = await generateOneBeat(args)
  if (args.chapterNumber < 2 || !args.prevTail?.trim()) return text

  const hit = detectChapterSeamReplay({
    content: text,
    chapterNumber: args.chapterNumber,
    prevChapterTail: args.prevTail,
    chapterOutline: args.chapterOutline,
    prevSnapshot: args.prevSnapshot,
  })
  if (hit?.rule === 'chapter_seam_replay' && /高度重合|回放/.test(hit.message)) {
    logTaskWarn('Novel', 'beat1-seam-replay-retry', { message: hit.message.slice(0, 120) })
    text = await generateOneBeat({
      ...args,
      seamRetryHint: hit.message,
    })
  }

  const catalysts = extractOutlineCatalystPhrases(args.chapterOutline || '')
  const pending = catalysts.filter(c =>
    !args.prevTail?.trim() || !outlineCatalystCoveredIn(args.prevTail, c),
  )
  const catalystCovered = (body: string) => pending.some(c => outlineCatalystCoveredIn(body, c))

  if (pending.length > 0 && !catalystCovered(text)) {
    const nuclearHint = [
      '本拍必须写清下列【本章起因】（由本章人物完成），禁止另起无关支线：',
      ...pending.slice(0, 3).map((c, i) => `${i + 1}. ${c}`),
      '禁止续写上章末悬念正文；接缝只提供结构化事实。先写起因落地，再进入欲望/阻碍。',
    ].join('\n')
    for (let attempt = 1; attempt <= 2; attempt++) {
      logTaskWarn('Novel', 'beat1-catalyst-coverage-retry', {
        attempt,
        pending: pending.slice(0, 3),
      })
      text = await generateOneBeat({
        ...args,
        seamRetryHint: nuclearHint,
      })
      if (catalystCovered(text)) break
    }
    if (!catalystCovered(text)) {
      // 软门闩：不抛错、不清空；后处理标 soft-warn，避免回滚旧毒稿死循环
      const agency = detectCatalystAgencyFail({
        content: text,
        chapterOutline: args.chapterOutline,
        prevChapterTail: args.prevTail,
      })
      logTaskWarn('Novel', 'beat1-catalyst-uncovered-soft', {
        message: (agency?.message || '第一拍仍未覆盖本章起因').slice(0, 160),
        pending: pending.slice(0, 3),
      })
    }
  }

  const stripped = stripSeamReplayOpening({
    content: text,
    chapterNumber: args.chapterNumber,
    prevChapterTail: args.prevTail,
    chapterOutline: args.chapterOutline,
    prevSnapshot: args.prevSnapshot,
  })
  if (stripped.stripped) {
    logTaskWarn('Novel', 'beat1-seam-replay-stripped', {
      before: countNovelChars(text),
      after: countNovelChars(stripped.text),
    })
    text = stripped.text
  }
  return text
}

/**
 * 按拍顺序生成整章；调用方已确认 shouldUseBeatSequentialGenerate。
 */
export async function generateNovelChapterByBeats(
  args: BeatSequentialGenerateArgs,
  billing?: TextBillingContext,
): Promise<string> {
  const {
    dramaTitle,
    chapterNumber,
    chapterTitle,
    prompt,
    chapterOutline,
    meta,
    dramaId,
    chapterId,
    existingText,
    targetLength = 3000,
    mode = 'generate',
    includeNextChapter,
    onBeatProgress,
  } = args
  const isRewrite = mode === 'rewrite'
  const withNext = includeNextChapter ?? isRewrite

  const prevTail = chapterNumber >= 2
    ? await loadPrevChapterContentTail(dramaId, chapterNumber, 1600)
    : ''
  const prevSnap = chapterNumber >= 2
    ? await loadPrevChapterEndSnapshot(dramaId, chapterNumber)
    : null

  const outlineAlign = alignNovelChapterOutlineBoundary({
    chapterOutline,
    writingBrief: prompt,
    existingText,
    mode,
    chapterNumber,
    prevSeamHint: prevSnap
      ? [prevSnap.time, prevSnap.place, prevSnap.last_event].filter(Boolean).join(' · ')
      : prevTail.slice(-240),
  })
  const userTarget = Math.min(20000, Math.max(500, targetLength))
  const beatBudgets = resolveChapterBeatBudgets({
    chapterOutline,
    userTarget,
    endpointPending: outlineAlign.endpointPending,
    prevChapterTail: prevTail,
    chapterNumber,
  })
  const items = beatBudgets.items
  if (!shouldUseBeatSequentialGenerate({
    beatCount: items.length,
    enabled: isBeatSequentialGenerateEnabled(meta),
  })) {
    throw new Error('generateNovelChapterByBeats: beat sequential not eligible')
  }
  const emotionBound = shouldBindEmotionBeats(chapterNumber)

  const minLen = outlineAlign.endpointPending
    ? Math.round(userTarget * 0.82)
    : Math.round(userTarget * 0.88)
  const maxLen = Math.round(userTarget * (outlineAlign.endpointPending ? 1.08 : 1.12))

  const ctx = await buildNovelWriteContext({
    dramaId,
    chapterNumber,
    chapterId,
    meta,
    retrievalQuery: [chapterOutline, prompt].filter(Boolean).join('\n'),
    writingBrief: outlineAlign.alignedBrief || prompt,
    bookOutline: meta.outline,
    chapterOutline,
  })

  const outlineDramaCheck = assertOutlineChapterFields(
    [meta.outline || '', chapterOutline || ''].join('\n\n'),
    chapterNumber,
  )
  const outlineDramaBlock = outlineDramaCheck.fields
    ? buildChapterOutlineDramaPromptBlock(outlineDramaCheck.fields)
    : ''

  const sharedSystem = [
    await buildNovelAgentSystemForDrama('novel_chapter_writer', meta),
    '',
    WEBNOVEL_CHAPTER_PROSE_GUIDE,
    '',
    WEBNOVEL_NARRATIVE_TECHNIQUE_GUIDE,
    '',
    WEBNOVEL_STAT_FINGERPRINT_GUIDE,
    '',
    WEBNOVEL_COLLOQUIAL_GUIDE,
    '',
    OUTLINE_DRAMA_PRIORITY_LINE,
    '',
    '【情节优先序】本章大纲（含【本章起因】）> 上章已发生事实 > 写作说明。写作说明不得另起出门/进山等与大纲或上章事实冲突的起势。',
    '',
    emotionBound
      ? '当前任务：**按恨→爽→急→盼分拍写作**——每次只写用户指定的本情绪拍；已写正文已冻结；禁止把四拍揉进一拍。'
      : '当前任务：**按拍点分段写作**——每次只写用户指定的「本拍」；已写正文已冻结。',
    '章内进度：后拍勿把已写到完成态的过程无交代再完整演一遍（可一句承接；同主题加深/余波可以）。',
    '结构与章末止点服从【本章大纲边界】；禁止为凑字越过末拍。',
    `整章目标合计约 ${userTarget} 字（${minLen}～${maxLen}）；各拍自有预算，勿把字数挪到未写拍点。`,
  ].filter(Boolean).join('\n')

  const rewriteAntiSeam = chapterNumber >= 2
    ? buildRewriteAntiSeamBlock({
      existingText: isRewrite ? (existingText || '') : '',
      prevTail,
      chapterNumber,
      chapterOutline,
      prevSnapshot: prevSnap,
    })
    : ''

  const pendingCatalysts = chapterNumber >= 2 && chapterOutline?.trim()
    ? extractOutlineCatalystPhrases(chapterOutline).filter(c =>
      !prevTail.trim() || !outlineCatalystCoveredIn(prevTail, c),
    )
    : []
  const pendingCatalystBlock = pendingCatalysts.length
    ? [
      '【本章起因 — 须立刻落地】',
      ...pendingCatalysts.slice(0, 3).map((c, i) => `${i + 1}. ${c}`),
      '硬性：第一拍写清上述起因由【本章人物】完成；接缝只提供上章结构化事实，禁止续写上章末悬念正文。',
    ].join('\n')
    : ''

  // 仅用户重写默认带下文；一次生成 / 数字作家不看下章
  const nextChapterOutline = withNext && dramaId > 0
    ? await loadNextChapterOutlineText(dramaId, chapterNumber)
    : ''
  const nextChapterHead = withNext && dramaId > 0
    ? await loadNextChapterContentHead(dramaId, chapterNumber, 1000)
    : ''
  const nextChapterForbidBlock = withNext
    ? formatNextChapterForbidBlock(nextChapterOutline, chapterNumber)
    : ''
  const nextChapterForwardSeamBlock = withNext
    ? formatNextChapterForwardSeamBlock(nextChapterHead, chapterNumber)
    : ''

  const sharedUserPrefix = joinBlocks([
    ctx.worldbuildingBlock,
    ctx.outlineBlock,
    ctx.premiseBlock,
    ctx.structuredBlock,
    ctx.continuity,
    chapterNumber >= 2
      ? buildChapterSeamWriteBlock(prevTail, {
        maxTailChars: 160,
        omitRawPrevProse: true,
        prevSnapshot: prevSnap,
      })
      : '',
    pendingCatalystBlock,
    chapterNumber >= 2
      ? buildForcedSeamOpeningBlock({ chapterOutline, prevTail, prevSnapshot: prevSnap })
      : '',
    chapterNumber >= 2
      ? buildOutlineStaleBlock({ chapterOutline, prevTail, chapterNumber })
      : '',
    rewriteAntiSeam,
    nextChapterForbidBlock,
    nextChapterForwardSeamBlock,
    outlineDramaBlock,
    ctx.characterBlock,
    ctx.selfHint,
    `【书名】${dramaTitle}`,
    `【本章】第${chapterNumber}章${chapterTitle ? ` ${chapterTitle}` : ''}`,
    chapterOutline?.trim()
      ? `【本章大纲】\n${chapterOutline.trim()}`
      : '',
    outlineAlign.boundaryBlock || '',
    beatBudgets.promptBlock,
    outlineAlign.alignedBrief?.trim()
      ? `【写作说明】\n${outlineAlign.alignedBrief.trim()}`
      : (prompt.trim() ? `【写作说明】\n${prompt.trim()}` : ''),
  ])

  logTaskWarn('Novel', 'novel-beat-sequential-start', {
    chapterNumber,
    beats: items.length,
    userTarget,
    mode,
    omitRawPrevProse: true,
    pendingCatalysts: pendingCatalysts.slice(0, 3),
    hasNextHead: withNext && !!nextChapterHead.trim(),
  })

  const parts: string[] = []
  let frozen = ''
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const beatArgs = {
      sharedSystem,
      sharedUserPrefix,
      item,
      beatIndex: i,
      beatTotal: items.length,
      frozenProse: frozen,
      chapterNumber,
      chapterOutline,
      isRewrite,
      existingText,
      prevTail,
      prevSnapshot: prevSnap,
      nextChapterHead: withNext ? nextChapterHead : '',
      billing,
    }
    const piece = i === 0 && chapterNumber >= 2
      ? await generateFirstBeatWithSeamGuard(beatArgs)
      : await generateOneBeat(beatArgs)
    if (!piece.trim()) {
      logTaskWarn('Novel', 'novel-beat-empty', { beat: item.index, phase: item.phase })
      continue
    }
    parts.push(piece.trim())
    frozen = parts.join('\n\n')
    const textDelta = parts.length === 1 ? piece.trim() : `\n\n${piece.trim()}`
    onBeatProgress?.({
      beatIndex: i,
      beatTotal: items.length,
      status: emotionBound
        ? `恨爽急盼 ${i + 1}/${items.length}（${items[i]?.phase || ''}）…`
        : `按大纲拍点 ${i + 1}/${items.length}…`,
      textDelta,
    })
    logTaskWarn('Novel', 'novel-beat-done', {
      beat: item.index,
      phase: item.phase,
      chars: countNovelChars(piece),
      frozenChars: countNovelChars(frozen),
    })
  }

  // 仅带下文时：下章已写则整章拼好后再检抄袭；禁止在单拍上剥尾（易把末拍剥光）
  if (withNext && nextChapterHead.trim() && parts.length > 0) {
    let joined = parts.join('\n\n')
    const forwardHit = detectChapterForwardSeamCopy({
      content: joined,
      nextChapterHead,
    })
    if (forwardHit) {
      const lastIdx = parts.length - 1
      const lastItem = items[Math.min(lastIdx, items.length - 1)]!
      logTaskWarn('Novel', 'beat-last-forward-seam-retry', {
        code: forwardHit.code,
        message: forwardHit.message.slice(0, 160),
      })
      const priorFrozen = parts.slice(0, -1).join('\n\n')
      const beforeRetryChars = countNovelChars(joined)
      const rewrittenLast = await generateOneBeat({
        sharedSystem,
        sharedUserPrefix,
        item: lastItem,
        beatIndex: Math.max(0, items.length - 1),
        beatTotal: items.length,
        frozenProse: priorFrozen,
        chapterNumber,
        chapterOutline,
        isRewrite,
        existingText,
        prevTail,
        prevSnapshot: prevSnap,
        nextChapterHead,
        billing,
        seamRetryHint: forwardHit.message,
      })
      if (rewrittenLast.trim()) {
        const candidate = [...parts.slice(0, -1), rewrittenLast.trim()].join('\n\n')
        // 重写末拍后若整章显著变短，回退
        if (countNovelChars(candidate) < Math.round(beforeRetryChars * 0.85)) {
          logTaskWarn('Novel', 'beat-last-forward-seam-retry-reverted-short', {
            before: beforeRetryChars,
            after: countNovelChars(candidate),
          })
        } else {
          parts[lastIdx] = rewrittenLast.trim()
          frozen = candidate
        }
      }
    }
  }

  const joinedRaw = parts.join('\n\n').trim() || frozen.trim()
  let draft = normalizeNovelTemporalNumerals(joinedRaw)
  if (!draft) return draft
  const draftFloor = Math.max(800, Math.round(minLen * 0.75))

  // 整章再剥一次开篇重合（防拼接残留）
  if (chapterNumber >= 2 && prevTail.trim()) {
    const strippedAll = stripSeamReplayOpening({
      content: draft,
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
      prevSnapshot: prevSnap,
    })
    if (strippedAll.stripped) {
      if (countNovelChars(strippedAll.text) >= draftFloor) {
        logTaskWarn('Novel', 'chapter-seam-replay-stripped-after-join', {
          before: countNovelChars(draft),
          after: countNovelChars(strippedAll.text),
        })
        draft = strippedAll.text
      } else {
        logTaskWarn('Novel', 'chapter-seam-replay-strip-skipped-short', {
          before: countNovelChars(draft),
          after: countNovelChars(strippedAll.text),
          draftFloor,
        })
      }
    }
  }

  // 仅带下文：再剥章末与下章开篇重合（保守；过短则跳过）
  if (withNext && nextChapterHead.trim()) {
    const beforeFwd = draft
    const strippedEnd = stripForwardSeamCopyEnding({
      content: draft,
      nextChapterHead,
    })
    if (strippedEnd.stripped) {
      if (countNovelChars(strippedEnd.text) >= draftFloor) {
        logTaskWarn('Novel', 'forward-seam-copy-stripped-after-join', {
          before: countNovelChars(draft),
          after: countNovelChars(strippedEnd.text),
        })
        draft = strippedEnd.text
      } else {
        logTaskWarn('Novel', 'forward-seam-copy-strip-skipped-short', {
          before: countNovelChars(beforeFwd),
          after: countNovelChars(strippedEnd.text),
          draftFloor,
        })
      }
    }
  }

  const draftBeforePolish = draft
  onBeatProgress?.({
    beatIndex: items.length,
    beatTotal: items.length,
    status: '正在润色正文…',
    polishing: true,
  })
  let polished = normalizeNovelTemporalNumerals(
    await polishNovelChapterProse(draft, billing, {
      minLen,
      maxLen,
      mode: 'chapter',
      colloquialBoost: true,
      layoutReference: draft,
      novelGenreSkillKey: resolveNovelGenreSkillKey(meta),
    }),
  )

  if (dramaId && chapterNumber >= 2 && chapterOutline?.trim() && draft.trim()) {
    const coldArgs = {
      chapterNumber,
      prevChapterTail: prevTail,
      chapterOutline,
    }
    const draftCold = !!detectChapterSeamColdOpen({ content: draft, ...coldArgs })
    const polishCold = !!detectChapterSeamColdOpen({ content: polished, ...coldArgs })
    if (polishCold && !draftCold) {
      logTaskWarn('Novel', 'beat-sequential-polish-reverted-cold-open', {
        chapterNumber,
        draftChars: countNovelChars(draft),
        polishChars: countNovelChars(polished),
      })
      polished = draftBeforePolish
    } else {
      // 润色若把上章词组写回开篇，回退或再剥
      const draftSeam = detectChapterSeamReplay({
        content: draft,
        chapterNumber,
        prevChapterTail: prevTail,
        chapterOutline,
        prevSnapshot: prevSnap,
      })
      const polishSeam = detectChapterSeamReplay({
        content: polished,
        chapterNumber,
        prevChapterTail: prevTail,
        chapterOutline,
        prevSnapshot: prevSnap,
      })
      if (polishSeam && /高度重合/.test(polishSeam.message) && !draftSeam) {
        logTaskWarn('Novel', 'beat-sequential-polish-reverted-seam-replay', {
          message: polishSeam.message.slice(0, 100),
        })
        polished = draftBeforePolish
      } else if (polishSeam && /高度重合/.test(polishSeam.message)) {
        const s = stripSeamReplayOpening({
          content: polished,
          chapterNumber,
          prevChapterTail: prevTail,
          chapterOutline,
          prevSnapshot: prevSnap,
        })
        if (s.stripped && countNovelChars(s.text) >= draftFloor) polished = s.text
      }
    }
  }

  // 字数地板：任何剥尾/润色不得交比拼好稿短太多的正文
  const joinedChars = countNovelChars(joinedRaw)
  const outChars = countNovelChars(polished)
  if (joinedChars >= draftFloor && outChars < draftFloor) {
    logTaskWarn('Novel', 'beat-sequential-refuse-short-delivery', {
      chapterNumber,
      joinedChars,
      outChars,
      draftFloor,
    })
    polished = draftBeforePolish
    if (countNovelChars(polished) < draftFloor) polished = joinedRaw
  }

  logTaskWarn('Novel', 'novel-beat-sequential-done', {
    chapterNumber,
    beats: items.length,
    chars: countNovelChars(polished),
  })
  assertNovelChapterLengthBand({
    text: polished,
    minLen,
    maxLen,
    chapterNumber,
  })
  return polished
}
