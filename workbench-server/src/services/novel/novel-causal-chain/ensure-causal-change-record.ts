/**
 * 章末【变更记录】— 正文定稿后专用生成（与写章同轮解耦）。
 * 落库形态：正文与变更记录分离；审校可临时拼接，禁止把拼接结果当读者正文写回。
 */
import { chatCompletionText, type TextBillingContext } from '../../ai/ai.js'
import { logTaskWarn } from '../../../common/task/task-logger.js'
import { CAUSAL_CHANGE_RECORD_HEADER, CAUSAL_CHAPTER_END_FORMAT } from './causal-chain-template.js'
import { normalizeChangeRecordArtifacts } from '../../../common/novel/novel-change-record.js'
import {
  parseChangeRecord,
  resolveFullChapterForAudit,
  splitProseAndChangeRecord,
} from './causal-chain-parser.js'

const ENSURE_SYSTEM = `你是网文 continuity 编辑。任务：仅根据给定正文，输出章末【变更记录】块。

要求：
- 只输出【变更记录】及其下列条目，不要正文、不要解释、不要 markdown 代码块
- 每条变化须含独立一行「因果:」（触发→过程→结果，至少 8 字）
- 子字段用「触发:」「代价:」等时须另起一行缩进
- 正文无明显变化时，输出无变化声明（见格式示例）
- **禁止**写「见正文」「（见正文本章变化）」「汇总为因果链索引」等空壳占位
- 格式严格遵循用户给出的模板`

const PROSE_CHANGED_RE = /(?:来到|到了|前往|离开|突破|晋升|重伤|痊愈|获得|发现|觉醒|灵力|境界|悬崖|坠|死|伤|场景|签到|吐兵|列阵)/

/** 空壳占位：曾被当「合法」落库，导致读者正文粘上元数据垃圾 */
const STUB_CHANGE_RE =
  /见正文|见正文本章|汇总为因果链索引|此处汇总|（见正文）|\(见正文\)/

export function isStubChangeRecord(block: string | null | undefined): boolean {
  if (!block?.trim()) return false
  return STUB_CHANGE_RE.test(block)
}

/** 校验【变更记录】块（可单独块，也可正文+块拼接） */
export function hasValidChangeRecord(fullTextOrBlock: string): boolean {
  const t = (fullTextOrBlock || '').trim()
  if (!t) return false
  let changeBlock = splitProseAndChangeRecord(t).changeBlock
  if (!changeBlock && /^【变更记录】/m.test(t)) {
    changeBlock = t
  }
  if (!changeBlock) return false
  if (isStubChangeRecord(changeBlock)) return false
  const entries = parseChangeRecord(changeBlock)
  if (!entries.length) return false
  return entries.every(e => {
    const causal = e.causal?.trim() || ''
    if (causal.length < 8) return false
    if (STUB_CHANGE_RE.test(causal) || STUB_CHANGE_RE.test(e.change || '')) return false
    return true
  })
}

function extractChangeBlockFromModel(raw: string): string | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  const idx = candidate.search(/^【变更记录】/m)
  if (idx >= 0) {
    const block = candidate.slice(idx).trim()
    if (hasValidChangeRecord(block)) return block
  }
  const normalized = normalizeChangeRecordArtifacts(
    /【变更记录】/.test(candidate) ? candidate : `【变更记录】\n${candidate}`,
  )
  if (normalized.changeBlock && hasValidChangeRecord(normalized.changeBlock)) {
    return normalized.changeBlock
  }
  return null
}

