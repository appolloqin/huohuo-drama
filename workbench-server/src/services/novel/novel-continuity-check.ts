/**
 * 小说章节一致性审校 — 三层：硬审 / 规则审 / 模型审
 */
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import {
  formatContinuityBlockingItem,
  formatContinuityRuleHint,
  continuityRuleLabel,
  continuityLayerLabel,
  type ContinuityBlockingItem,
} from '../../common/novel/novel-continuity-rules.js'
import type { NovelMetadata } from '../../common/novel/novel-meta.js'
import { resolveContinuityMinScore } from '../../common/novel/novel-meta.js'
import { extractOutlineWorldBlock } from '../../common/novel/novel-worldbuilding.js'
import {
  buildSerialWrittenContextBlock,
  buildCanonLockPrefix,
  loadPrevChapterContentTail,
  resolveContinuityInjectBlock,
  resolveExpectedContinuityFields,
} from './novel-continuity.js'
import {
  formatHardAuditBlock,
  formatRuleAuditBlock,
  runLocalContinuityAudit,
  type AuditConflict,
} from './novel-continuity-precheck.js'
import {
  formatCausalHardBlock,
  formatCausalRuleBlock,
  isCausalChainEnabled,
  readCausalChain,
  runCausalChainAudit,
  CAUSAL_CHAPTER_END_FORMAT,
} from './novel-causal-chain/index.js'

import {
  formatContinuityStateBlock,
  type ContinuityAuditBreakdown,
  type ContinuityAuditItem,
  type ContinuityCheckResult,
  type ContinuityRewriteLogEntry,
  type NovelContinuityFields,
} from '../../common/novel/novel-continuity-state.js'

export type { ContinuityCheckResult } from '../../common/novel/novel-continuity-state.js'
export type { ContinuityBlockingItem } from '../../common/novel/novel-continuity-rules.js'
export { formatContinuityBlockingItem, continuityRuleLabel, continuityLayerLabel } from '../../common/novel/novel-continuity-rules.js'

function classifyModelConflictRule(message: string): string {
  if (/吃书|场景|逻辑|剧情|须立即|下章|顺绳|溪边|踪迹|锁定事实|黑松林|断崖|绳索|发现.*踪迹|行动线|地点/.test(message)) {
    return 'model_semantic_plot'
  }
  if (/境界|修为|realm|层|圆满|巅峰|突破|境/.test(message)) {
    return 'model_semantic_realm'
  }
  return 'model_semantic'
}

