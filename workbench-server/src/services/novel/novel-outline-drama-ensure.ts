/**
 * 大纲戏剧要素补全与写前闸门
 */
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { resolveNovelGenreSkillKey, isOutlineDramaGateEnabled, type NovelMetadata } from '../../common/novel/novel-meta.js'
import { NO_THINKING_OUTPUT_RULE } from '../../common/novel/novel-creative-output.js'
import {
  assertOutlineBookFields,
  assertOutlineChapterFields,
  OUTLINE_CHAPTER_FIELD_LABELS,
  sliceOutlineChapterSection,
  type OutlineChapterDramaFields,
} from './novel-outline-drama-fields.js'
import {
  assertOutlineAppealNoveltyTags,
  detectDefaultFarmRebirthCliché,
} from './novel-outline-appeal-novelty.js'
import {
  assertOutlineTitleSellAlignment,
  buildTitleSellHardRequirement,
} from './novel-title-sell-align.js'
import { normalizeOutlineChapterTitles } from '../../common/novel/novel-outline.js'
import {
  buildEmotionCoreOutlineTagLines,
  EMOTION_CORE_CONTRACT_VERSION,
  EMOTION_CORE_STAKES,
} from './novel-emotion-core-contract.js'
import { buildStakesCommonSensePromptBlock } from './novel-stakes-common-sense.js'

export class OutlineDramaFieldsError extends Error {
  code: 'outline_book_fields_incomplete' | 'outline_chapter_fields_incomplete'
  missing: string[]
  invalid: string[]

  constructor(
    code: OutlineDramaFieldsError['code'],
    message: string,
    missing: string[] = [],
    invalid: string[] = [],
  ) {
    super(message)
    this.name = 'OutlineDramaFieldsError'
    this.code = code
    this.missing = missing
    this.invalid = invalid
  }
}

/** 本章自定义大纲是否已是戏剧标签块（可作写章主源） */
function isCustomDramaChapterOutline(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  let hits = 0
  for (const label of ['本章起因', '恨', '信息增量', '欲望', '阻碍', '局面变化']) {
    if (t.includes(`【${label}】`)) hits += 1
  }
  return hits >= 2
}

/**
 * 写章本章大纲：自定义（episode.description / UI 本章大纲）优先于全书切片。
 * 避免 UI 已改「两百四十两」而写章仍吃全书旧「四十两」。
 */
export function preferCustomChapterOutline(custom: string, bookSection: string): string {
  const fb = (custom || '').trim()
  const book = (bookSection || '').trim()
  if (isCustomDramaChapterOutline(fb)) return fb
  return book || fb
}

function collectBookDramaGaps(outline: string, title?: string, premise?: string): {
  missing: string[]
  cliche: string | null
  titleSellReasons: string[]
  ok: boolean
} {
  const book = assertOutlineBookFields(outline)
  const novelty = assertOutlineAppealNoveltyTags(outline)
  const cliche = detectDefaultFarmRebirthCliché(outline)
  const titleSell = assertOutlineTitleSellAlignment(outline, title, premise)
  const missing = [
    ...(book.ok ? [] : book.missing),
    ...(novelty.ok ? [] : novelty.missing),
  ]
  if (cliche) missing.push('卖点偏转(第三条偏转轴)')
  if (!titleSell.ok) missing.push('书名卖点对齐')
  return {
    missing,
    cliche,
    titleSellReasons: titleSell.reasons,
    ok: book.ok && novelty.ok && !cliche && titleSell.ok,
  }
}

/** 补全结果若明显截断/毁掉已有总纲，则丢弃，避免长大纲被 8k 补全打残 */
function acceptOutlineBookFill(prev: string, next: string): string {
  const filled = (next || '').trim()
  if (!filled) return prev
  const prevBook = assertOutlineBookFields(prev)
  const nextBook = assertOutlineBookFields(filled)
  if (prevBook.ok && !nextBook.ok) return prev
  if (prev.length > 4000 && filled.length < prev.length * 0.55) return prev
  return filled
}

