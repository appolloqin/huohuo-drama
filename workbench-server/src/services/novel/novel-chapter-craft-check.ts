/**
 * 章节质量审校（独立于 continuity）— C1
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { stripNovelChangeRecord } from '../../common/novel/novel-change-record.js'
import type { NovelMetadata } from '../../common/novel/novel-meta.js'
import { resolveChapterCraftMinScore } from '../../common/novel/novel-meta.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import { parseChapterCraftTags, type ChapterCraftTags } from './novel-chapter-craft-tags.js'
import {
  assertOutlineChapterFields,
  buildChapterOutlineDramaPromptBlock,
} from './novel-outline-drama-fields.js'
import {
  buildCommercialAppealAudit,
  listOpeningAppealHardFails,
  type CommercialAppealAudit,
} from './novel-commercial-appeal-audit.js'
import { buildAppealSingleCodeFixBlock } from './novel-emotion-core-contract.js'
import {
  applyAppealFeelVeto,
  runAppealFeelAudit,
  shouldRunAppealFeelAudit,
  type AppealFeelResult,
} from './novel-commercial-appeal-feel.js'

export type DramaGateLevel = '有' | '弱' | '无'
export type DramaGateCode =
  | 'desire_on_page'
  | 'obstacle_on_page'
  | 'choice_on_page'
  | 'hook_on_page'
  | 'info_delta'
  | 'emotion_shown'
  | 'theme_echo'
  | 'conflict_layer'
  | 'stakes_shift'
  | 'opening_promise'

export const DRAMA_GATE_CODES: DramaGateCode[] = [
  'desire_on_page',
  'obstacle_on_page',
  'choice_on_page',
  'hook_on_page',
  'info_delta',
  'emotion_shown',
  'theme_echo',
  'conflict_layer',
  'stakes_shift',
  'opening_promise',
]

export type DramaGateEntry = { level: DramaGateLevel; excerpt?: string; note?: string }

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
  drama_gates: Record<DramaGateCode, DramaGateEntry>
  drama_gate_passed: boolean
  soft_alerts: Array<{ code: string; message: string }>
  /** 吸引力审（与 continuity 解耦；由 drama_gates 投影 + 本地软信号） */
  appeal?: CommercialAppealAudit
}

export function computeDramaGatePassed(
  gates: Partial<Record<DramaGateCode, DramaGateEntry | undefined>>,
): boolean {
  return DRAMA_GATE_CODES.every((code) => {
    const lv = gates[code]?.level
    return lv === '有' || lv === '弱'
  })
}