function trunc(s: string, max: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

const CHECK_SYSTEM_STATE = `你是网文 continuity 审校编辑（模型审）。只抓**必须改**的硬伤，勿过度审查。

**硬审/规则审**已由程序完成；你负责语义类硬伤，重点：
- 吃书：与【前序已写章节】/【因果起点】在**人名、关键事件、施动者**上矛盾
- 跨章回忆/闪回：坠崖、推下、仇敌等关键情节的人物与上章不一致
- **因果缺失**：正文状态变化但【变更记录】无对应因果链（硬审已列的勿重复）
- 关键剧情矛盾：正文与**已成文**冲突（大纲/概要与之矛盾时不算硬伤，以已成文为准）
- 章内复杂自洽：旁白/对话/心理在情节事实上矛盾

**境界语义补审**（硬审已做的层数/圆满/跨章倒退**勿重复**；你补硬审抓不到的语义层）：
- 对照【应对齐的状态】realm 与正文**主角**战力/能力/描写是否明显脱节（须附摘录）
- 对照【世界观设定】修炼体系：是否混用大纲未列 major 境名或别称（如大纲定「凝气」却写「炼气」）
- 非标准表述（半步某境、触碰到某境门槛、堪比某境修士等）：与账本/上章结尾是否矛盾，且无突破或变故交代
- 【规则审】中 realm/境界 相关提示：若能在正文摘录连续矛盾，**须**写入 conflicts；无摘录则仅写在 summary
- 硬审已列条目：**勿改判通过、勿重复报**；硬审未覆盖且正文有明确摘录矛盾时才报境界

**不要**列入 conflicts（可写在 summary 作参考）：
- **章内/章末合法突破、晋级**（章初低、章末高且有过程；章末高于账本属正常升级）
- **重修、废修为、散功、打落境界**等合法下降（章初/章末低于上章账本，正文或账本已交代）
- 章初/章末**高于**上章账本或上章结尾（升级衔接），只要正文有突破/承接描写
- 仅形容**他人**境界、回忆、假设、修辞性对比（非主角当前境）
- 措辞风格、次要称呼差异、无摘录的推测性疑点

**每条 conflict 必须**：
1. 说明矛盾点（境界类请注明应对齐的账本/世界观表述）
2. 附可核对正文摘录，格式：摘录「……」——须为待审校正文中连续 8 字以上的原文
无摘录的条目不要输出。

只输出 JSON，不要 markdown：
{
  "passed": true/false,
  "score": 0-100,
  "conflicts": ["硬伤描述 + 摘录「……」", ...],
  "summary": "一句话结论"
}

评分：90+ 无硬伤；80-89 有小瑕疵但可发布；<75 须修正。
passed：无硬伤且 score>=75 时为 true；有小瑕疵时 conflicts 应为空数组。`

const CHECK_SYSTEM_CAUSAL = `你是网文 continuity 审校编辑（因果链模式）。只抓必须改的硬伤。

核心：允许境界/能力/场景变化，禁止无因果变化。勿用「账本终态冻结」「须保持凡人/严禁灵力」「一致性提醒中暂未突破至某境」拦截——【变更记录】或正文写清触发→过程→代价即合法。

**境界/突破（须遵守）**：
- 同 major 境内升/降层、重、级（如淬体一重→三重）**合法**，有承接、过程、原因或【变更记录】因果即可
- 跨 major 境突破（如淬体→凝气）**也合法**，只要【变更记录】写清因果；勿因旧账本写「暂未突破至凝气」就判硬伤
- **禁止**把「禁止突破至凝气」类提醒套用到仍在淬体境内的连破
- 仅当正文**实际写入**与【变更记录】矛盾的 major 境名（如记录写淬体、正文无因果却写凝气一层）才报

须拦：吃书（人名/事件/地点与【因果起点】【前序正文】矛盾）；正文状态变化但【变更记录】无因果；章内事实矛盾。
勿拦：合法突破/连破（有因果）；与旧15维账本/一致性提醒不一致。

**勿拦（创作层面，不是 continuity 硬伤）**：
- 本章大纲/写作说明的**篇幅比例、详略、节奏**（如「40% 聚焦夜潜过程」「前半章写 XX」）——审校**不管**结构配比
- 【因果起点】写「移动中/进行中」，正文用一两句承接跳过路程：只要有时间/位置衔接或【变更记录】说明即可
- 大纲要求的场景展开「不够细」：最多写在 summary 作建议，**禁止**写入 conflicts

每条 conflict 须附正文摘录「……」（8字+）。

只输出 JSON，不要 markdown；**score 必填**（0–100 整数）：
{
  "passed": true/false,
  "score": 0-100,
  "conflicts": ["硬伤 + 摘录「……」", ...],
  "summary": "一句话结论"
}

passed：无硬伤且 score≥78 时为 true；有小瑕疵时 conflicts 应为空数组。`

function buildCheckSystem(causalMode?: boolean, minScore = 78): string {
  if (causalMode) {
    return CHECK_SYSTEM_CAUSAL.replace('score≥78', `score≥${minScore}`)
  }
  return CHECK_SYSTEM_STATE.replace('score>=75', `score>=${minScore}`)
}

function parseCheckResponse(text: string): {
  passed?: boolean
  score?: number
  conflicts?: string[]
  summary?: string
} | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function toAuditItems(conflicts: AuditConflict[]): ContinuityAuditItem[] {
  return conflicts.map(c => ({ rule: c.rule, message: c.message }))
}

/** 模型 conflict 须含可核对正文摘录 */
export function modelConflictHasExcerpt(message: string, content: string): boolean {
  const quotes = [...message.matchAll(/「([^」]{8,})」|『([^』]{8,})』|"([^"]{8,})"|摘录[：:]\s*「([^」]{8,})」/g)]
  for (const m of quotes) {
    const q = (m[1] || m[2] || m[3] || m[4] || '').trim()
    if (q.length >= 8 && content.includes(q.slice(0, Math.min(q.length, 24)))) return true
  }
  return false
}

function extractConflictNameHints(message: string): string[] {
  const names = new Set<string>()
  for (const m of message.matchAll(/[「『""]([\u4e00-\u9fa5]{2,4})[」』""]/g)) {
    names.add(m[1])
  }
  const tailRef = message.match(/正文(?:结尾|末尾|末|).{0,16}?([\u4e00-\u9fa5]{2,4})/)
  if (tailRef) names.add(tailRef[1])
  for (const m of message.matchAll(/(?:记载|击败|含|与)([\u4e00-\u9fa5]{2,4})/g)) {
    if (m[1].length >= 2) names.add(m[1])
  }
  return [...names]
}

/** 模型报吃书但未附摘录时，从正文末（尤其章尾）自动补可核对摘录，避免「缺摘录」死循环 */
export function tryAttachContentExcerpt(message: string, content: string): string | null {
  if (modelConflictHasExcerpt(message, content)) return message
  if (!/吃书|状态矛盾|矛盾|不一致|冲突/.test(message)) return null

  const names = extractConflictNameHints(message)
  if (!names.length) return null

  const tail = content.slice(-Math.max(2800, Math.floor(content.length * 0.32)))
  for (const name of names) {
    if (!tail.includes(name)) continue
    const segments = tail.split(/(?<=[。！？\n])/).map(s => s.trim()).filter(Boolean)
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]
      if (!seg.includes(name)) continue
      const plain = seg.replace(/\s/g, '')
      if (plain.length < 8) continue
      const excerpt = seg.length > 140 ? seg.slice(0, 140) : seg
      const enriched = `${message.replace(/\s+$/, '')} 摘录「${excerpt}」`
      if (modelConflictHasExcerpt(enriched, content)) return enriched
    }
  }
  return null
}

