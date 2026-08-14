/**
 * 吸引力 L2 观感审（短 JSON；仅 flat===true 否决）
 * 与 continuity 解耦；失败须经 opening_promise=无 才能触发 craft。
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import {
  APPEAL_L1_EXTENDED_MAX_CHAPTER,
  listOpeningAppealHardFails,
} from './novel-commercial-appeal-audit.js'

export type AppealFeelResult = {
  flat: boolean
  mid_cooling: boolean
  missing_payoff: string
  fix_directive: string
  /** 模型/解析失败时为 true，不否决 */
  unavailable?: boolean
}

type GateEntry = { level: string; note?: string; excerpt?: string }

const FEEL_SYSTEM = `你是男频网文「商业吸引力」短审。只判断读感是否平淡，不评文风炫技，不评连贯性吃书。
只输出 JSON：
{"flat":true|false,"mid_cooling":true|false,"missing_payoff":"短句","fix_directive":"一句可执行修写指令"}
flat=true 仅当：开篇/中段明显降温、重复盘点、爽点过晚、像催债流水账。
flat=false 若冲突推进快、主角有反制、能力/对赌较早落地。
禁止长评、禁止 markdown。`

function trunc(s: string, max: number) {
  const t = (s || '').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

export function shouldRunAppealFeelAudit(args: {
  chapterNumber: number
  craftModelFailed: boolean
  hardFailCount: number
}): boolean {
  if (args.craftModelFailed) return false
  if (args.hardFailCount > 0) return false
  const n = args.chapterNumber
  return n >= 1 && n <= APPEAL_L1_EXTENDED_MAX_CHAPTER
}

/** 仅 flat===true 时改写 opening_promise，使 craft.passed 可失败 */
export function applyAppealFeelVeto<T extends Record<string, GateEntry>>(
  drama_gates: T,
  feel: Pick<AppealFeelResult, 'flat' | 'fix_directive' | 'missing_payoff'>,
): { drama_gates: T; vetoed: boolean; note: string } {
  if (!feel.flat) {
    return { drama_gates, vetoed: false, note: '' }
  }
  const note = (feel.fix_directive || feel.missing_payoff || '观感审：开篇/中段平淡').slice(0, 120)
  const prev = drama_gates.opening_promise?.note
  const merged = prev && !prev.includes(note.slice(0, 12)) ? `${prev}；${note}` : note
  return {
    drama_gates: {
      ...drama_gates,
      opening_promise: { level: '无', note: merged.slice(0, 120) },
    },
    vetoed: true,
    note,
  }
}

export function parseAppealFeelJson(raw: string): AppealFeelResult {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  const blob = start >= 0 && end > start ? raw.slice(start, end + 1) : raw
  const parsed = JSON.parse(blob || '{}') as Record<string, unknown>
  return {
    flat: parsed.flat === true,
    mid_cooling: parsed.mid_cooling === true,
    missing_payoff: typeof parsed.missing_payoff === 'string' ? parsed.missing_payoff.slice(0, 80) : '',
    fix_directive: typeof parsed.fix_directive === 'string' ? parsed.fix_directive.slice(0, 120) : '',
  }
}

export async function runAppealFeelAudit(args: {
  content: string
  chapterNumber: number
  dramaTitle: string
  billing?: TextBillingContext
}): Promise<AppealFeelResult> {
  try {
    const raw = await chatCompletionTextAudit(
      [
        { role: 'system', content: FEEL_SYSTEM },
        {
          role: 'user',
          content: [
            `【书名】${args.dramaTitle}`,
            `【章号】第${args.chapterNumber}章`,
            '【正文】',
            trunc(args.content, 8000),
          ].join('\n'),
        },
      ],
      {
        temperature: 0.2,
        maxTokens: 512,
        billing: args.billing
          ? { ...args.billing, reason: args.billing.reason || '小说章节吸引力观感审' }
          : undefined,
      },
    )
    if (!raw?.trim()) {
      return {
        flat: false,
        mid_cooling: false,
        missing_payoff: '',
        fix_directive: '',
        unavailable: true,
      }
    }
    return parseAppealFeelJson(raw)
  } catch {
    return {
      flat: false,
      mid_cooling: false,
      missing_payoff: '',
      fix_directive: '',
      unavailable: true,
    }
  }
}

/** 供单测：L1 硬失败时不应跑 L2 */
export function countAppealL1HardFails(content: string, chapterNumber: number): number {
  return listOpeningAppealHardFails(content, chapterNumber).length
}
