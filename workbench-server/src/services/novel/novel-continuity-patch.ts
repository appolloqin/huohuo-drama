/**
 * 一致性局部修正：按审校分层（硬审 / 模型审 / 规则审）定位改动
 */
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import type { ContinuityRewriteLogEntry } from '../../common/novel/novel-continuity-state.js'
import {
  buildContinuityFixPlan,
  formatContinuityFixInstructions,
  formatRewriteAttemptHistory,
  type ContinuityCheckResult,
} from './novel-continuity-check.js'
import { applyDeterministicContinuityFixes } from './novel-continuity-deterministic-fix.js'
import {
  buildCanonLockPrefix,
  loadPrevChapterContentTail,
  resolveContinuityInjectBlock,
} from './novel-continuity.js'

export type ContinuityPatch = {
  before: string
  after: string
}

const PATCH_SYSTEM = `你是网文 continuity 编辑。任务：**仅修正**冲突列表中的问题句/对话/旁白，其余正文必须一字不改。

输出 JSON（不要 markdown）：
{
  "patches": [
    { "before": "从原文复制的待改片段（须能在原文中精确匹配，建议 20～200 字）", "after": "修正后的同位置片段" }
  ],
  "notes": "可选"
}

分层处理：
- **硬审**（境界/伤势）：须对齐账本与前序；**不得**把重修/废修为/散功导致的合法降境强行抬回；仅修正无故吃书式倒退
- **模型审·剧情/场景**（吃书、地点、人物行动线）：须以前序锁定事实与上章结尾为准**整体改写相关段落**，禁止只改一词而留下溪边/绳索等矛盾
- **模型审·境界语义**：按 conflict 摘录定位，对齐账本 realm 与【世界观设定】
- **规则审**：表述问题（如脸不能回荡），有则顺手改，非必须

规则：
- before 须从【待修正正文】原样复制，含标点
- 每个 patch 只改一处；after 篇幅 ±30%；保留换行与段落
- 伤势：若账本为「无/已愈」，正文写「毫发无伤」**合理**，勿强行改回重伤
- 场景/吃书类冲突：若需改多处才能自洽，patches 可返回 2～4 处，或 notes 说明「需整章重写」
- patches 为空表示无法定位`

function parsePatchResponse(text: string): ContinuityPatch[] {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start < 0 || end <= start) return []
    try {
      parsed = JSON.parse(candidate.slice(start, end + 1))
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const arr = (parsed as { patches?: unknown }).patches
  if (!Array.isArray(arr)) return []
  const out: ContinuityPatch[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const before = typeof (item as ContinuityPatch).before === 'string'
      ? (item as ContinuityPatch).before.trim() : ''
    const after = typeof (item as ContinuityPatch).after === 'string'
      ? (item as ContinuityPatch).after.trim() : ''
    if (before && after && before !== after) out.push({ before, after })
  }
  return out
}

function extractQuotedHints(conflicts: string[]): string[] {
  const hints = new Set<string>()
  for (const c of conflicts) {
    for (const m of c.matchAll(/「([^」]{2,80})」|摘录[：:]\s*「([^」]{2,80})」/g)) {
      const q = m[1] || m[2]
      if (q) hints.add(q)
    }
  }
  return [...hints]
}

/** 为 LLM 标注冲突可能所在的段落摘录 */
export function buildConflictExcerptBlock(content: string, conflicts: string[], maxChars = 3500): string {
  const hints = extractQuotedHints(conflicts)
  const paragraphs = content.split(/\n+/).map(p => p.trim()).filter(Boolean)
  const picked = new Set<number>()

  for (const hint of hints) {
    paragraphs.forEach((p, i) => {
      if (p.includes(hint)) picked.add(i)
    })
  }

  if (!picked.size) {
    for (const c of conflicts.slice(0, 4)) {
      const words = c.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2)
      for (const w of words.slice(0, 6)) {
        paragraphs.forEach((p, i) => {
          if (p.includes(w)) picked.add(i)
        })
      }
    }
  }

  const indices = [...picked].sort((a, b) => a - b)
  const blocks: string[] = []
  for (const i of indices) {
    const slice = [i - 1, i, i + 1].filter(j => j >= 0 && j < paragraphs.length)
    for (const j of slice) {
      if (!blocks.includes(paragraphs[j]!)) blocks.push(paragraphs[j]!)
    }
  }

  let excerpt = blocks.length ? blocks.join('\n\n') : content.slice(0, Math.min(content.length, maxChars))
  if (excerpt.length > maxChars) excerpt = `${excerpt.slice(0, maxChars)}…`
  return excerpt
}