function filterModelConflicts(
  raw: string[],
  content: string,
): { accepted: string[], rejected: string[] } {
  const accepted: string[] = []
  const rejected: string[] = []
  for (const c of raw) {
    const t = c.trim()
    if (!t) continue
    const enriched = tryAttachContentExcerpt(t, content) ?? t
    if (modelConflictHasExcerpt(enriched, content)) accepted.push(enriched)
    else rejected.push(t)
  }
  return { accepted, rejected: [...new Set(rejected)] }
}

/** 因果链模式：旧账本/一致性提醒驱动的冻结式疑点（含误用「禁止突破至凝气」拦淬体连破） */
export function isLedgerFreezeModelConflict(message: string): boolean {
  if (/账本(?:要求|记载|vs|对比|明确)|终态为|严禁出现|须保持.*凡人|状态冻结|一致性提醒|【一致性提醒】|禁止突破至|暂未(?:突破|破境)|未正式突破|须对齐(?:的)?(?:状态)?账本|应对齐的状态账本|章末状态账本|状态账本.*禁止|违反.*一致性提醒/i.test(message)) {
    return true
  }
  // 提醒禁止破至凝气，但所谓违规实为淬体境内连破
  if (/禁止.*凝气|暂未.*凝气|未正式突破.*凝气/.test(message)
    && /淬体(?:境)?[一二三四五六七八九十\d]+重/.test(message)
    && /连破|达到|升至|突破.*淬体|淬体.*→/.test(message)) {
    return true
  }
  return false
}

function filterCausalModelMessages(raw: string[], content: string): {
  accepted: string[]
  rejected: string[]
} {
  const filtered = raw.filter(c =>
    !isLedgerFreezeModelConflict(c) && !isOutlineStructureModelConflict(c),
  )
  return filterModelConflicts(filtered, content)
}

