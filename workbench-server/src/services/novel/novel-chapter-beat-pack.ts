/**
 * 本章大纲驱动分拍编排：硬合同校验 + 软编排(LLM) + 计量兜底。
 * 不重写章纲/书纲；只决定 mustLand 进哪拍与字重。
 */
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { buildNovelAgentSystem, novelAgentCompletionOptions } from './novel-agent-prompt.js'
import { extractTagBlock, sliceOutlineChapterSection } from './novel-outline-drama-fields.js'
import { splitInfoDeltaPointsForCover } from './novel-outline-beat-cover.js'
import {
  EMOTION_BEAT_PHASES,
  type EmotionBeatPhase,
  isEmotionBeatPhase,
  shouldBindEmotionBeats,
} from './novel-chapter-emotion-beats.js'

export type BeatPackItem = {
  phase: EmotionBeatPhase
  focus: string
  mustLand: string[]
  weightHint: number
}

export type ChapterBeatPack = {
  source: 'soft' | 'measured_fallback'
  beats: BeatPackItem[]
}

export type BeatPackValidateResult = {
  ok: boolean
  reasons: string[]
}

const DRAMA_LABELS = [
  '本章起因',
  '欲望',
  '阻碍',
  '局面变化',
  '人物选择',
  '章末问题',
  '主题回响',
] as const

const PHASE_RANK: Record<EmotionBeatPhase, number> = {
  恨: 0,
  爽: 1,
  急: 2,
  盼: 3,
}

