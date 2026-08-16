/**
 * 第1～8章：分拍节点绑定恨→爽→急→盼（读者情绪四拍）。
 * 合同主轴：EmotionCoreContract SSOT（题材无关三刀）——见 novel-emotion-core-contract.ts
 * 优先读大纲显式【恨】【爽】【急】【盼】；缺省时回退戏剧标签映射。
 */
import { extractTagBlock, sliceOutlineChapterSection } from './novel-outline-drama-fields.js'
import { outlineCatalystCoveredIn } from './novel-outline-beat-cover.js'
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
}

/**
 * 从本章大纲拼出四拍任务。
 * 优先【恨】【爽】【急】【盼】正文；辅以戏剧标签与待落起因。
 */
export function buildEmotionBeatSpecs(args: {
  chapterOutline: string
  chapterNumber: number
  prevChapterTail?: string
}): EmotionBeatSpec[] {
  const outline = (args.chapterOutline || '').trim()
  const ch = args.chapterNumber
  const prev = args.prevChapterTail || ''

  const cast = tagValForChapter(outline, ch, '本章人物')
  const catalyst = tagValForChapter(outline, ch, '本章起因')
  const desire = tagValForChapter(outline, ch, '欲望')
  const obstacle = tagValForChapter(outline, ch, '阻碍')
  const stakes = tagValForChapter(outline, ch, '局面变化')
  const choice = tagValForChapter(outline, ch, '人物选择')
  const endingQ = tagValForChapter(outline, ch, '章末问题')
  const infoDelta = tagValForChapter(outline, ch, '信息增量')
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

  const hateLines = [
    '【恨】冲突前置（本拍只演恨）',
    hateTag ? clipEmotionOutlineSeed('恨', hateTag) : '',
    cast ? `在场：${cast}` : '',
    catalystPending ? `压迫推进：${catalystPending}` : '',
    !hateTag && obstacle ? `压迫：${obstacle}` : '',
    !hateTag && desire ? `伤到的欲望：${desire}` : '',
    emotionCraft ? `调性：${emotionCraft}` : '',
    !hateTag && !obstacle && legacy[0] ? `压迫场面：${legacy[0]}` : '',
    buildEmotionCorePhaseHardLine('恨'),
  ].filter(Boolean)

  const shuangLines = [
    '【爽】动作震慑 + 本事露尖（本拍只演爽；立约可留但不得单独当爽）',
    shuangTag ? clipEmotionOutlineSeed('爽', shuangTag) : '',
    shuangType ? `爽型：${shuangType}` : '',
    cast ? `在场：${cast}` : '',
    !shuangTag && choice ? `硬动作：${choice}` : '',
    !shuangTag && stakes ? `翻转：${stakes}` : '',
    !shuangTag && !choice && legacy[1] ? `硬刚：${legacy[1]}` : '',
    buildEmotionCorePhaseHardLine('爽'),
  ].filter(Boolean)

  const jiLines = [
    '【急】尖期限（本拍开口不收束）',
    jiTag ? clipEmotionOutlineSeed('急', jiTag) : '',
    !jiTag && endingQ ? `未决：${endingQ}` : '',
    !jiTag && !endingQ && legacy[2] ? `加码：${legacy[2]}` : '',
    buildEmotionCorePhaseHardLine('急'),
  ].filter(Boolean)

  const panLines = [
    '【盼】短复验或缺一环（短；非金手指首亮）',
    panTag ? clipEmotionOutlineSeed('盼', panTag) : '',
    !panTag && infoDelta ? `方向：${infoDelta}` : '',
    !panTag && !infoDelta && legacy[3] ? `结论：${legacy[3]}` : '',
    cast ? `人物对齐：${cast}` : '',
    buildEmotionCorePhaseHardLine('盼'),
  ].filter(Boolean)

  return [
    { phase: '恨', tag: '恨', beat: hateLines.join('\n') },
    { phase: '爽', tag: '爽', beat: shuangLines.join('\n') },
    { phase: '急', tag: '急', beat: jiLines.join('\n') },
    { phase: '盼', tag: '盼', beat: panLines.join('\n') },
  ]
}

/** 单拍生成时追加的硬规则（动态注入，只含本拍；同源 SSOT） */
export function buildEmotionBeatHardRule(phase: EmotionBeatPhase): string {
  return buildEmotionCorePhaseHardRule(phase as EmotionCorePhase)
}