/** 因果链模式：大纲/写作说明的篇幅比例、详略要求，非 continuity 硬伤 */
export function isOutlineStructureModelConflict(message: string): boolean {
  if (/(?:\d{1,3})%|(?:\d{1,3})成(?:篇幅)?/.test(message) && /大纲|说明|聚焦|描写|篇幅|过程/.test(message)) {
    return true
  }
  if (/大纲(?:\/|、)?(?:说明)?.*要求|说明要求描写|写作说明.*要求|要求描写.*过程/.test(message)) {
    return true
  }
  if (/聚焦.*过程|篇幅.*(?:不足|分配|占比)|详略|节奏.*(?:不符|偏离)|结构.*(?:不符|偏离)/.test(message)
    && /大纲|说明|要求|聚焦|篇幅/.test(message)) {
    return true
  }
  // 「大纲/说明要求 A，正文却直接/未详写 B」类——属创作配比，非吃书
  if (/正文却直接|未(?:充分|详细)?(?:描写|展开)|缺少.*过程|一笔带过/.test(message)
    && /大纲|说明|要求|40%|聚焦|篇幅|写作/.test(message)) {
    return true
  }
  if (/【因果起点】.*(?:大纲|说明).*要求/.test(message)) {
    return true
  }
  return false
}

function buildBlockingItems(
  hard: AuditConflict[],
  modelItems: ContinuityAuditItem[],
): ContinuityBlockingItem[] {
  const items: ContinuityBlockingItem[] = []
  for (const c of hard) {
    items.push({
      layer: 'hard',
      rule: c.rule,
      label: continuityRuleLabel(c.rule),
      message: c.message,
    })
  }
  for (const c of modelItems) {
    items.push({
      layer: 'model',
      rule: c.rule,
      label: continuityRuleLabel(c.rule),
      message: c.message,
    })
  }
  return items
}

function syncCheckConflicts(items: ContinuityBlockingItem[]): string[] {
  return items.map(formatContinuityBlockingItem)
}

function isGenericCheckSummary(summary: string | undefined): boolean {
  if (!summary?.trim()) return true
  const t = summary.trim()
  return t === '存在一致性问题'
    || t === '无明显冲突'
    || t === '审校未通过，详见规则明细'
}

/** 模型常漏填 score → 按 passed / conflicts 推断，避免误判为 0 分 */
function resolveParsedCheckScore(
  parsed: NonNullable<ReturnType<typeof parseCheckResponse>>,
  minScore: number,
): { score: number; scoreInferred: boolean } {
  const raw = parsed.score
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) {
    return { score: Math.min(100, Math.max(0, Math.round(n))), scoreInferred: false }
  }
  const hasConflicts = (parsed.conflicts || []).some(c => typeof c === 'string' && c.trim())
  if (parsed.passed === true && !hasConflicts) {
    return { score: Math.max(minScore, 82), scoreInferred: true }
  }
  if (parsed.passed === false) {
    return { score: Math.max(0, minScore - 1), scoreInferred: true }
  }
  if (!hasConflicts) {
    return { score: minScore, scoreInferred: true }
  }
  return { score: Math.max(0, minScore - 5), scoreInferred: true }
}

/** 无 blocking 项但未通过时，生成可展示的失败原因（UI / 修正 prompt 共用） */
function buildCheckFailureSummary(args: {
  score: number
  minScore: number
  parsedPassed?: boolean
  parsedSummary?: string
  ruleItems: ContinuityAuditItem[]
  hardItems: ContinuityAuditItem[]
  modelRejected: string[]
  scoreInferred?: boolean
}): string {
  const parts: string[] = []

  if (args.score < args.minScore) {
    if (args.score === 0 && !args.scoreInferred) {
      parts.push(`模型未返回有效评分（0 分，须 ≥ ${args.minScore}）`)
    } else if (args.scoreInferred && args.score < args.minScore) {
      parts.push(`模型评分缺失或无效，推断 ${args.score} 分（须 ≥ ${args.minScore}）`)
    } else {
      parts.push(`评分不足（${args.score} 分，须 ≥ ${args.minScore}）`)
    }
  } else if (args.parsedPassed === false) {
    parts.push(`模型审判定未通过（${args.score} 分）`)
  }

  if (args.hardItems.length) {
    parts.push(
      args.hardItems.slice(0, 2).map(i =>
        `[${continuityLayerLabel('hard')}·${continuityRuleLabel(i.rule)}] ${i.message}`,
      ).join('；'),
    )
  }

  if (args.ruleItems.length) {
    parts.push(
      args.ruleItems.slice(0, 2).map(i => formatContinuityRuleHint(i.rule, i.message)).join('；'),
    )
  }

  if (args.modelRejected.length) {
    const sample = args.modelRejected[0].replace(/\s+/g, ' ').trim()
    const tail = sample.length > 44 ? `${sample.slice(0, 44)}…` : sample
    parts.push(
      `模型疑点（缺正文摘录）：${tail}${args.modelRejected.length > 1 ? ` 等${args.modelRejected.length}条` : ''}`,
    )
  }

  const modelSummary = args.parsedSummary?.trim()
  if (modelSummary && !isGenericCheckSummary(modelSummary) && !parts.some(p => p.includes(modelSummary))) {
    parts.push(modelSummary)
  }

  return parts.length ? parts.join('；') : '审校未通过，详见规则明细'
}

