/**
 * 大纲章界/章缝模型审 — 题材无关。
 * 自洽对照：状态卡 6 维 + 一致性账本 15 维 + 大纲边界；须按 21 维出具判定与总因。
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import type { OutlineComplianceReason } from './novel-outline-compliance.js'
import {
  DIMENSION_AUDIT_OUTPUT_CONTRACT,
  conflictsFromDimensionFails,
  dimensionPassClaimInvalid,
  parseDimensionAuditReport,
} from './novel-dimension-verdict.js'

const SYSTEM = `你是网文章节大纲边界与跨章自洽审校（题材无关）。

## 主标准：逻辑自洽
以正文内部、与上章已成立事实、与可合理推出的时空/人物/因果是否说得通为准。
状态卡 6 维与账本 15 维是**检查坐标系与证据**，不是「只比有字的维、字面不冲就过」。
**判定只问能否说圆**：与具体题材场面、专名、句序无关。

## 检查轴（须覆盖）
1. **状态卡 6 维**（若提供）：时间线、地点、场景、人物、刚发生、道具/衣着  
2. **一致性账本 15 维**（若提供）：环境场景、修为境界、资源道具、神态衣着、人设口吻、身体伤势、时间节奏、人际势力、伏笔设定、动作逻辑、认知记忆、功法能力、情绪递进、一致性提醒、本章变化  
3. **本章大纲边界**：不得越过最后行动拍完成态；**不得揭晓【章末问题】**（答案留给下章）；不得抢写下章【本章起因】/主情节  

维有明确记录：不得无交代推翻。维为「未记录」：不凭空捏造该维硬伤，但仍须结合正文与其它事实做逻辑推断。

## 手法与自洽（通用）
正叙/倒叙/补叙/插叙/先因后果/先果后因等**只是手法**：允许使用，但**不免除**自洽审查。
「允许倒叙/补叙」≠「开篇可与上章已成立时空/地点/在场/进度/过程相位冲突而不说明」。
- **说得通**：有补叙框、回忆框、明确闪回、跨日/归来/再出发/新一轮过程等交代，或整体链条闭合 → 不因手法本身判违规  
- **说不通**：以当前进行时重演上章已越过的更早节点，且无任何使链条闭合的交代（无框的「再演一遍」不算补叙）→ **必须**判逻辑不自洽（对应维 status=fail）

## 时间/过程相位（与「钟点词序」区分）
- **钟点词字面顺序** alone：不要仅因此判死刑（可有补叙）  
- **过程/环境相位倒退**：上章已进入更晚/更重阶段，本章开篇无跨日/新过程交代写回「才开始/初起」→ 时间线/环境场景/时间节奏等维须 fail

## 必须判违规
1. 逻辑不自洽（写入对应维 fail）
2. 大纲越界或提前写下章结果（violations 中 code=outline_boundary_model）
3. 章缝因果无法闭合
4. **章内进度回卷**：章内已写到完成态的推进过程，无框又以当前进行时完整换皮再写一遍 → 动作逻辑等维 fail（通过总因不得写「无明显冲突」；不限题材）

## 不要做
- 不要因文风、口语、字数判违规
- 不要要求开篇字面命中某一大纲句
- 不要把「与有记录维字面不矛盾」当成唯一通过条件
- 不要用「允许倒叙」跳过自洽审查
- **禁止** ok=true 却不交 dimensions / reason

${DIMENSION_AUDIT_OUTPUT_CONTRACT}

只输出一个 JSON 对象，不要其它文字：
{"ok":true|false,"reason":"总因（通过或不通过都必须写清）","dimensions":[{"dimension":"维名","status":"ok|fail|na","reason":"一句","excerpt":"fail时必填"}],"violations":[{"code":"outline_boundary_model"|"outline_seam_restart"|"dimension_inconsistency","message":"中文说明","excerpt":"连续原文8字以上","dimension":"维名或空"}]}
ok=true 时：不得有 fail 维；violations 必须为 []；reason 与 21 维须齐全。
ok=false 时：fail 维或 violations 至少有一；reason 须概括不通过原因。
逻辑/维度断裂 → dimension_inconsistency 或 outline_seam_restart；完成态越界 → outline_boundary_model。`

function trunc(s: string, n: number): string {
  const t = s.trim()
  if ([...t].length <= n) return t
  return `${[...t].slice(0, n).join('')}…`
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const text = (fenced?.[1] ?? trimmed).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export type OutlineBoundaryAuditArgs = {
  content: string
  chapterOutline?: string
  writingBrief?: string
  nextChapterOutline?: string
  prevChapterTail?: string
  prevSnapshotBlock?: string
  /** 状态卡 6 维注入块（上章/下章） */
  prevStateCardBlock?: string
  nextStateCardBlock?: string
  /** 一致性账本 15 维注入块 */
  prevLedgerBlock?: string
  chapterNumber: number
  billing?: TextBillingContext
}

