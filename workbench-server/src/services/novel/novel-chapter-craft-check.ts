/**
 * 章节质量审校（独立于 continuity）— C1
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { stripNovelChangeRecord } from '../../common/novel/novel-change-record.js'
import type { NovelMetadata } from '../../common/novel/novel-meta.js'
import { resolveChapterCraftMinScore } from '../../common/novel/novel-meta.js'
import { parseChapterCraftTags, type ChapterCraftTags } from './novel-chapter-craft-tags.js'

export type ChapterCraftResult = {
  passed: boolean
  score: number
  min_score: number
  functions_hit: number
  dimensions: Record<string, number>
  conflicts: string[]
  summary: string
  compliance_veto: boolean
  compliance_reasons: string[]
  tags: ChapterCraftTags
  content_hash: string
  checked_at: string
}

const CRAFT_SYSTEM = `你是男频网文章节质量审校。只评读者正文的戏剧与追更质量，不评文风炫技。

评分维度（合计约 100）：
- function_mainline 20：推进/反转/揭示；删掉是否伤主线
- conflict_tension 15：目标、阻力、代价；积压/小爆/大爆/收息是否清晰
- character_choice 15：关键转折是否由人物选择驱动
- hook_pull 15：开头承诺；章末具体问题
- scene 8：可演而非流水账
- dialogue 10：对白是否推进关系/信息
- pulse_clarity 2：能否说出还哪笔债/推进哪条契约
- pacing 5：是否拖；过渡是否过长
- style 5：浅白清楚；视角是否乱跳
- continuity_light 5：明显吃书/时间线硬伤（轻量）；**无铺垫发明怀孕等重大状态**

另：functions_hit = 本章完成「推进情节/加深人物/抬高张力/改变局势」几项（0-4）。
conflicts 须标出：前序/大纲未交代却突然写怀孕、腹中孩子等。
compliance_veto=true 仅当命中：未成年人色情擦边、性暴力细节、酷刑教学、可操作违法步骤、仇恨煽动。

只输出 JSON：
{
  "score": 0-100,
  "functions_hit": 0-4,
  "dimensions": { "function_mainline":0,"conflict_tension":0,"character_choice":0,"hook_pull":0,"scene":0,"dialogue":0,"pulse_clarity":0,"pacing":0,"style":0,"continuity_light":0 },
  "conflicts": ["须改问题 + 摘录「……」", ...],
  "summary": "一句话",
  "compliance_veto": false,
  "compliance_reasons": []
}
conflicts 无摘录勿写。`

function trunc(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export async function checkNovelChapterCraft(args: {
  content: string
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  writingBrief?: string
  chapterOutline?: string
  billing?: TextBillingContext
}): Promise<ChapterCraftResult> {
  const prose = stripNovelChangeRecord(args.content)
  const tags = parseChapterCraftTags(args.writingBrief, args.chapterOutline, prose)
  const minScore = resolveChapterCraftMinScore(args.meta)
  const requireTwo = args.meta.chapter_craft_require_two_functions !== false
  const checkedAt = new Date().toISOString()
  const contentHash = hashNovelContent(prose)

  const user = [
    `【书名】${args.dramaTitle}`,
    `【章号】第${args.chapterNumber}章`,
    tags.role ? `【章职】${tags.role}` : '',
    tags.emotionDebt ? `【情绪债标注】${tags.emotionDebt}` : '',
    tags.promise ? `【承诺标注】${tags.promise}` : '',
    tags.stage ? `【舞台标注】${tags.stage}` : '',
    args.writingBrief?.trim() ? `【写作说明】\n${trunc(args.writingBrief, 1200)}` : '',
    args.chapterOutline?.trim() ? `【本章大纲】\n${trunc(args.chapterOutline, 600)}` : '',
    `【正文字数】${countNovelChars(prose)}`,
    '【待审校正文】',
    trunc(prose, 14000),
  ].filter(Boolean).join('\n\n')

  let parsed: Record<string, unknown> = {}
  try {
    const raw = await chatCompletionTextAudit(
      [
        { role: 'system', content: CRAFT_SYSTEM },
        { role: 'user', content: user },
      ],
      {
        temperature: 0.2,
        maxTokens: 2048,
        billing: args.billing
          ? { ...args.billing, reason: args.billing.reason || '小说章节质量审校' }
          : undefined,
      },
    )
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw || '{}') as Record<string, unknown>
  } catch {
    parsed = {}
  }

  const scoreRaw = Number(parsed.score)
  let score = Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0
  const functionsHit = Math.min(4, Math.max(0, Math.round(Number(parsed.functions_hit) || 0)))
  const conflicts = Array.isArray(parsed.conflicts)
    ? (parsed.conflicts as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim()).slice(0, 12)
    : []
  const complianceVeto = parsed.compliance_veto === true
  const complianceReasons = Array.isArray(parsed.compliance_reasons)
    ? (parsed.compliance_reasons as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim()).slice(0, 8)
    : []
  const dimensions = (parsed.dimensions && typeof parsed.dimensions === 'object')
    ? parsed.dimensions as Record<string, number>
    : {}

  if (!Number.isFinite(scoreRaw) && !conflicts.length && !complianceVeto) {
    score = Math.max(minScore, 72)
  }

  const functionOk = !requireTwo || functionsHit >= 2
  const passed = !complianceVeto && score >= minScore && functionOk

  return {
    passed,
    score,
    min_score: minScore,
    functions_hit: functionsHit,
    dimensions,
    conflicts,
    summary: typeof parsed.summary === 'string' ? parsed.summary : (passed ? '质量审校通过' : '质量审校未通过'),
    compliance_veto: complianceVeto,
    compliance_reasons: complianceReasons,
    tags,
    content_hash: contentHash,
    checked_at: checkedAt,
  }
}

export function buildChapterCraftFixPrompt(basePrompt: string, craft: ChapterCraftResult): string {
  const lines = [
    '【章节质量修正任务】上一稿未达好章节标准，请重写本章正文（可保留可用情节），必须修好下列问题：',
    ...craft.conflicts.slice(0, 8).map((c, i) => `${i + 1}. ${c}`),
    craft.compliance_veto
      ? `合规否决：${craft.compliance_reasons.join('；') || '触及红线'}——须彻底改写避开。`
      : '',
    `当前分 ${craft.score}，须 ≥ ${craft.min_score}；functions_hit 须 ≥ 2。`,
    '优先修：章功能、冲突与选择（须用说明/大纲已有代价，禁止另造更大金额或新惩罚条款）、开头钩子与章末具体问题；禁止只加水字数或空喊口号。',
    '',
    '【原写作说明】',
    basePrompt,
  ]
  return lines.filter(Boolean).join('\n')
}

/** 续写场景：只修正新增段 */
export function buildChapterCraftContinueFixPrompt(basePrompt: string, craft: ChapterCraftResult): string {
  const lines = [
    '【续写质量修正】上一续写新增段未达好章节标准。请只输出修正后的新增续写段，禁止重复已有正文，必须修好：',
    ...craft.conflicts.slice(0, 8).map((c, i) => `${i + 1}. ${c}`),
    craft.compliance_veto
      ? `合规否决：${craft.compliance_reasons.join('；') || '触及红线'}——须彻底改写避开。`
      : '',
    `当前整章分 ${craft.score}，须 ≥ ${craft.min_score}；functions_hit 须 ≥ 2。`,
    '优先用本段补：冲突与选择（勿另造新金额/新代价）、钩子与章末具体问题；禁止灌水。',
    basePrompt?.trim() ? `\n【写作说明参考】\n${basePrompt.trim()}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}