function normalizeDramaGates(raw: unknown): Record<DramaGateCode, DramaGateEntry> {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const out = {} as Record<DramaGateCode, DramaGateEntry>
  for (const code of DRAMA_GATE_CODES) {
    const g = obj[code]
    if (g && typeof g === 'object') {
      const level = (g as { level?: string }).level
      const lv: DramaGateLevel = level === '有' || level === '弱' || level === '无' ? level : '无'
      out[code] = {
        level: lv,
        excerpt: typeof (g as { excerpt?: string }).excerpt === 'string'
          ? (g as { excerpt: string }).excerpt.slice(0, 40)
          : undefined,
        note: typeof (g as { note?: string }).note === 'string'
          ? (g as { note: string }).note.slice(0, 80)
          : undefined,
      }
    } else {
      out[code] = { level: '无' }
    }
  }
  return out
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

另须对照【本章大纲·戏剧要素】给出 drama_gates（有/弱/无）：
desire_on_page, obstacle_on_page, choice_on_page, hook_on_page, info_delta,
emotion_shown, theme_echo, conflict_layer, stakes_shift, opening_promise。
「弱」=有痕迹但不饱满；「无」=正文未落地。opening_promise=开篇约前300～800字有本章看点/赌注。
opening_promise 与 hook_on_page 同时供「吸引力审」使用（与连贯性审解耦，勿混写）。
opening_promise=「无」若开篇主要是冻醒/感官苏醒/记忆灌入+家底盘点，而缺少催债/夺产/点名等外部对峙。
第1～8章另看情绪四拍是否语义落地（非词表凑数）：恨冲突前置；爽须动作震慑+本事露尖（立约可留但不得单独当爽）；急期限+拢共天数；盼短缺一环且本事非本段首亮。仅立约无动作无露尖、或本事拖到章末才首次说「我能X」→ opening_promise 宜「弱」或「无」。

只输出 JSON：
{
  "score": 0-100,
  "functions_hit": 0-4,
  "dimensions": { "function_mainline":0,"conflict_tension":0,"character_choice":0,"hook_pull":0,"scene":0,"dialogue":0,"pulse_clarity":0,"pacing":0,"style":0,"continuity_light":0 },
  "drama_gates": {
    "desire_on_page": { "level": "有|弱|无", "excerpt": "可选" },
    "obstacle_on_page": { "level": "有|弱|无" },
    "choice_on_page": { "level": "有|弱|无" },
    "hook_on_page": { "level": "有|弱|无" },
    "info_delta": { "level": "有|弱|无" },
    "emotion_shown": { "level": "有|弱|无" },
    "theme_echo": { "level": "有|弱|无" },
    "conflict_layer": { "level": "有|弱|无" },
    "stakes_shift": { "level": "有|弱|无" },
    "opening_promise": { "level": "有|弱|无" }
  },
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
  /** 上章正文（或尾部），供爽型同构对比 */
  priorChapterContent?: string
  billing?: TextBillingContext
}): Promise<ChapterCraftResult> {
  const prose = stripNovelChangeRecord(args.content)
  const tags = parseChapterCraftTags(args.writingBrief, args.chapterOutline, prose)
  const minScore = resolveChapterCraftMinScore(args.meta)
  const requireTwo = args.meta.chapter_craft_require_two_functions !== false
  const checkedAt = new Date().toISOString()
  const contentHash = hashNovelContent(prose)

  const outlineBlob = [args.meta.outline || '', args.chapterOutline || ''].join('\n\n')
  const outlineDrama = assertOutlineChapterFields(outlineBlob, args.chapterNumber)
  const dramaPrompt = outlineDrama.fields
    ? buildChapterOutlineDramaPromptBlock(outlineDrama.fields)
    : ''

  const user = [
    `【书名】${args.dramaTitle}`,
    `【章号】第${args.chapterNumber}章`,
    tags.role ? `【章职】${tags.role}` : '',
    tags.emotionDebt ? `【情绪债标注】${tags.emotionDebt}` : '',
    tags.promise ? `【承诺标注】${tags.promise}` : '',
    tags.stage ? `【舞台标注】${tags.stage}` : '',
    dramaPrompt ? dramaPrompt : '',
    args.writingBrief?.trim() ? `【写作说明】\n${trunc(args.writingBrief, 1200)}` : '',
    args.chapterOutline?.trim() ? `【本章大纲】\n${trunc(args.chapterOutline, 600)}` : '',
    `【正文字数】${countNovelChars(prose)}`,
    '【待审校正文】',
    trunc(prose, 14000),
  ].filter(Boolean).join('\n\n')

  let parsed: Record<string, unknown> = {}
  let craftModelFailed = false
  try {
    const raw = await chatCompletionTextAudit(
      [
        { role: 'system', content: CRAFT_SYSTEM },
        { role: 'user', content: user },
      ],
      {
        temperature: 0.2,
        maxTokens: 4096,
        billing: args.billing
          ? { ...args.billing, reason: args.billing.reason || '小说章节质量审校' }
          : undefined,
      },
    )
    if (!raw?.trim()) {
      craftModelFailed = true
      parsed = {}
    } else {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw || '{}') as Record<string, unknown>
      if (!Object.keys(parsed).length) craftModelFailed = true
    }
  } catch {
    craftModelFailed = true
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
  let drama_gates = normalizeDramaGates(parsed.drama_gates)
  // 解析失败且无 conflicts 时旧逻辑抬分，但 drama_gates 缺码视为未过，避免假通过
  let drama_gate_passed = computeDramaGatePassed(drama_gates)

  // 审校模型空正文/抛错：勿把「戏剧门全无」当成硬失败去整章重写（会反复生成同一模板开篇）
  const softAlerts: Array<{ code: string; message: string }> = []
  let skipAppealGates = craftModelFailed
  if (craftModelFailed || (!Number.isFinite(scoreRaw) && Object.keys(parsed).length === 0)) {
    skipAppealGates = true
    score = Math.max(minScore, 72)
    for (const code of DRAMA_GATE_CODES) {
      drama_gates[code] = { level: '弱', note: '审校未返回有效结果，暂缓门禁' }
    }
    drama_gate_passed = true
    softAlerts.push({
      code: 'craft_model_unavailable',
      message: '质量审校模型未返回正文，已跳过戏剧门硬拦，避免空转重写',
    })
  }

  // 开篇吸引力硬信号：压力窗口/卖点首屏/醒炕盘点/扩展 L1 → opening_promise=无，触发 craft 修写
  // 模型不可用时跳过 L1 硬拦与 L2，避免空转
  let feel: AppealFeelResult | null = null
  if (!skipAppealGates) {
    const hardOpens = listOpeningAppealHardFails(prose, args.chapterNumber, args.priorChapterContent)
    if (hardOpens.length) {
      drama_gates.opening_promise = {
        level: '无',
        note: hardOpens.map((h) => h.message).join('；').slice(0, 120),
      }
      drama_gate_passed = computeDramaGatePassed(drama_gates)
      logTaskWarn('Novel', 'appeal-l1-hard-fail', {
        chapterNumber: args.chapterNumber,
        codes: hardOpens.map((h) => h.code),
      })
    } else if (shouldRunAppealFeelAudit({
      chapterNumber: args.chapterNumber,
      craftModelFailed: false,
      hardFailCount: 0,
    })) {
      feel = await runAppealFeelAudit({
        content: prose,
        chapterNumber: args.chapterNumber,
        dramaTitle: args.dramaTitle,
        billing: args.billing
          ? { ...args.billing, reason: '小说章节吸引力观感审' }
          : undefined,
      })
      if (!feel.unavailable) {
        const veto = applyAppealFeelVeto(drama_gates, feel)
        drama_gates = veto.drama_gates
        if (veto.vetoed) {
          drama_gate_passed = computeDramaGatePassed(drama_gates)
          logTaskWarn('Novel', 'appeal-l2-flat', {
            chapterNumber: args.chapterNumber,
            note: veto.note,
          })
        }
      }
    }
  }

  const passed = !complianceVeto && score >= minScore && (craftModelFailed || (functionOk && drama_gate_passed))

  const appeal = buildCommercialAppealAudit({
    craft: { drama_gates, checked_at: checkedAt },
    content: prose,
    chapterNumber: args.chapterNumber,
    priorChapterContent: args.priorChapterContent,
    feel: feel && !feel.unavailable ? feel : null,
  })
  for (const d of appeal.dimensions) {
    if (d.level === 'soft' || (d.level === '无' && d.code !== 'opening_promise' && d.code !== 'hook_on_page')) {
      softAlerts.push({ code: `appeal_${d.code}`, message: d.message })
    }
  }

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
    drama_gates,
    drama_gate_passed,
    soft_alerts: softAlerts,
    appeal,
  }
}