export function formatCheckProgressHints(check: ContinuityCheckResult): {
  rule_hints: string[]
  model_rejected: string[]
} {
  const hardHints = check.audit?.hard.map(i =>
    `[${continuityLayerLabel('hard')}·${continuityRuleLabel(i.rule)}] ${i.message}`,
  ) ?? []
  const ruleHints = check.audit?.rule.map(i => formatContinuityRuleHint(i.rule, i.message)) ?? []
  const rejected = (check.audit?.model_rejected ?? []).filter(r =>
    !isLedgerFreezeModelConflict(r) && !isOutlineStructureModelConflict(r),
  )
  return {
    rule_hints: [...hardHints, ...ruleHints],
    model_rejected: rejected.slice(0, 3),
  }
}

function mergeCheckResult(args: {
  parsed: ReturnType<typeof parseCheckResponse>
  local: { hard: AuditConflict[], rule: AuditConflict[] }
  content: string
  contentHash: string
  checkedAt: string
  minScore: number
  causalMode?: boolean
}): ContinuityCheckResult {
  const { parsed, local, content, contentHash, checkedAt, minScore, causalMode } = args
  const hardItems = toAuditItems(local.hard)
  const ruleItems = toAuditItems(local.rule)
  const hardMessages = hardItems.map(i => i.message)
  const hardFailed = hardItems.length > 0

  const rawModel = (parsed?.conflicts || []).filter(c => typeof c === 'string' && c.trim()) as string[]
  const { accepted: modelMessages, rejected: modelRejected } = causalMode
    ? filterCausalModelMessages(rawModel, content)
    : filterModelConflicts(rawModel, content)
  const modelItems: ContinuityAuditItem[] = modelMessages.map(m => ({
    rule: classifyModelConflictRule(m),
    message: m,
  }))

  const blockingItems = buildBlockingItems(local.hard, modelItems)
  const blockingConflicts = syncCheckConflicts(blockingItems)
  const audit: ContinuityAuditBreakdown = {
    hard: hardItems,
    rule: ruleItems,
    model: modelItems,
    ...(modelRejected.length ? { model_rejected: modelRejected } : {}),
  }

  if (!parsed) {
    if (hardFailed) {
      return {
        passed: false,
        score: Math.min(60, 50 + hardMessages.length * 5),
        conflicts: blockingConflicts,
        blocking_items: blockingItems,
        summary: '硬审未通过，且模型审校结果解析失败',
        checked_at: checkedAt,
        content_hash: contentHash,
        audit,
      }
    }
    return {
      passed: true,
      score: 80,
      conflicts: [],
      blocking_items: [],
      summary: '模型审校解析失败，无硬审冲突，已跳过硬性拦截',
      checked_at: checkedAt,
      content_hash: contentHash,
      audit,
    }
  }

  const { score: resolvedScore, scoreInferred } = resolveParsedCheckScore(parsed, minScore)
  const modelRejectedOnly = !hardFailed
    && modelItems.length === 0
    && modelRejected.length > 0
    && rawModel.length > 0
  let effectiveScore = hardFailed ? Math.min(resolvedScore, 65) : resolvedScore
  if (modelRejectedOnly && effectiveScore < minScore) {
    effectiveScore = minScore
  }
  const passed = !hardFailed
    && blockingItems.length === 0
    && effectiveScore >= minScore
    && (modelRejectedOnly || parsed.passed !== false)

  let summary: string
  if (passed) {
    summary = parsed.summary?.trim() && !isGenericCheckSummary(parsed.summary)
      ? parsed.summary.trim()
      : modelRejectedOnly
        ? `无结构化硬伤；${modelRejected.length} 条模型疑点缺正文摘录，已作参考不拦截`
        : '无明显冲突'
  } else if (hardFailed) {
    const hardHint = hardItems.slice(0, 2).map(i => i.message).join('；')
    summary = hardHint
      || parsed.summary?.trim()
      || (causalMode ? '因果链硬审未通过' : '硬审发现境界/伤势冲突')
  } else {
    summary = buildCheckFailureSummary({
      score: effectiveScore,
      minScore,
      parsedPassed: parsed.passed,
      parsedSummary: parsed.summary,
      ruleItems,
      hardItems,
      modelRejected,
      scoreInferred,
    })
  }

  return {
    passed,
    score: effectiveScore,
    conflicts: blockingConflicts,
    blocking_items: blockingItems,
    summary,
    checked_at: checkedAt,
    content_hash: contentHash,
    audit,
  }
}