export async function fillMissingOutlineBookFields(args: {
  outline: string
  title?: string
  premise?: string
  missing: string[]
  clicheHint?: string | null
  titleSellHints?: string[]
  billing?: TextBillingContext
  novelGenreSkillKey?: string
}): Promise<string> {
  const titleSellReq = buildTitleSellHardRequirement(args.title, args.premise)
  const system = [
    await buildNovelAgentSystem('novel_outline', {
      novelGenreSkillKey: args.novelGenreSkillKey,
    }),
    '任务：只补全全书大纲中缺失的总纲戏剧标签与书名卖点落地，保留原文其余部分。',
    '必须输出**完整大纲全文**（在原文基础上插入/补齐标签），不要只输出补丁。',
    '若缺【卖点偏转】【非常规压力源】【能力非常规用法】须补齐；偏转须写「常见预期→本书偏转」，并点出第三轴（如假账/掉包/派系/专利/配方等），禁止空喊「不一样」。',
    args.clicheHint
      ? `当前拼盘检测失败：${args.clicheHint}。须改写【卖点偏转】点出第三条偏转轴，勿删既有主线。`
      : '',
    args.titleSellHints?.length || titleSellReq
      ? [
        '若缺书名卖点对齐：必须改写第1章【信息增量】【盼】，并同步总纲【卖点偏转】【能力非常规用法】，写清书名硬钩如何落地。',
        '书名中的量级/硬钩必须出现在第1章分章标签；禁止只补总纲、禁止推到后文/卷末/终局再规划。',
        titleSellReq,
        args.titleSellHints?.length ? `检测失败：${args.titleSellHints.join('；')}` : '',
      ].filter(Boolean).join('\n')
      : '',
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: 8192,
    temperature: 0.5,
  })
  const user = [
    args.title ? `【书名】${args.title}` : '',
    args.premise ? `【梗概】\n${args.premise.slice(0, 1500)}` : '',
    `【缺失标签】${args.missing.join('、')}`,
    '【当前大纲】',
    args.outline.slice(0, 28000),
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      ...options,
      billing: args.billing
        ? { ...args.billing, reason: args.billing.reason || '小说大纲总纲补全' }
        : undefined,
    },
  )
  return acceptOutlineBookFill(args.outline, (raw || '').trim())
}

export async function fillMissingOutlineChapterFields(args: {
  outline: string
  chapterNumber: number
  missing: string[]
  invalid?: string[]
  title?: string
  premise?: string
  billing?: TextBillingContext
  novelGenreSkillKey?: string
}): Promise<string> {
  const section = sliceOutlineChapterSection(args.outline, args.chapterNumber)
  const needEmotion = args.chapterNumber >= 1 && args.chapterNumber <= 8
  const titleSellCh1 =
    args.chapterNumber === 1
      ? buildTitleSellHardRequirement(args.title, args.premise)
      : ''
  const system = [
    await buildNovelAgentSystem('novel_outline', {
      novelGenreSkillKey: args.novelGenreSkillKey,
    }),
    `任务：只补全第 ${args.chapterNumber} 章分章概要中缺失的戏剧标签。`,
    `须输出该章完整块：以「第${args.chapterNumber}章」开头，含标题与全部标签：${OUTLINE_CHAPTER_FIELD_LABELS.join('、')}${needEmotion ? '、恨、爽、急、盼、爽型' : ''}。`,
    '【冲突层】只能用：外部、人际、自我。',
    needEmotion
      ? [
        `情绪四拍同源 ${EMOTION_CORE_CONTRACT_VERSION}：`,
        buildEmotionCoreOutlineTagLines(),
        EMOTION_CORE_STAKES,
        buildStakesCommonSensePromptBlock(),
        '【爽型】闭集：硬撕|拒签|揭穿假账|示弱钓鱼|当众对赌|借力第三方；须与【爽】动作一致。',
      ].join('\n')
      : '',
    titleSellCh1
      ? `第1章须在分章落地书名卖点（勿推到后文）：\n${titleSellCh1}`
      : '',
    '不要输出其他章，不要输出全书总纲。',
    NO_THINKING_OUTPUT_RULE,
  ].filter(Boolean).join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: 2048,
    temperature: 0.5,
  })
  const user = [
    args.title ? `【书名】${args.title}` : '',
    `【缺失】${args.missing.join('、') || '（无）'}`,
    args.invalid?.length ? `【须改正】${args.invalid.join('、')}` : '',
    '【该章原文】',
    section || `（大纲中尚无第${args.chapterNumber}章，请新建完整章块）`,
    '【前后文摘录】',
    args.outline.slice(0, 4000),
  ].filter(Boolean).join('\n\n')

  const filled = (await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      ...options,
      billing: args.billing
        ? { ...args.billing, reason: `小说大纲第${args.chapterNumber}章补全` }
        : undefined,
    },
  )).trim()

  if (!filled) return args.outline
  if (!section.trim()) {
    // append before end or after 分章概要
    if (/【分章概要】/.test(args.outline)) {
      return `${args.outline.trim()}\n\n${filled}`
    }
    return `${args.outline.trim()}\n\n【分章概要】\n${filled}`
  }
  return args.outline.replace(section, filled)
}