function tagVal(outline: string, chapterNumber: number, label: string): string {
  const section = sliceOutlineChapterSection(outline, chapterNumber)
  const scope = (section && section.trim()) ? section : outline
  return (extractTagBlock(scope, label) || extractTagBlock(outline, label) || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function compact(s: string): string {
  return (s || '').replace(/\s+/g, '')
}

function charLen(s: string): number {
  return [...(s || '')].length
}

/** 本章须覆盖的大纲原文片段（信息增量拆条 + 戏剧/情绪场） */
export function collectChapterOutlineMustCoverFragments(
  chapterOutline: string,
  chapterNumber: number,
): string[] {
  const outline = (chapterOutline || '').trim()
  if (!outline) return []
  const out: string[] = []
  const push = (raw: string) => {
    const t = (raw || '').replace(/\s+/g, ' ').trim()
    if (charLen(t) < 4) return
    if (out.some(x => compact(x) === compact(t))) return
    out.push(t)
  }

  const info = tagVal(outline, chapterNumber, '信息增量')
  for (const p of splitInfoDeltaPointsForCover(info, 8)) push(p)

  for (const label of DRAMA_LABELS) push(tagVal(outline, chapterNumber, label))

  for (const phase of EMOTION_BEAT_PHASES) {
    const v = tagVal(outline, chapterNumber, phase)
    if (charLen(v) >= 8) push(v)
  }
  return out
}

function fragmentCoveredByMustLand(fragment: string, mustLands: string[]): boolean {
  const f = compact(fragment)
  if (charLen(f) < 4) return true
  return mustLands.some((m) => {
    const c = compact(m)
    if (charLen(c) < 4) return false
    return c.includes(f) || f.includes(c)
  })
}

function normalizeWeights(beats: BeatPackItem[]): BeatPackItem[] {
  const clamped = beats.map((b) => ({
    ...b,
    weightHint: Math.min(0.5, Math.max(0.08, Number(b.weightHint) || 0.1)),
    mustLand: (b.mustLand || []).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => charLen(s) >= 2),
    focus: (b.focus || '').replace(/\s+/g, ' ').trim() || `本拍演${b.phase}`,
  }))
  const sum = clamped.reduce((a, b) => a + b.weightHint, 0) || 1
  return clamped.map(b => ({ ...b, weightHint: b.weightHint / sum }))
}

/** 硬合同：顺序、覆盖、拍数、mustLand 须为大纲子串 */
export function validateBeatPack(
  pack: ChapterBeatPack,
  fragments: string[],
  outline: string,
): BeatPackValidateResult {
  const reasons: string[] = []
  const beats = pack?.beats || []
  if (beats.length < 3 || beats.length > 6) {
    reasons.push(`拍数须 3～6，got ${beats.length}`)
  }
  let prevRank = -1
  const seenPhases = new Set<EmotionBeatPhase>()
  for (const b of beats) {
    if (!isEmotionBeatPhase(b.phase)) {
      reasons.push(`非法相位: ${b.phase}`)
      continue
    }
    const r = PHASE_RANK[b.phase]
    if (r < prevRank) reasons.push(`相位顺序倒退: ${b.phase}`)
    prevRank = Math.max(prevRank, r)
    seenPhases.add(b.phase)
  }
  for (const p of EMOTION_BEAT_PHASES) {
    if (!seenPhases.has(p)) reasons.push(`缺少相位: ${p}`)
  }

  const outlineCompact = compact(outline)
  const allMust: string[] = []
  for (const b of beats) {
    for (const m of b.mustLand || []) {
      allMust.push(m)
      const mc = compact(m)
      if (charLen(mc) >= 4 && outlineCompact && !outlineCompact.includes(mc)) {
        // 允许片段为信息增量拆条（仍应在大纲中）
        if (!outlineCompact.includes(mc.slice(0, Math.min(12, mc.length)))) {
          reasons.push(`mustLand 非大纲子串: ${m.slice(0, 24)}`)
        }
      }
    }
  }

  for (const frag of fragments) {
    if (!fragmentCoveredByMustLand(frag, allMust)) {
      reasons.push(`未覆盖大纲片段: ${frag.slice(0, 36)}`)
    }
  }

  const sumW = beats.reduce((a, b) => a + (Number(b.weightHint) || 0), 0)
  if (beats.length && (sumW < 0.85 || sumW > 1.15)) {
    // 允许未归一；校验前可 normalize。此处仅拦极端
    if (sumW <= 0) reasons.push('字重和无效')
  }

  return { ok: reasons.length === 0, reasons }
}

function assignPhaseForFragment(labelHint: string, text: string): EmotionBeatPhase {
  if (labelHint === '信息增量' || /补上|揭穿|识破|投效|累计/.test(text)) return '爽'
  if (labelHint === '章末问题' || labelHint === '主题回响') return '盼'
  if (labelHint === '局面变化' || labelHint === '人物选择') return '爽'
  if (labelHint === '本章起因' || labelHint === '阻碍' || labelHint === '欲望') return '恨'
  if (labelHint === '急' || labelHint === '盼') return labelHint
  if (labelHint === '恨' || labelHint === '爽') return labelHint
  return '恨'
}

/**
 * 计量兜底：不调模型；片段按启发式进拍，字重按 mustLand 字量。
 */
export function buildMeasuredFallbackBeatPack(args: {
  chapterOutline: string
  chapterNumber: number
  fragments?: string[]
}): ChapterBeatPack {
  const outline = (args.chapterOutline || '').trim()
  const ch = args.chapterNumber
  const buckets: Record<EmotionBeatPhase, string[]> = {
    恨: [],
    爽: [],
    急: [],
    盼: [],
  }
  const push = (phase: EmotionBeatPhase, text: string) => {
    const t = text.replace(/\s+/g, ' ').trim()
    if (charLen(t) < 4) return
    if (buckets[phase].some(x => compact(x) === compact(t))) return
    buckets[phase].push(t)
  }

  const info = tagVal(outline, ch, '信息增量')
  for (const p of splitInfoDeltaPointsForCover(info, 8)) push('爽', p)

  for (const label of DRAMA_LABELS) {
    const v = tagVal(outline, ch, label)
    if (!v) continue
    push(assignPhaseForFragment(label, v), v)
  }
  for (const phase of EMOTION_BEAT_PHASES) {
    const v = tagVal(outline, ch, phase)
    if (charLen(v) >= 8) push(phase, v)
  }

  // 信息增量很多时拆爽为子拍；空拍允许 mustLand=[]（仍保留相位）
  const beats: BeatPackItem[] = []
  const shuang = buckets.爽
  const focusOf = (phase: EmotionBeatPhase): string =>
    phase === '恨'
      ? '冲突前置，压迫落地'
      : phase === '爽'
        ? '动作翻盘与信息增量'
        : phase === '急'
          ? '加压未决'
          : '短缺一环收束'

  if (shuang.length >= 4) {
    const mid = Math.ceil(shuang.length / 2)
    beats.push({ phase: '恨', focus: focusOf('恨'), mustLand: buckets.恨, weightHint: 0.3 })
    beats.push({
      phase: '爽',
      focus: '信息增量与动作翻盘（前半）',
      mustLand: shuang.slice(0, mid),
      weightHint: 0.22,
    })
    beats.push({
      phase: '爽',
      focus: '信息增量与局面变化（后半）',
      mustLand: shuang.slice(mid),
      weightHint: 0.2,
    })
    beats.push({ phase: '急', focus: focusOf('急'), mustLand: buckets.急, weightHint: 0.16 })
    beats.push({ phase: '盼', focus: focusOf('盼'), mustLand: buckets.盼, weightHint: 0.12 })
  } else {
    for (const phase of EMOTION_BEAT_PHASES) {
      beats.push({
        phase,
        focus: focusOf(phase),
        mustLand: buckets[phase],
        weightHint: 0.25,
      })
    }
  }

  // 按 mustLand 字量重分配字重
  const sizes = beats.map(b => Math.max(8, b.mustLand.reduce((a, t) => a + charLen(t), 0)))
  const sum = sizes.reduce((a, b) => a + b, 0) || 1
  const weighted = beats.map((b, i) => ({
    ...b,
    weightHint: sizes[i]! / sum,
  }))

  return {
    source: 'measured_fallback',
    beats: normalizeWeights(weighted),
  }
}

function extractJsonObject(raw: string): unknown {
  const t = (raw || '').trim()
  if (!t) return null
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(t.slice(start, end + 1))
  } catch {
    return null
  }
}

