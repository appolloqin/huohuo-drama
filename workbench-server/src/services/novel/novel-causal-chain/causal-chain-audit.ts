/**
 * 因果链轻量审校 — 只审因果是否成立，不审「状态是否与上章完全一致」
 */
import {
  extractChangeRecordFromChapter,
  isNoChangeDeclared,
  splitProseAndChangeRecord,
  type CausalChangeEntry,
} from './causal-chain-parser.js'

export type CausalAuditItem = {
  rule: string
  message: string
  layer: 'hard' | 'rule'
}

export type CausalAuditResult = {
  passed: boolean
  hard: CausalAuditItem[]
  rule: CausalAuditItem[]
  entries: CausalChangeEntry[]
  summary: string
}

const SCENE_JUMP = /不知不觉(?:来到|到了|走到)|转瞬(?:便|就)(?:来到|到了)|赫然(?:发现|已在)|竟(?:然)?(?:来到|到了)/
const TIME_JUMP = /转眼(?:间)?(?:到了|已是|来到)|不知过了多久|翌日|次日|第二天(?!的因果)/
const IDENTITY_REVEAL = /原来(?:是|竟|竟然)|竟是(?:那|这)|居然是/
const PLAN_ABRUPT = /(?:主角|他|她)(?:决定|打算|选择)(?:正面|强行|直接)(?:迎击|出手|硬拼)(?!.*(?:因为|由于|见|察觉))/
const ITEM_ABRUPT = /突然(?:获得|得到|拥有|领悟)|凭空(?:出现|多出)|神器(?:降临|认主)/
const INJURY_CONFLICT = /(?:身受重伤|重伤濒死|经脉尽断|血肉模糊).{0,40}(?:健步如飞|毫发无伤|生龙活虎)/

const DIMENSION_CAUSAL_MIN = 4

function auditChangeEntries(entries: CausalChangeEntry[]): CausalAuditItem[] {
  const out: CausalAuditItem[] = []
  for (const e of entries) {
    if (isNoChangeDeclared([e])) continue
    if (!e.causal || e.causal.length < DIMENSION_CAUSAL_MIN) {
      out.push({
        layer: 'hard',
        rule: 'causal_missing_chain',
        message: `【变更记录】「${e.dimension}: ${e.change}」缺少有效因果链（因果字段须说明触发→过程→结果）`,
      })
    }
  }
  return out
}

function auditProseAntiPatterns(prose: string, entries: CausalChangeEntry[]): CausalAuditItem[] {
  const out: CausalAuditItem[] = []
  const blob = entries.map(e => `${e.dimension}${e.change}${e.causal}`).join(' ')
  const checks: { re: RegExp; rule: string; label: string }[] = [
    { re: SCENE_JUMP, rule: 'causal_scene_jump', label: '无因果场景跳转' },
    { re: TIME_JUMP, rule: 'causal_time_jump', label: '无因果时间跳跃' },
    { re: IDENTITY_REVEAL, rule: 'causal_identity_reveal', label: '身份揭示缺过程' },
    { re: ITEM_ABRUPT, rule: 'causal_item_abrupt', label: '物品/能力凭空获得' },
    { re: INJURY_CONFLICT, rule: 'causal_injury_conflict', label: '伤势与行动矛盾' },
  ]

  for (const { re, rule, label } of checks) {
    const m = prose.match(re)
    if (!m) continue
    const snippet = m[0]
    if (blob.includes(snippet.slice(0, Math.min(6, snippet.length)))) continue
    out.push({
      layer: rule === 'causal_injury_conflict' ? 'hard' : 'rule',
      rule,
      message: `${label}：正文「${snippet}…」须在【变更记录】中给出对应因果，或改写正文补充过程`,
    })
  }

  if (PLAN_ABRUPT.test(prose) && !/计划|触发|因果/.test(blob)) {
    out.push({
      layer: 'rule',
      rule: 'causal_plan_abrupt',
      message: '计划/决策突变：须有触发因素与新计划形成过程，或在【变更记录】中说明',
    })
  }

  return out
}

export function runCausalChainAudit(args: {
  content: string
  chapterNumber: number
}): CausalAuditResult {
  const { content, chapterNumber } = args
  const { prose } = splitProseAndChangeRecord(content)
  const entries = extractChangeRecordFromChapter(content)

  const hard: CausalAuditItem[] = []
  const rule: CausalAuditItem[] = []

  if (!entries.length && !isNoChangeDeclared(entries)) {
    const likelyChanged = /(?:来到|到了|前往|离开|突破|晋升|重伤|痊愈|获得|发现|觉醒|灵力|境界)/.test(prose)
    if (likelyChanged) {
      hard.push({
        layer: 'hard',
        rule: 'causal_missing_record',
        message: chapterNumber <= 1
          ? '第1章须在章末附【变更记录】以建立初始因果链（场景/境界/能力等变化须列明因果；若无变化亦须声明）'
          : '须在章末附【变更记录】；正文有状态/场景变化时须列明因果链，无变化亦须声明',
      })
    } else if (chapterNumber >= 1) {
      hard.push({
        layer: 'hard',
        rule: 'causal_missing_record',
        message: '须在章末附【变更记录】；无状态变化亦须声明「无变化」及因果说明',
      })
    }
  }

  hard.push(...auditChangeEntries(entries).filter(i => i.layer === 'hard'))
  rule.push(...auditChangeEntries(entries).filter(i => i.layer === 'rule'))

  for (const item of auditProseAntiPatterns(prose, entries)) {
    if (item.layer === 'hard') hard.push(item)
    else rule.push(item)
  }

  const dedupe = (items: CausalAuditItem[]) => {
    const seen = new Set<string>()
    return items.filter(i => {
      const key = i.rule
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const h = dedupe(hard)
  const r = dedupe(rule)
  return {
    passed: h.length === 0,
    hard: h,
    rule: r,
    entries,
    summary: h.length
      ? `因果链硬审 ${h.length} 项未通过`
      : r.length
        ? `因果链通过，${r.length} 条软提示`
        : '因果链审校通过',
  }
}

export function formatCausalHardBlock(items: CausalAuditItem[]): string {
  if (!items.length) return ''
  return [
    '【因果链硬审 — 须补充因果或变更记录】',
    ...items.map(i => `- [${i.rule}] ${i.message}`),
  ].join('\n')
}

export function formatCausalRuleBlock(items: CausalAuditItem[]): string {
  if (!items.length) return ''
  return [
    '【因果链规则审 — 建议补充过程】',
    ...items.map(i => `- [${i.rule}] ${i.message}`),
  ].join('\n')
}