export function applyContinuityPatches(content: string, patches: ContinuityPatch[]): {
  content: string
  applied: number
  skipped: number
} {
  let result = content
  let applied = 0
  let skipped = 0
  for (const p of patches) {
    const hit = replaceOnce(result, p.before, p.after)
    if (hit) {
      result = hit
      applied += 1
    } else {
      skipped += 1
    }
  }
  return { content: result, applied, skipped }
}

function replaceOnce(content: string, before: string, after: string): string | null {
  if (!before || before === after) return null
  if (content.includes(before)) {
    return content.replace(before, after)
  }
  const anchor = before.slice(0, Math.min(20, before.length))
  if (anchor.length < 6) return null
  const idx = content.indexOf(anchor)
  if (idx < 0) return null
  const end = Math.min(content.length, idx + before.length + 40)
  const chunk = content.slice(idx, end)
  if (!chunk.startsWith(anchor)) return null
  const chunkEnd = chunk.length >= before.length ? before.length : chunk.length
  const oldSlice = content.slice(idx, idx + chunkEnd)
  return content.slice(0, idx) + after + content.slice(idx + oldSlice.length)
}

export async function patchNovelChapterContinuity(args: {
  content: string
  check: ContinuityCheckResult
  chapterNumber: number
  dramaId: number
  dramaTitle: string
  attemptHistory?: ContinuityRewriteLogEntry[]
  billing?: TextBillingContext
}): Promise<string> {
  const { content, check, chapterNumber, dramaId, dramaTitle, attemptHistory, billing } = args
  const plan = buildContinuityFixPlan(check)
  if (!content || !plan.blocking.length) return content

  const deterministic = applyDeterministicContinuityFixes({
    content,
    hardMessages: plan.hard,
    modelMessages: plan.model,
    ruleHints: plan.ruleHints,
  })
  let working = deterministic.content
  if (deterministic.applied > 0 && !plan.model.length && !plan.hard.some(c => /伤势|境界|realm/.test(c))) {
    return working
  }

  const charCount = countNovelChars(working)
  const excerpt = buildConflictExcerptBlock(working, plan.blocking)
  const fixInstructions = formatContinuityFixInstructions(check)
  const historyBlock = formatRewriteAttemptHistory(attemptHistory)

  const canonLock = await buildCanonLockPrefix(dramaId, chapterNumber)
  const stateBlock = await resolveContinuityInjectBlock(dramaId, chapterNumber)
  const prevTail = await loadPrevChapterContentTail(dramaId, chapterNumber)
  const prevTailBlock = prevTail
    ? `【上章结尾（跨章衔接须一致）】\n${prevTail.slice(-1600)}`
    : ''

  const user = [
    `【书名】${dramaTitle}`,
    `【章节】第 ${chapterNumber} 章`,
    canonLock,
    stateBlock ? `【应对齐的状态】\n${stateBlock}` : '',
    prevTailBlock,
    fixInstructions,
    historyBlock,
    '',
    '【冲突相关段落摘录】',
    excerpt,
    '',
    working.length <= 12000
      ? '【待修正正文 — before 须从此处原样复制】'
      : '【待修正正文 — before 须从此处原样复制（全文）】',
    working,
  ].filter(Boolean).join('\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: PATCH_SYSTEM }, { role: 'user', content: user }],
    {
      maxTokens: Math.min(4096, Math.max(1024, Math.round(charCount * 0.15))),
      temperature: 0.25,
      billing,
    },
  )

  const patches = parsePatchResponse(raw)
  if (!patches.length) return working

  const { content: patched, applied } = applyContinuityPatches(working, patches)
  if (applied === 0) return working

  const lenRatio = countNovelChars(patched) / Math.max(1, charCount)
  if (lenRatio < 0.85 || lenRatio > 1.15) {
    return working
  }

  return patched
}