export async function checkNovelChapterContinuity(args: {
  content: string
  chapterNumber: number
  dramaId: number
  dramaTitle: string
  meta: NovelMetadata
  chapterOutline?: string
  expectedState?: NovelContinuityFields | null
  billing?: TextBillingContext
}): Promise<ContinuityCheckResult> {
  const {
    content, chapterNumber, dramaId, dramaTitle, meta, chapterOutline, expectedState, billing,
  } = args
  const trimmed = content.trim()
  const contentHash = hashNovelContent(trimmed)
  const checkedAt = new Date().toISOString()

  if (!trimmed) {
    const emptyItem: ContinuityBlockingItem = {
      layer: 'hard',
      rule: 'empty_content',
      label: continuityRuleLabel('empty_content'),
      message: '正文为空',
    }
    return {
      passed: false,
      score: 0,
      conflicts: [formatContinuityBlockingItem(emptyItem)],
      blocking_items: [emptyItem],
      summary: '无法审校空正文',
      checked_at: checkedAt,
      content_hash: contentHash,
    }
  }

  const fields = expectedState ?? await resolveExpectedContinuityFields(dramaId, chapterNumber)
  const prevChapterTail = await loadPrevChapterContentTail(dramaId, chapterNumber)
  const causalEnabled = isCausalChainEnabled(meta)
  const canonBlock = await buildSerialWrittenContextBlock(dramaId, chapterNumber, {
    skipLedger: causalEnabled,
  })
  const canonLock = await buildCanonLockPrefix(dramaId, chapterNumber)

  let local: { hard: AuditConflict[]; rule: AuditConflict[] }
  if (causalEnabled) {
    const causal = runCausalChainAudit({ content: trimmed, chapterNumber })
    local = {
      hard: causal.hard.map(c => ({ layer: 'hard' as const, rule: c.rule, message: c.message })),
      rule: causal.rule.map(c => ({ layer: 'rule' as const, rule: c.rule, message: c.message })),
    }
  } else {
    local = runLocalContinuityAudit({
      content: trimmed,
      chapterNumber,
      expectedFields: fields,
      prevChapterTail,
    })
  }

  const stateBlock = !causalEnabled && fields
    ? formatContinuityStateBlock(fields, { asOfChapter: chapterNumber - 1 })
    : !causalEnabled
      ? await resolveContinuityInjectBlock(dramaId, chapterNumber)
      : ''
  const causalOriginBlock = causalEnabled && chapterNumber >= 2
    ? `【因果起点（审校对照）】\n${readCausalChain(dramaId).slice(0, 2800)}`
    : ''

  const hardBlock = causalEnabled
    ? formatCausalHardBlock(local.hard.map(c => ({ ...c, layer: 'hard' as const })))
    : formatHardAuditBlock(local.hard)
  const ruleBlock = causalEnabled
    ? formatCausalRuleBlock(local.rule.map(c => ({ ...c, layer: 'rule' as const })))
    : formatRuleAuditBlock(local.rule)
  const minScore = resolveContinuityMinScore(meta)
  const prevTailBlock = prevChapterTail
    ? `【上章结尾正文摘录（跨章衔接须一致）】\n${trunc(prevChapterTail, 1600)}`
    : ''
  const worldBlock = meta.outline?.trim()
    ? extractOutlineWorldBlock(meta.outline, 1200)
    : ''

  const user = [
    `【书名】${dramaTitle}`,
    `【审校章节】第 ${chapterNumber} 章`,
    causalEnabled ? '' : canonLock,
    canonBlock ? `${canonBlock}` : '',
    causalOriginBlock,
    stateBlock ? `【应对齐的状态（章初须一致）】\n${stateBlock}` : '',
    prevTailBlock,
    hardBlock,
    ruleBlock,
    worldBlock ? `【世界观设定 — 境界语义补审须对照】\n${worldBlock}` : '',
    meta.premise?.trim() ? `【创意梗概】\n${trunc(meta.premise, 800)}` : '',
    chapterNumber === 1 && meta.outline?.trim() && !worldBlock
      ? `【全书大纲摘录】\n${trunc(meta.outline, 2000)}`
      : '',
    chapterOutline?.trim()
      ? causalEnabled
        ? `【本章大纲（创作参考 — 因果链审校不作为硬伤依据；勿因篇幅比例/详略与大纲不符报 conflict）】\n${trunc(chapterOutline, 1200)}`
        : `【本章大纲${chapterNumber >= 2 ? '（次要；与前序冲突以前序为准）' : ''}】\n${trunc(chapterOutline, 1200)}`
      : '',
    `【待审校正文 — 须检查章内旁白/对话/心理是否自洽；${causalEnabled ? '因果链与吃书' : '人名/剧情/境界语义'}矛盾须附摘录】\n${trunc(trimmed, 10000)}`,
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: buildCheckSystem(causalEnabled, minScore) }, { role: 'user', content: user }],
    { maxTokens: 1024, temperature: 0.2, billing },
  )

  const parsed = parseCheckResponse(raw)
  return mergeCheckResult({
    parsed,
    local,
    content: trimmed,
    contentHash,
    checkedAt,
    minScore,
    causalMode: causalEnabled,
  })
}

