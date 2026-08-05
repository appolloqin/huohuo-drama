/**
 * 大纲戏剧要素补全与写前闸门
 */
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { NO_THINKING_OUTPUT_RULE } from '../../common/novel/novel-creative-output.js'
import {
  assertOutlineBookFields,
  assertOutlineChapterFields,
  OUTLINE_CHAPTER_FIELD_LABELS,
  sliceOutlineChapterSection,
  type OutlineChapterDramaFields,
} from './novel-outline-drama-fields.js'
import { isOutlineDramaGateEnabled, type NovelMetadata } from '../../common/novel/novel-meta.js'

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

export async function fillMissingOutlineBookFields(args: {
  outline: string
  title?: string
  premise?: string
  missing: string[]
  billing?: TextBillingContext
}): Promise<string> {
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    '任务：只补全全书大纲中缺失的总纲戏剧标签，保留原文其余部分。',
    '必须输出**完整大纲全文**（在原文基础上插入/补齐标签），不要只输出补丁。',
    NO_THINKING_OUTPUT_RULE,
  ].join('\n')
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
  return (raw || '').trim() || args.outline
}

export async function fillMissingOutlineChapterFields(args: {
  outline: string
  chapterNumber: number
  missing: string[]
  invalid?: string[]
  title?: string
  billing?: TextBillingContext
}): Promise<string> {
  const section = sliceOutlineChapterSection(args.outline, args.chapterNumber)
  const system = [
    await buildNovelAgentSystem('novel_outline'),
    `任务：只补全第 ${args.chapterNumber} 章分章概要中缺失的戏剧标签。`,
    `须输出该章完整块：以「第${args.chapterNumber}章」开头，含标题与全部标签：${OUTLINE_CHAPTER_FIELD_LABELS.join('、')}。`,
    '【冲突层】只能用：外部、人际、自我。',
    '不要输出其他章，不要输出全书总纲。',
    NO_THINKING_OUTPUT_RULE,
  ].join('\n')
  const options = await novelAgentCompletionOptions('novel_outline', {
    maxTokens: 2048,
    temperature: 0.5,
  })
  const user = [
    args.title ? `【书名】${args.title}` : '',
    `【缺失】${args.missing.join('、') || '（无）'}`,
    args.invalid?.length ? `【非法冲突层】${args.invalid.join('、')}` : '',
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

/** 生成大纲后：总纲缺则补 1 次；仍缺则抛错 */
export async function ensureOutlineBookDramaFields(args: {
  outline: string
  title?: string
  premise?: string
  billing?: TextBillingContext
}): Promise<string> {
  let outline = args.outline
  let check = assertOutlineBookFields(outline)
  if (check.ok) return outline
  outline = await fillMissingOutlineBookFields({
    outline,
    title: args.title,
    premise: args.premise,
    missing: check.missing,
    billing: args.billing,
  })
  check = assertOutlineBookFields(outline)
  if (!check.ok) {
    throw new OutlineDramaFieldsError(
      'outline_book_fields_incomplete',
      `请先完善小说大纲总纲：缺少 ${check.missing.join('、')}`,
      check.missing,
    )
  }
  return outline
}

/** 写正文前：本章缺则补 1 次；仍缺则抛错。返回可能更新后的全书大纲与本章字段 */
export async function ensureOutlineChapterDramaFields(args: {
  outline: string
  chapterNumber: number
  title?: string
  billing?: TextBillingContext
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
      billing: args.billing,
    })
    check = assertOutlineChapterFields(outline, args.chapterNumber)
  }
  if (!check.ok || !check.fields) {
    throw new OutlineDramaFieldsError(
      'outline_chapter_fields_incomplete',
      `请先完善小说大纲第${args.chapterNumber}章分章概要：缺少 ${[...check.missing, ...check.invalid.map(i => `冲突层:${i}`)].join('、')}`,
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
    return {
      meta: args.meta,
      fields: ch.fields,
      outlineChanged: false,
      writingChapterOutline: ch.ok && section ? section : fallback,
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
  })
  const ensured = await ensureOutlineChapterDramaFields({
    outline,
    chapterNumber: args.chapterNumber,
    title: args.title,
    billing: args.billing,
  })
  const outlineChanged = ensured.outline !== original
  const writingChapterOutline = sliceOutlineChapterSection(ensured.outline, args.chapterNumber).trim()
    || fallback
  return {
    meta: { ...args.meta, outline: ensured.outline },
    fields: ensured.fields,
    outlineChanged,
    writingChapterOutline,
  }
}