export function buildChapterCraftFixPrompt(basePrompt: string, craft: ChapterCraftResult): string {
  const missing = (code: typeof DRAMA_GATE_CODES[number]) =>
    craft.drama_gates?.[code]?.level === '无'
  // 吸引力优先：开篇承诺、章尾钩先于其他戏剧闸
  const priorityCodes: Array<typeof DRAMA_GATE_CODES[number]> = [
    'opening_promise',
    'hook_on_page',
  ]
  const restCodes = DRAMA_GATE_CODES.filter(c => !priorityCodes.includes(c))
  const ordered = [...priorityCodes, ...restCodes].filter(missing)
  // 语义四拍（恨爽急盼字距/词表）不进硬修；仅字面可验结构 + 观感 flat
  const appealHard = (craft.appeal?.dimensions || []).filter(d =>
    !d.passed && (
      d.code === 'wake_inventory_opening'
      || d.code === 'opening_pressure_window'
      || d.code === 'opening_sell_point'
      || d.code === 'hate_thin_decompress'
      || d.code === 'opening_soft_collapse'
      || d.code === 'post_climax_decompress'
      || d.code === 'post_hook_dump'
      || d.code === 'stakes_mismatch'
      || d.code === 'soft_ending_dump'
      || d.code === 'shuang_isomorph'
      || d.code === 'llm_feel_flat'
    ),
  )
  const gateFixes = ordered.map((code, i) => {
    const tip = code === 'opening_promise'
      ? (
        appealHard.length
          ? `开篇吸引力未过：${appealHard.map(d => d.message).join('；')}。须冲突前置开篇；爽须动作震慑+本事露尖；急须天数；盼短缺一环；禁醒炕盘点`
          : /醒炕|苏醒|压力方|卖点|糊糊|翻身|重复盘点|观感审/.test(craft.drama_gates?.opening_promise?.note || '')
            ? '开篇约前300字须先落压力方对白/对峙，并亮出卖点冲突物；穿越最多嵌一句；禁止冻醒盘点与重复家底'
            : '开篇约前300～800字须有本章看点/冲突或对白承诺，禁止纯盘点开场'
      )
      : code === 'hook_on_page'
        ? '章尾须落到未决具体事件钩（急/盼），禁止纯感慨或工序/温情泄压收束'
        : (craft.drama_gates[code]?.note || '请对照本章大纲该字段用行动写出来')
    return `${i + 1}. 大纲戏剧未落地【${code}】：${tip}`
  })
  const feelFix = appealHard.find(d => d.code === 'llm_feel_flat')?.message
  const appealHardBlock = appealHard.length
    ? [
      buildAppealSingleCodeFixBlock({
        hardFails: appealHard
          .filter(d => d.code !== 'llm_feel_flat')
          .map((d) => ({ code: d.code, message: d.message })),
      }),
      feelFix ? `观感指令：${feelFix}` : '',
    ].filter(Boolean)
    : []
  const lines = [
    '【章节质量修正任务】上一稿未达好章节标准，请重写本章正文（可保留可用情节），必须修好下列问题：',
    ...craft.conflicts.slice(0, 8).map((c, i) => `${i + 1}. ${c}`),
    ...gateFixes,
    ...appealHardBlock,
    craft.compliance_veto
      ? `合规否决：${craft.compliance_reasons.join('；') || '触及红线'}——须彻底改写避开。`
      : '',
    `当前分 ${craft.score}，须 ≥ ${craft.min_score}；functions_hit 须 ≥ 2；大纲戏剧门槛须全部为有/弱。`,
    '优先修：①开篇承诺（opening_promise）②章尾钩（hook_on_page）③欲望/阻碍/选择/局面变化；禁止只加水字数或空喊口号；禁止重演上章闭合交付。',
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