/** 生成大纲后：先确定性压短章标题，再总纲缺则补 1 次；仍缺则抛错 */
export async function ensureOutlineBookDramaFields(args: {
  outline: string
  title?: string
  premise?: string
  billing?: TextBillingContext
  novelGenreSkillKey?: string
}): Promise<string> {
  // 章标题与总纲 LLM 补全解耦：避免为改标题整本重写导致长大纲截断、总纲标签全丢
  let outline = normalizeOutlineChapterTitles(args.outline)
  let gaps = collectBookDramaGaps(outline, args.title, args.premise)
  if (gaps.ok) return normalizeOutlineChapterTitles(outline)
  outline = await fillMissingOutlineBookFields({
    outline,
    title: args.title,
    premise: args.premise,
    missing: gaps.missing,
    clicheHint: gaps.cliche,
    titleSellHints: gaps.titleSellReasons,
    billing: args.billing,
    novelGenreSkillKey: args.novelGenreSkillKey,
  })
  outline = normalizeOutlineChapterTitles(outline)
  gaps = collectBookDramaGaps(outline, args.title, args.premise)
  if (!gaps.ok) {
    const detail = [
      gaps.missing.join('、'),
      gaps.cliche || '',
      ...gaps.titleSellReasons,
    ].filter(Boolean).join('；')
    throw new OutlineDramaFieldsError(
      'outline_book_fields_incomplete',
      `请先完善小说大纲总纲：缺少 ${detail}`,
      gaps.missing,
    )
  }
  // 书名卖点补丁常只改【信息增量】，易留下空【主题回响】等；总纲过关后仍须补齐第1章戏剧标签
  const ch1 = assertOutlineChapterFields(outline, 1)
  if (!ch1.ok && sliceOutlineChapterSection(outline, 1).trim()) {
    outline = await fillMissingOutlineChapterFields({
      outline,
      chapterNumber: 1,
      missing: ch1.missing,
      invalid: ch1.invalid,
      title: args.title,
      premise: args.premise,
      billing: args.billing,
      novelGenreSkillKey: args.novelGenreSkillKey,
    })
    outline = normalizeOutlineChapterTitles(outline)
    const ch1Again = assertOutlineChapterFields(outline, 1)
    if (!ch1Again.ok) {
      throw new OutlineDramaFieldsError(
        'outline_chapter_fields_incomplete',
        `请先完善小说大纲第1章分章概要：缺少或须改正 ${[
          ...ch1Again.missing,
          ...ch1Again.invalid,
        ].join('、')}`,
        ch1Again.missing,
        ch1Again.invalid,
      )
    }
  }
  return outline
}

