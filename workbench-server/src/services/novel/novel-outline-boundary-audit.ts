/**
 * 大纲章界模型审 — 题材无关：判断正文是否越出「本章大纲最后拍点」的完成态，
 * 以及开篇是否相对上章结尾时空倒退/未进本章大纲前段。
 * 使用文本审核模型（chatCompletionTextAudit），不依赖场面词表。
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import type { OutlineComplianceReason } from './novel-outline-compliance.js'

const SYSTEM = `你是网文章节大纲边界与章缝审校。只判断正文是否严格落在【本章大纲】范围内，以及开篇是否合法承接【上章结尾】。

核心（题材无关）：
1. 将大纲拆成情节拍点；正文只能推进到大纲**最后一拍所允许的完成程度**为止。
2. 若大纲最后一拍是「过程/未完成/发现/准备/即将」类，正文不得写成该拍已办成、或已进入大纲未写的下一阶段结果。
3. 若提供【下章大纲】，正文不得提前写下属下章的主情节结果。
4. 允许同场景内合理细节与反应；禁止用大纲未列的高潮/得手/收束凑字。
5. 若提供【上章结尾】：开篇时空点必须紧接上章末已发生事实之后；禁止开篇时空早于上章末；禁止倒退到上章已越过的更早情节节点重开（即使换措辞）。
6. 不要因为文风、口语、字数评「不好」；只评章界与章缝承接。

只输出一个 JSON 对象，不要其它文字：
{"ok":true|false,"violations":[{"code":"outline_boundary_model"|"outline_seam_restart","message":"中文说明，须含正文摘录","excerpt":"连续原文8字以上"}]}
ok=true 时 violations 必须为 []。开篇时空倒退/未进本章大纲前段用 code=outline_seam_restart；完成态越界/抢写下章用 outline_boundary_model。`

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

/**
 * @returns 越界项；模型失败时返回 []（不阻断本地规则审）
 */
export async function auditOutlineBoundaryWithModel(args: {
  content: string
  chapterOutline?: string
  writingBrief?: string
  nextChapterOutline?: string
  prevChapterTail?: string
  /** 上章末状态契约（时间/地点/刚发生） */
  prevSnapshotBlock?: string
  chapterNumber: number
  billing?: TextBillingContext
}): Promise<OutlineComplianceReason[]> {
  const outline = args.chapterOutline?.trim() || ''
  const content = args.content?.trim() || ''
  if (!outline || [...content].length < 200) return []

  const user = [
    `【审校章节】第 ${args.chapterNumber} 章`,
    `【本章大纲】\n${trunc(outline, 1200)}`,
    args.prevSnapshotBlock?.trim()
      ? trunc(args.prevSnapshotBlock, 500)
      : '',
    args.prevChapterTail?.trim()
      ? `【上章结尾 — 开篇须承接；不得早于此处已发生事实】\n${trunc(args.prevChapterTail, 1000)}`
      : '',
    args.nextChapterOutline?.trim()
      ? `【下章大纲 — 禁止提前写】\n${trunc(args.nextChapterOutline, 600)}`
      : '',
    args.writingBrief?.trim()
      ? `【写作说明 — 与大纲冲突时以大纲为准】\n${trunc(args.writingBrief, 800)}`
      : '',
    `【待审正文】\n${trunc(content, 9000)}`,
  ].filter(Boolean).join('\n\n')

  try {
    const raw = await chatCompletionTextAudit(
      [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
      {
        maxTokens: 768,
        temperature: 0.15,
        billing: args.billing
          ? { ...args.billing, reason: '小说大纲章界模型审' }
          : undefined,
      },
    )
    const parsed = extractJsonObject(raw) as {
      ok?: boolean
      violations?: Array<{ code?: string; message?: string; excerpt?: string }>
    } | null
    if (!parsed || parsed.ok === true) return []
    const violations = Array.isArray(parsed.violations) ? parsed.violations : []
    const out: OutlineComplianceReason[] = []
    for (const v of violations.slice(0, 5)) {
      const message = typeof v.message === 'string' ? v.message.trim() : ''
      if (!message) continue
      const excerpt = typeof v.excerpt === 'string' ? v.excerpt.trim() : ''
      const rawCode = typeof v.code === 'string' ? v.code.trim() : ''
      const isSeam = rawCode === 'outline_seam_restart'
        || /冷开篇|时空倒退|重新开篇|章缝|早于上章/.test(message)
      out.push({
        code: isSeam ? 'chapter_seam_cold_open' : 'outline_boundary_model',
        message: excerpt && !message.includes(excerpt.slice(0, 8))
          ? `${message}（摘录「${excerpt.slice(0, 40)}」）`
          : message,
        detail: excerpt.slice(0, 80) || undefined,
      })
    }
    return out
  } catch (err: unknown) {
    logTaskWarn('Novel', 'outline-boundary-model-audit-failed', {
      chapterNumber: args.chapterNumber,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}