/** 修正计划 — 与审校三层 audit 对齐 */
export type ContinuityFixPlan = {
  hard: string[]
  model: string[]
  ruleHints: string[]
  blocking: string[]
  blockingItems: ContinuityBlockingItem[]
}

export function buildContinuityFixPlan(check: ContinuityCheckResult): ContinuityFixPlan {
  const audit = check.audit
  const blockingItems = check.blocking_items?.length
    ? check.blocking_items
    : undefined
  if (audit) {
    return {
      hard: blockingItems
        ? blockingItems.filter(i => i.layer === 'hard').map(i => i.message)
        : audit.hard.map(i => i.message),
      model: blockingItems
        ? blockingItems.filter(i => i.layer === 'model').map(i => i.message)
        : audit.model.map(i => i.message),
      ruleHints: audit.rule.map(i => i.message),
      blocking: check.conflicts,
      blockingItems: blockingItems ?? buildBlockingItemsFromAudit(audit),
    }
  }
  const fallbackItems = blockingItems ?? []
  return {
    hard: fallbackItems.filter(i => i.layer === 'hard').map(i => i.message),
    model: fallbackItems.filter(i => i.layer === 'model').map(i => i.message),
    ruleHints: [],
    blocking: check.conflicts,
    blockingItems: fallbackItems,
  }
}

function buildBlockingItemsFromAudit(audit: ContinuityAuditBreakdown): ContinuityBlockingItem[] {
  return [
    ...audit.hard.map(i => ({
      layer: 'hard' as const,
      rule: i.rule,
      label: continuityRuleLabel(i.rule),
      message: i.message,
    })),
    ...audit.model.map(i => ({
      layer: 'model' as const,
      rule: i.rule,
      label: continuityRuleLabel(i.rule),
      message: i.message,
    })),
  ]
}

function formatFixBlockingLines(items: ContinuityBlockingItem[]): string {
  if (!items.length) return ''
  const lines = items.map((item, i) => {
    const layer = continuityLayerLabel(item.layer)
    return `${i + 1}. [${layer}·${item.label} / ${item.rule}] ${item.message}`
  })
  return ['【须修正项 — 标明审校层与规则】', ...lines].join('\n')
}