/** 写正文前：本章缺则补 1 次；仍缺则抛错。返回可能更新后的全书大纲与本章字段 */
export async function ensureOutlineChapterDramaFields(args: {
  outline: string
  chapterNumber: number
  title?: string
  premise?: string
  billing?: TextBillingContext
  novelGenreSkillKey?: string
}): Promise<{ outline: string; fields: OutlineChapterDramaFields }> {
  let outline = args.outline
  let check = assertOutlineChapterFields(outline, args.chapterNumber)
  if (!check.ok) {
    outline = await fillMissingOutlineChapterFields({
      outline,
      chapterNumber: args.chapterNumber,
      missing: check.missing,
      invalid: check.invalid,
      title: args.title,
      premise: args.premise,
      billing: args.billing,
      novelGenreSkillKey: args.novelGenreSkillKey,
    })
    check = assertOutlineChapterFields(outline, args.chapterNumber)
  }
  if (!check.ok || !check.fields) {
    throw new OutlineDramaFieldsError(
      'outline_chapter_fields_incomplete',
      `请先完善小说大纲第${args.chapterNumber}章分章概要：缺少或须改正 ${[
        ...check.missing,
        ...check.invalid.map((i) => {
          if (i.startsWith('爽型')) return i
          if (i.startsWith('赌注错位')) return i
          return `冲突层:${i}`
        }),
      ].join('、')}`,
      check.missing,
      check.invalid,
    )
  }
  return { outline, fields: check.fields }
}

/**
 * 写正文前：闸门开启则补全/校验总纲与本章；关闭则尽量解析字段（不抛错）。
 * 调用方若 outlineChanged，须把 meta.outline 写回 drama.metadata。
 */
export async function prepareOutlineDramaForChapterWrite(args: {
  meta: NovelMetadata
  chapterNumber: number
  title?: string
  billing?: TextBillingContext
  /** 旧版一行概要 / episode.description，仅作无戏剧块时的回退 */
  fallbackChapterOutline?: string
}): Promise<{
  meta: NovelMetadata
  fields: OutlineChapterDramaFields | null
  outlineChanged: boolean
  /** 写正文应使用的本章大纲（优先戏剧标签块） */
  writingChapterOutline: string
}> {
  const gate = isOutlineDramaGateEnabled(args.meta)
  let outline = (args.meta.outline || '').trim()
  const original = outline
  const fallback = (args.fallbackChapterOutline || '').trim()

  if (!gate) {
    if (!outline) {
      return {
        meta: args.meta,
        fields: null,
        outlineChanged: false,
        writingChapterOutline: fallback,
      }
    }
    const ch = assertOutlineChapterFields(outline, args.chapterNumber)
    const section = sliceOutlineChapterSection(outline, args.chapterNumber).trim()
    // 本章自定义大纲（episode.description）优先，避免 UI 已改金额却仍用全书旧切片
    const writingChapterOutline = preferCustomChapterOutline(fallback, section)
    return {
      meta: args.meta,
      fields: ch.fields,
      outlineChanged: false,
      writingChapterOutline,
    }
  }

  if (!outline) {
    throw new OutlineDramaFieldsError(
      'outline_book_fields_incomplete',
      '请先完善小说大纲（当前无全书大纲）',
      ['全书大纲'],
    )
  }

  outline = await ensureOutlineBookDramaFields({
    outline,
    title: args.title,
    premise: args.meta.premise,
    billing: args.billing,
    novelGenreSkillKey: resolveNovelGenreSkillKey(args.meta),
  })
  const ensured = await ensureOutlineChapterDramaFields({
    outline,
    chapterNumber: args.chapterNumber,
    title: args.title,
    premise: args.meta.premise,
    billing: args.billing,
    novelGenreSkillKey: resolveNovelGenreSkillKey(args.meta),
  })
  const outlineChanged = ensured.outline !== original
  const bookSection = sliceOutlineChapterSection(ensured.outline, args.chapterNumber).trim()
  // 本章自定义大纲优先于全书切片（UI「本章大纲」与写章源须一致）
  const writingChapterOutline = preferCustomChapterOutline(fallback, bookSection)
  return {
    meta: { ...args.meta, outline: ensured.outline },
    fields: ensured.fields,
    outlineChanged,
    writingChapterOutline,
  }
}