/** 拼装 user 段（供 verify / 主路径共用） */
export function buildOutlineBoundaryAuditUserPartsForTest(
  args: Omit<OutlineBoundaryAuditArgs, 'billing'>,
): string[] {
  return [
    `【审校章节】第 ${args.chapterNumber} 章`,
    '【输出要求】须含 reason + 完整 21 维 dimensions（ok|fail|na），禁止空过关',
    args.chapterOutline?.trim()
      ? `【本章大纲】\n${trunc(args.chapterOutline, 1200)}`
      : '',
    args.prevStateCardBlock?.trim() || '',
    args.nextStateCardBlock?.trim() || '',
    args.prevLedgerBlock?.trim() || '',
    args.prevSnapshotBlock?.trim()
      ? trunc(args.prevSnapshotBlock, 500)
      : '',
    args.prevChapterTail?.trim()
      ? `【上章结尾 — 已成立事实；手法不限，须与待审正文逻辑自洽】\n${trunc(args.prevChapterTail, 1000)}`
      : '',
    args.nextChapterOutline?.trim()
      ? `【下章大纲 — 禁止提前写】\n${trunc(args.nextChapterOutline, 600)}`
      : '',
    args.writingBrief?.trim()
      ? `【写作说明 — 与大纲冲突时以大纲为准】\n${trunc(args.writingBrief, 800)}`
      : '',
    args.content?.trim()
      ? `【待审正文】\n${trunc(args.content, 9000)}`
      : '',
  ].filter(Boolean)
}

/**
 * @returns 违规项；模型调用异常时返回 []（不回退规则章缝硬拦）
 * 注意：模型「空过关 / 缺 21 维」会映射为违规，不再当通过。
 */
export async function auditOutlineBoundaryWithModel(
  args: OutlineBoundaryAuditArgs,
): Promise<OutlineComplianceReason[]> {
  const outline = args.chapterOutline?.trim() || ''
  const content = args.content?.trim() || ''
  if (!outline || [...content].length < 200) return []

  const user = buildOutlineBoundaryAuditUserPartsForTest(args).join('\n\n')

  try {
    const raw = await chatCompletionTextAudit(
      [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      {
        maxTokens: 16384,
        temperature: 0.15,
        billing: args.billing
          ? { ...args.billing, reason: '小说大纲章界与维度自洽模型审' }
          : undefined,
      },
    )
    const parsed = extractJsonObject(raw)
    return mapOutlineBoundaryModelViolations(parsed, content)
  } catch (err: unknown) {
    logTaskWarn('Novel', 'outline-boundary-model-audit-failed', {
      chapterNumber: args.chapterNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/** 将模型 JSON 映射为合规原因（供本地 mock 验收，不调 LLM） */
export function mapOutlineBoundaryModelViolations(
  parsed: unknown,
  content = '',
): OutlineComplianceReason[] {
  const obj = parsed as {
    ok?: boolean
    reason?: string
    violations?: Array<{ code?: string; message?: string; excerpt?: string; dimension?: string }>
  } | null
  if (!obj) return []

  const report = parseDimensionAuditReport(parsed, content)
  const out: OutlineComplianceReason[] = []

  const push = (code: OutlineComplianceReason['code'], message: string, detail?: string) => {
    out.push({ code, message, detail })
  }

  // 声称通过但未交齐 21 维 / 无总因 → 不通过
  const claimBad = dimensionPassClaimInvalid(obj.ok === true, report)
  if (claimBad) {
    push('chapter_seam_cold_open', claimBad, 'dimensions')
  }

  if (report && report.failCount > 0) {
    for (const msg of conflictsFromDimensionFails(report).slice(0, 6)) {
      push('chapter_seam_cold_open', msg, 'dimension_fail')
    }
  }

  const violations = Array.isArray(obj.violations) ? obj.violations : []
  for (const v of violations.slice(0, 6)) {
    const message = typeof v.message === 'string' ? v.message.trim() : ''
    if (!message) continue
    const excerpt = typeof v.excerpt === 'string' ? v.excerpt.trim() : ''
    const dim = typeof v.dimension === 'string' ? v.dimension.trim() : ''
    const rawCode = typeof v.code === 'string' ? v.code.trim() : ''
    const isSeam = rawCode === 'outline_seam_restart'
      || rawCode === 'dimension_inconsistency'
      || /真吃书|因果断裂|维度|状态卡|账本|逻辑/.test(message)
    const msgWithDim = dim && !message.includes(dim) ? `【${dim}】${message}` : message
    push(
      isSeam ? 'chapter_seam_cold_open' : 'outline_boundary_model',
      excerpt && !msgWithDim.includes(excerpt.slice(0, 8))
        ? `${msgWithDim}（摘录「${excerpt.slice(0, 40)}」）`
        : msgWithDim,
      excerpt.slice(0, 80) || dim || undefined,
    )
  }

  // ok=false 且无任何具体项：用 reason 兜底
  if (obj.ok === false && out.length === 0) {
    const reason = typeof obj.reason === 'string' ? obj.reason.trim() : ''
    push(
      'chapter_seam_cold_open',
      reason || '模型判定逻辑不自洽（未给出维度明细）',
      'reason',
    )
  }

  // 去重（按 message 前 48 字）
  const seen = new Set<string>()
  return out.filter(r => {
    const k = r.message.slice(0, 48)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 8)
}

export function getOutlineBoundaryAuditSystemPromptForTest(): string {
  return SYSTEM
}