function formatFixRuleLines(audit: ContinuityAuditBreakdown | undefined): string {
  if (!audit?.rule.length) return ''
  const lines = audit.rule.map(item =>
    `- ${formatContinuityRuleHint(item.rule, item.message)}`,
  )
  return ['【规则审 — 参考（有明确矛盾再改）】', ...lines].join('\n')
}

/** 局部 patch / 整章 regen 共用的分层修正说明 */
export function formatContinuityFixInstructions(check: ContinuityCheckResult, minScore = 78): string {
  const plan = buildContinuityFixPlan(check)
  const sections: string[] = [
    '【一致性修正 — 以前序已写正文与因果起点为准；勿为迎合大纲换名改事】',
  ]

  if (plan.blockingItems.some(i => i.rule === 'model_semantic_plot')) {
    sections.push(
      '【整章级要求】存在剧情/场景吃书：须统一地点、人物行动线与上章结尾衔接，局部改词无法过关时会触发整章重生成。',
    )
  }

  if (plan.blockingItems.some(i => i.rule === 'causal_missing_record' || i.rule === 'causal_missing_chain')) {
    sections.push([
      '【章末须附 — 变更记录】（元数据块，紧接正文后；每条须含「因果:」≥8字）',
      CAUSAL_CHAPTER_END_FORMAT,
    ].join('\n'))
  }

  if (plan.blockingItems.length) {
    sections.push(formatFixBlockingLines(plan.blockingItems))
  } else if (!check.passed) {
    if (check.score > 0 && check.score < minScore) {
      sections.push(
        `【评分不足】${check.score} 分，须 ≥ ${minScore}。请加强章间衔接、口语化润色、或补全【变更记录】因果链。`,
      )
    } else if (check.audit?.model_rejected?.length) {
      const rejected = check.audit.model_rejected.filter(r =>
        !isLedgerFreezeModelConflict(r) && !isOutlineStructureModelConflict(r),
      )
      if (rejected.length) {
        sections.push([
          '【模型疑点 — 缺可核对摘录，请按下列方向自查并修正】',
          ...rejected.slice(0, 5).map(r => `- ${r}`),
        ].join('\n'))
      }
    } else {
      sections.push('【无结构化硬伤】模型审或未达通过线，请按下述规则提示修正。')
    }
  }

  const ruleBlock = formatFixRuleLines(check.audit)
  if (ruleBlock) sections.push(ruleBlock)

  if (check.summary) sections.push(`结论：${check.summary}`)

  return sections.filter(Boolean).join('\n\n')
}

export function formatRewriteAttemptHistory(
  attemptHistory: ContinuityRewriteLogEntry[] | undefined,
  maxEntries = 8,
): string {
  if (!attemptHistory?.length) return ''
  const lines = attemptHistory.slice(-maxEntries).map((h) => {
    const status = h.patch_changed ? '已改文' : '未改文/无效'
    let items = ''
    if (h.blocking_items?.length) {
      items = h.blocking_items.slice(0, 3).map((item, i) => {
        const layer = item.layer === 'hard' ? '硬审' : '模型审'
        return `${i + 1}. [${layer}·${item.label}] ${item.message.slice(0, 72)}`
      }).join(' ')
    } else if (h.conflicts.length) {
      items = h.conflicts.slice(0, 3).map((c, i) => `${i + 1}. ${c.slice(0, 80)}`).join(' ')
    } else {
      items = h.summary || `评分 ${h.score} 未通过`
    }
    return `- 第 ${h.attempt} 次（${h.mode}，${status}，${h.score} 分）：${items}`
  })
  return [
    '【此前修正失败记录 — 以下改法无效或仍未通过，勿重复；须换思路】',
    ...lines,
  ].join('\n')
}

export function buildContinuityFixPrompt(
  basePrompt: string,
  check: ContinuityCheckResult,
  attemptHistory?: ContinuityRewriteLogEntry[],
): string {
  const history = formatRewriteAttemptHistory(attemptHistory)
  const fix = formatContinuityFixInstructions(check)
  return [basePrompt, history, fix].filter(Boolean).join('\n\n')
}