export function parseSoftBeatPackJson(raw: string): ChapterBeatPack | null {
  const obj = extractJsonObject(raw) as { beats?: unknown } | null
  if (!obj || !Array.isArray(obj.beats) || !obj.beats.length) return null
  const beats: BeatPackItem[] = []
  for (const row of obj.beats) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const phase = String(r.phase || '')
    if (!isEmotionBeatPhase(phase)) continue
    const mustLand = Array.isArray(r.mustLand)
      ? r.mustLand.map(x => String(x || '').trim()).filter(Boolean)
      : []
    beats.push({
      phase,
      focus: String(r.focus || '').trim(),
      mustLand,
      weightHint: Number(r.weightHint) || 0.2,
    })
  }
  if (beats.length < 3) return null
  return { source: 'soft', beats: normalizeWeights(beats) }
}

async function softPackChapterBeats(args: {
  chapterOutline: string
  chapterNumber: number
  fragments: string[]
  userTarget: number
  billing?: TextBillingContext
  novelGenreSkillKey?: string
}): Promise<ChapterBeatPack | null> {
  const system = [
    await buildNovelAgentSystem('novel_chapter_writer', {
      novelGenreSkillKey: args.novelGenreSkillKey,
    }),
    '你是分拍编排器，不是写手。只输出 JSON，不要小说正文。',
    '任务：把【本章大纲须覆盖片段】分配进 3～6 个情绪拍（恨→爽→急→盼，可同相拆子拍）。',
    '硬性：mustLand 必须是片段列表中的原文或原文子串；禁止发明情节；须覆盖全部片段；相位顺序不倒退；须含恨爽急盼。',
  ].join('\n')

  const user = [
    `【章号】第${args.chapterNumber}章`,
    `【目标字数】${args.userTarget}`,
    '【本章大纲须覆盖片段】',
    ...args.fragments.map((f, i) => `${i + 1}. ${f}`),
    '【本章大纲原文】',
    args.chapterOutline.trim().slice(0, 6000),
    '【输出格式】仅 JSON：{"beats":[{"phase":"恨|爽|急|盼","focus":"一句话","mustLand":["片段原文"],"weightHint":0.0}]}',
    'weightHint 为相对比例（稍后归一化）；密场可提高对应拍 weightHint 并拆子拍。',
  ].join('\n')

  const options = await novelAgentCompletionOptions('novel_chapter_writer', {
    maxTokens: 2048,
    temperature: 0.2,
  })
  const raw = await chatCompletionText(
    [{ role: 'system', content: system }, { role: 'user', content: user }],
    {
      ...options,
      billing: args.billing
        ? { ...args.billing, reason: args.billing.reason || '小说分拍软编排' }
        : undefined,
      minimaxReasoningEffort: 'low',
    },
  )
  return parseSoftBeatPackJson(raw)
}

/**
 * 写前编排：软编排 → 硬校验 → 失败则计量兜底。
 * 非 1～8 章返回 null（调用方走旧预算）。
 */
export async function resolveChapterOutlineBeatPack(args: {
  chapterOutline: string
  chapterNumber: number
  userTarget?: number
  billing?: TextBillingContext
  novelGenreSkillKey?: string
  /** 测试/降级：跳过 LLM */
  skipSoft?: boolean
}): Promise<ChapterBeatPack | null> {
  if (!shouldBindEmotionBeats(args.chapterNumber)) return null
  const outline = (args.chapterOutline || '').trim()
  if (!outline) return null

  const fragments = collectChapterOutlineMustCoverFragments(outline, args.chapterNumber)
  const userTarget = Math.min(20000, Math.max(500, Math.round(Number(args.userTarget)) || 3000))

  if (!args.skipSoft && fragments.length) {
    try {
      const soft = await softPackChapterBeats({
        chapterOutline: outline,
        chapterNumber: args.chapterNumber,
        fragments,
        userTarget,
        billing: args.billing,
        novelGenreSkillKey: args.novelGenreSkillKey,
      })
      if (soft) {
        const v = validateBeatPack(soft, fragments, outline)
        if (v.ok) return soft
      }
    } catch {
      // 软编排失败走兜底
    }
  }

  const fallback = buildMeasuredFallbackBeatPack({
    chapterOutline: outline,
    chapterNumber: args.chapterNumber,
    fragments,
  })
  // 兜底对「本拍演X」占位不要求覆盖真实片段时：把未覆盖片段并入爽/恨
  const v = validateBeatPack(fallback, fragments, outline)
  if (v.ok) return fallback

  const allMust = fallback.beats.flatMap(b => b.mustLand)
  for (const frag of fragments) {
    if (!fragmentCoveredByMustLand(frag, allMust)) {
      fallback.beats[1]!.mustLand.push(frag) // 爽
    }
  }
  return {
    source: 'measured_fallback',
    beats: normalizeWeights(fallback.beats),
  }
}