/** 仅「无明显变化」时可用的程序化兜底；禁止「见正文」空壳 */
export function buildFallbackChangeRecord(prose: string, _chapterNumber: number): string {
  if (PROSE_CHANGED_RE.test(prose)) {
    return ''
  }
  return [
    CAUSAL_CHANGE_RECORD_HEADER,
    '- 状态: 无状态变化（因果起点延续）',
    '  因果: 本章未发生需单独列明的场景/时间/人物状态/资源/伤势变更',
  ].join('\n')
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
          strict
            ? '【严格要求】每条须含「因果:」且不少于 8 字；只输出【变更记录】块；禁止「见正文」占位。'
            : '',
          `【正文 — 据此提取变更；须覆盖本章实质变化】\n${prose.slice(-10000)}`,
        ].filter(Boolean).join('\n'),
      },
    ],
    {
      maxTokens: 1536,
      temperature: strict ? 0.1 : 0.2,
      billing,
      minimaxReasoningEffort: 'low',
    },
  )
  return extractChangeBlockFromModel(raw)
}

export type EnsureCausalChangeRecordResult = {
  /** 读者正文（永不附带【变更记录】） */
  prose: string
  /** 独立变更记录块；无效时为 null */
  changeBlock: string | null
  fixed: boolean
  /**
   * 仅供一致性审校临时入参（正文+记录拼接）。
   * 禁止赋给 episode.content / 返回给前端编辑区。
   */
  auditContent: string
}

/**
 * 生成/回收【变更记录】，与正文分离返回。
 * @param force 为 true 时忽略已有块，按正文强制重生成
 */
export async function ensureCausalChangeRecordAppended(args: {
  content: string
  chapterNumber: number
  billing?: TextBillingContext
  force?: boolean
  /** 已落库的独立变更记录（优先于粘在 content 里的块） */
  storedChangeRecord?: string | null
}): Promise<EnsureCausalChangeRecordResult> {
  const trimmed = args.content.trim()
  if (!trimmed) {
    return { prose: '', changeBlock: null, fixed: false, auditContent: '' }
  }

  const normalized = normalizeChangeRecordArtifacts(trimmed)
  const body = (normalized.prose || '').trim()
    || splitProseAndChangeRecord(trimmed).prose.trim()
    || trimmed

  const pick = (block: string | null | undefined, fixed: boolean): EnsureCausalChangeRecordResult => {
    const changeBlock = block?.trim() && hasValidChangeRecord(block) ? block.trim() : null
    return {
      prose: body,
      changeBlock,
      fixed,
      auditContent: resolveFullChapterForAudit(body, changeBlock),
    }
  }

  if (!args.force) {
    const existing = (args.storedChangeRecord?.trim() && hasValidChangeRecord(args.storedChangeRecord)
      ? args.storedChangeRecord.trim()
      : null)
      || (normalized.changeBlock && !isStubChangeRecord(normalized.changeBlock) && hasValidChangeRecord(normalized.changeBlock)
        ? normalized.changeBlock
        : null)
    if (existing) {
      return pick(existing, normalized.reclaimedFakeBlocks > 0 || !!normalized.changeBlock)
    }
  }

  try {
    let block = await generateChangeRecordBlock({
      prose: body,
      chapterNumber: args.chapterNumber,
      billing: args.billing,
    })
    if (block && !hasValidChangeRecord(block)) {
      block = await generateChangeRecordBlock({
        prose: body,
        chapterNumber: args.chapterNumber,
        billing: args.billing,
        strict: true,
      })
    }
    if (block && hasValidChangeRecord(block)) {
      return pick(block, true)
    }
  } catch (err: unknown) {
    logTaskWarn('Novel', 'ensure-change-record-llm-failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const fallback = buildFallbackChangeRecord(body, args.chapterNumber)
  if (fallback && hasValidChangeRecord(fallback)) {
    logTaskWarn('Novel', 'ensure-change-record-fallback', { chapterNumber: args.chapterNumber })
    return pick(fallback, true)
  }

  if (PROSE_CHANGED_RE.test(body)) {
    logTaskWarn('Novel', 'ensure-change-record-no-stub', { chapterNumber: args.chapterNumber })
  }
  return {
    prose: body,
    changeBlock: null,
    fixed: normalized.reclaimedFakeBlocks > 0 || isStubChangeRecord(normalized.changeBlock),
    auditContent: body,
  }
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
