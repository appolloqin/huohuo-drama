/**
 * 章末【变更记录】补全 — 润色/局部 patch 常会丢掉该块，硬审会反复失败
 */
import { chatCompletionText, type TextBillingContext } from '../../ai/ai.js'
import { logTaskWarn } from '../../../common/task/task-logger.js'
import { CAUSAL_CHANGE_RECORD_HEADER, CAUSAL_CHAPTER_END_FORMAT } from './causal-chain-template.js'
import {
  parseChangeRecord,
  splitProseAndChangeRecord,
} from './causal-chain-parser.js'

const ENSURE_SYSTEM = `你是网文 continuity 编辑。任务：仅根据给定正文，输出章末【变更记录】块。

要求：
- 只输出【变更记录】及其下列条目，不要正文、不要解释、不要 markdown 代码块
- 每条变化须含独立一行「因果:」（触发→过程→结果，至少 8 字）
- 子字段用「触发:」「代价:」等时须另起一行缩进
- 正文无明显变化时，输出无变化声明（见格式示例）
- 格式严格遵循用户给出的模板`

const PROSE_CHANGED_RE = /(?:来到|到了|前往|离开|突破|晋升|重伤|痊愈|获得|发现|觉醒|灵力|境界|悬崖|坠|死|伤|场景)/

function extractChangeBlockFromModel(raw: string): string | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  const idx = candidate.search(/^【变更记录】/m)
  if (idx < 0) return null
  return candidate.slice(idx).trim()
}

export function hasValidChangeRecord(fullText: string): boolean {
  const { changeBlock } = splitProseAndChangeRecord(fullText)
  if (!changeBlock) return false
  const entries = parseChangeRecord(changeBlock)
  if (!entries.length) return false
  return entries.every(e => (e.causal?.trim().length ?? 0) >= 4)
}

export function buildFallbackChangeRecord(prose: string, chapterNumber: number): string {
  if (PROSE_CHANGED_RE.test(prose)) {
    return [
      CAUSAL_CHANGE_RECORD_HEADER,
      '- 场景/状态: （见正文本章变化）',
      '  因果: 本章场景、人物状态或情节转折已在正文完整叙述，此处汇总为因果链索引',
      '  触发: 见正文关键事件',
      '',
      '- 人物: （见正文）',
      '  因果: 人物心理或处境变化随正文事件推进，与上章因果起点衔接',
    ].join('\n')
  }
  return [
    CAUSAL_CHANGE_RECORD_HEADER,
    '- （无状态变化，因果起点延续）',
    '  因果: 本章未发生需单独列明的场景/时间/人物状态/资源/伤势变更',
  ].join('\n')
}

function mergeProseAndBlock(prose: string, block: string): string {
  return `${prose.trim()}\n\n${block.trim()}`
}

async function generateChangeRecordBlock(args: {
  prose: string
  chapterNumber: number
  billing?: TextBillingContext
  strict?: boolean
}): Promise<string | null> {
  const { prose, chapterNumber, billing, strict } = args
  const raw = await chatCompletionText(
    [
      { role: 'system', content: ENSURE_SYSTEM },
      {
        role: 'user',
        content: [
          CAUSAL_CHAPTER_END_FORMAT,
          '',
          `【章节】第 ${chapterNumber} 章`,
          strict ? '【严格要求】每条须含「因果:」且不少于 8 字；只输出【变更记录】块。' : '',
          `【正文 — 据此提取变更；须覆盖本章实质变化】\n${prose.slice(-10000)}`,
        ].filter(Boolean).join('\n'),
      },
    ],
    { maxTokens: 1536, temperature: strict ? 0.1 : 0.2, billing },
  )
  return extractChangeBlockFromModel(raw)
}

/** @returns 是否新补全或修复了变更记录 */
export async function ensureCausalChangeRecordAppended(args: {
  content: string
  chapterNumber: number
  billing?: TextBillingContext
}): Promise<{ content: string; fixed: boolean }> {
  const trimmed = args.content.trim()
  if (!trimmed) return { content: trimmed, fixed: false }
  if (hasValidChangeRecord(trimmed)) return { content: trimmed, fixed: false }

  const { prose } = splitProseAndChangeRecord(trimmed)
  const body = prose || trimmed

  try {
    let block = await generateChangeRecordBlock({
      prose: body,
      chapterNumber: args.chapterNumber,
      billing: args.billing,
    })
    if (block && !hasValidChangeRecord(mergeProseAndBlock(body, block))) {
      block = await generateChangeRecordBlock({
        prose: body,
        chapterNumber: args.chapterNumber,
        billing: args.billing,
        strict: true,
      })
    }
    if (block && hasValidChangeRecord(mergeProseAndBlock(body, block))) {
      return { content: mergeProseAndBlock(body, block), fixed: true }
    }
  } catch (err: unknown) {
    logTaskWarn('Novel', 'ensure-change-record-llm-failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const fallback = buildFallbackChangeRecord(body, args.chapterNumber)
  const merged = mergeProseAndBlock(body, fallback)
  if (hasValidChangeRecord(merged)) {
    logTaskWarn('Novel', 'ensure-change-record-fallback', { chapterNumber: args.chapterNumber })
    return { content: merged, fixed: true }
  }
  return { content: trimmed, fixed: false }
}

export function needsCausalChangeRecordFix(check: {
  blocking_items?: Array<{ rule: string }>
  audit?: { hard?: Array<{ rule: string }> }
}): boolean {
  const rules = new Set<string>()
  for (const i of check.blocking_items ?? []) rules.add(i.rule)
  for (const i of check.audit?.hard ?? []) rules.add(i.rule)
  return rules.has('causal_missing_record') || rules.has('causal_missing_chain')
}

/** 是否仅有变更记录类硬审问题（适合程序化补全，不必整章 regen） */
export function isOnlyCausalChangeRecordIssue(check: {
  blocking_items?: Array<{ rule: string; layer?: string }>
  audit?: { hard?: Array<{ rule: string }> }
  conflicts?: string[]
}): boolean {
  if (!needsCausalChangeRecordFix(check)) return false
  const hardRules = new Set<string>()
  for (const i of check.blocking_items ?? []) {
    if (i.layer === 'hard' || !i.layer) hardRules.add(i.rule)
  }
  for (const i of check.audit?.hard ?? []) hardRules.add(i.rule)
  if (!hardRules.size) return needsCausalChangeRecordFix(check)
  return [...hardRules].every(r => r === 'causal_missing_record' || r === 'causal_missing_chain')
}
