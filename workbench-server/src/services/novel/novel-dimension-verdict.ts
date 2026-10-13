/**
 * 模型审 21 维逻辑自洽判定（状态卡 6 + 账本 15）
 * 通过/不通过须有总因；每维 ok|fail|na + 原因；fail 须附摘录。
 */
import { CONTINUITY_LEDGER_DIM_LABELS } from '../../common/novel/novel-continuity-state.js'
import { STATE_CARD_SIX_DIM_LABELS } from '../../common/novel/novel-state-card.js'
import type { SeamStructureVerdict } from './novel-seam-structure-verdict.js'
import {
  enforceSeamStructureOnConflictMessages,
  enforceSeamStructureOnDimensionReport,
} from './novel-seam-structure-verdict.js'

export const DIMENSION_AUDIT_LABELS: readonly string[] = [
  ...STATE_CARD_SIX_DIM_LABELS,
  ...CONTINUITY_LEDGER_DIM_LABELS,
]

export type DimensionVerdictStatus = 'ok' | 'fail' | 'na'

export type DimensionVerdict = {
  dimension: string
  status: DimensionVerdictStatus
  reason: string
  excerpt?: string
}

export type DimensionAuditReport = {
  /** 是否凑齐 21 维 */
  complete: boolean
  failCount: number
  dimensions: DimensionVerdict[]
  overallReason: string
}

const STATUS_SET = new Set<DimensionVerdictStatus>(['ok', 'fail', 'na'])

/** 写入模型 system 提示的 JSON 契约（两套审校共用） */
export const DIMENSION_AUDIT_OUTPUT_CONTRACT = `你必须按 **21 维**逐轴判定逻辑自洽。禁止 passed/ok=true 却不交 dimensions。

**输出键顺序（防截断丢维）**：先 dimensions，再 score/passed/ok，再 reason，最后 conflicts/violations。
ok 维 reason 控制在 12 字内；禁止先写长散文总因再省略 dimensions。

21 维名（须全部出现，名须一致）：
${DIMENSION_AUDIT_LABELS.map((d, i) => `${i + 1}.${d}`).join(' ')}

dimensions 推荐数组：
{"dimensions":[{"dimension":"时间线","status":"ok","reason":"跨日桥承接"},…共21项],"score":88,"passed":true,"reason":"总因一句","conflicts":[]}

亦接受对象表（维名→status 或维名→{status,reason,excerpt}）：
{"dimensions":{"时间线":"ok","地点":{"status":"ok","reason":"同场合"}},"score":88,"passed":true,"reason":"总因一句"}

每维 status：
- ok：该轴逻辑自洽（短 reason）
- fail：逻辑不自洽（reason 点明断裂；excerpt=待审正文连续≥8字原文）
- na：状态卡/账本未记录且无推断冲突（reason 写「未记录且无推断冲突」）

总则：任一维 fail → 不通过；21 维齐全且无 fail 才可通过。
「允许倒叙/补叙」不免除自洽；无框再演已越过节点 → 相关维须 fail。
**章内在场相位（须拦）**：独处/离场已立后，他者无同行/赶来/切场/闪回框即以同场动作/对白出场 → **人物**与/或**动作逻辑**须 fail。
**章内进度回卷（须拦）**：同章内完成态过程无框再完整换皮重演 → **动作逻辑**须 fail。
**审校纪律**：≥800 字禁止以「仅截取开篇」为由不通过；章缝跳切须与结构卡 same/bridged/jump 一致；同一根因相关维最多 2～3 个 fail。`

function truncReason(s: string, n = 160): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if ([...t].length <= n) return t
  return `${[...t].slice(0, n).join('')}…`
}

function normalizeStatus(raw: unknown): DimensionVerdictStatus | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().toLowerCase()
  if (t === 'ok' || t === 'pass' || t === '通过' || t === '自洽') return 'ok'
  if (t === 'fail' || t === 'bad' || t === '不通过' || t === '不自洽' || t === '冲突') return 'fail'
  if (t === 'na' || t === 'n/a' || t === '未记录' || t === '不适用' || t === 'skip') return 'na'
  return null
}

function excerptInContent(excerpt: string, content: string): boolean {
  const ex = excerpt.replace(/\s+/g, '')
  const body = content.replace(/\s+/g, '')
  if ([...ex].length < 8) return false
  if (body.includes(ex)) return true
  // 允许摘录略短滑动：取前 12 字
  const head = [...ex].slice(0, 12).join('')
  return head.length >= 8 && body.includes(head)
}

/**
 * 把模型交的 dimensions 归一成数组行。
 * 常见漏交根因：模型交对象表（维名→status）或中文键「维度」，旧逻辑只认数组 → 当成没交。
 */
export function normalizeDimensionsField(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const out: unknown[] = []
  for (const label of DIMENSION_AUDIT_LABELS) {
    if (!(label in obj)) continue
    const v = obj[label]
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out.push({ dimension: label, status: v, reason: '' })
      continue
    }
    if (v && typeof v === 'object') {
      const row = v as Record<string, unknown>
      out.push({
        dimension: label,
        status: row.status ?? row.state ?? row.result,
        reason: row.reason ?? row.msg ?? '',
        excerpt: row.excerpt,
      })
    }
  }
  return out.length ? out : null
}

/**
 * 解析模型 JSON 中的 dimensions / reason。
 * 缺维、fail 无有效摘录 → complete=false 或降级该维。
 */
export function parseDimensionAuditReport(
  parsed: unknown,
  content: string,
): DimensionAuditReport | null {
  if (!parsed || typeof parsed !== 'object') return null
  const src = parsed as Record<string, unknown>
  const overallReason = truncReason(
    typeof src.reason === 'string' && src.reason.trim()
      ? src.reason
      : typeof src.summary === 'string' ? src.summary : '',
    240,
  )

  const rawDims = normalizeDimensionsField(src.dimensions)
    ?? normalizeDimensionsField(src['维度'])
  if (!rawDims) {
    return {
      complete: false,
      failCount: 0,
      dimensions: [],
      overallReason,
    }
  }

  const byName = new Map<string, DimensionVerdict>()
  for (const item of rawDims) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const dimension = typeof row.dimension === 'string' ? row.dimension.trim() : ''
    if (!dimension || !DIMENSION_AUDIT_LABELS.includes(dimension)) continue
    const status = normalizeStatus(row.status)
    if (!status) continue
    let reason = truncReason(typeof row.reason === 'string' ? row.reason : '', 160)
    let excerpt = typeof row.excerpt === 'string' ? row.excerpt.replace(/\s+/g, ' ').trim() : ''
    if (status === 'fail') {
      if (!excerpt || !excerptInContent(excerpt, content)) {
        // fail 无有效摘录：仍记 fail，但标 incomplete（调用方不得当软通过）
        if (!reason) reason = '逻辑不自洽（缺可核对摘录）'
        byName.set(dimension, { dimension, status: 'fail', reason, excerpt: excerpt || undefined })
        continue
      }
      if (!reason) reason = '逻辑不自洽'
      byName.set(dimension, { dimension, status: 'fail', reason, excerpt: excerpt.slice(0, 80) })
      continue
    }
    if (!reason) {
      reason = status === 'na' ? '未记录且无推断冲突' : '逻辑自洽'
    }
    byName.set(dimension, { dimension, status, reason })
  }

  const dimensions: DimensionVerdict[] = DIMENSION_AUDIT_LABELS.map(dimension => {
    const hit = byName.get(dimension)
    if (hit) return hit
    return {
      dimension,
      status: 'na' as const,
      reason: '模型未出具该维判定',
    }
  })

  const namedCount = byName.size
  const failCount = dimensions.filter(d => d.status === 'fail').length
  const missingLabeled = DIMENSION_AUDIT_LABELS.filter(d => !byName.has(d)).length
  // 允许少量漏维用 na 占位，但漏维过多视为不完整（>3）
  const complete = namedCount >= DIMENSION_AUDIT_LABELS.length - 3
    && !dimensions.some(d => d.status === 'fail' && !d.excerpt && d.reason.includes('缺可核对摘录'))
    // 若大量「模型未出具」则 incomplete
    && missingLabeled <= 3

  return {
    complete: complete && namedCount > 0,
    failCount,
    dimensions,
    overallReason,
  }
}

/** fail 维 → 带摘录的 conflict 文案 */
export function conflictsFromDimensionFails(report: DimensionAuditReport): string[] {
  const out: string[] = []
  for (const d of report.dimensions) {
    if (d.status !== 'fail') continue
    const ex = d.excerpt ? `摘录「${d.excerpt}」` : ''
    out.push(`【${d.dimension}】${d.reason}${ex ? `；${ex}` : ''}`)
  }
  return out.slice(0, 8)
}

const TRUNC_CLAIM_RE = /仅截取|开篇数句|未构成完整章节|无法验证与上章|无法验证.*自洽|正文过短|只有开头几句/

/**
 * 全文已达完整章量时，剔除「仅截取开篇」类误杀。
 * 跳切/空降误杀改由章缝结构卡强制对齐（非词表 scrub）。
 */
export function scrubDimensionAuditFalsePositives(
  report: DimensionAuditReport | null,
  content: string,
  _chapterOutline?: string,
  seamVerdict?: SeamStructureVerdict | null,
): DimensionAuditReport | null {
  if (!report) return null
  const chars = [...content.replace(/\s+/g, '')].length

  let failCount = 0
  const dimensions = report.dimensions.map(d => {
    if (d.status !== 'fail') return d
    const blob = `${d.reason}${d.excerpt || ''}`
    if (chars >= 800 && TRUNC_CLAIM_RE.test(blob) && !/跳切|无过渡|无交代|断裂|场合|地点/.test(blob)) {
      return {
        dimension: d.dimension,
        status: 'ok' as const,
        reason: '全文已达完整章量，不以截取开篇为由判不自洽',
      }
    }
    failCount += 1
    return d
  })
  let overallReason = report.overallReason
  if (chars >= 800 && TRUNC_CLAIM_RE.test(overallReason)) {
    const firstFail = dimensions.find(d => d.status === 'fail')?.reason
    overallReason = failCount === 0
      ? '全文已达完整章量；截取开篇类误判已剔除'
      : (firstFail || '章缝或章内仍有逻辑不自洽，详见维度判定')
  }

  const truncated: DimensionAuditReport = {
    ...report,
    dimensions,
    failCount,
    overallReason: truncReason(overallReason, 240),
  }
  return enforceSeamStructureOnDimensionReport(truncated, seamVerdict ?? null)
}

/** 模型 conflicts：截取开篇类可滤；跳切/空降对齐结构卡 */
export function scrubModelConflictMessages(
  messages: string[],
  content: string,
  _chapterOutline?: string,
  seamVerdict?: SeamStructureVerdict | null,
): string[] {
  const chars = [...content.replace(/\s+/g, '')].length
  const afterTrunc = messages.filter((m) => {
    if (chars >= 800 && TRUNC_CLAIM_RE.test(m) && !/跳切|无过渡|无交代|断裂|场合|地点/.test(m)) {
      return false
    }
    return true
  })
  return enforceSeamStructureOnConflictMessages(afterTrunc, seamVerdict ?? null)
}

/** 模型声称通过但未交齐 21 维 / 无总因 → 视为审校不合格 */
export function dimensionPassClaimInvalid(
  claimedPass: boolean,
  report: DimensionAuditReport | null,
): string | null {
  if (!claimedPass) return null
  if (!report || report.dimensions.length === 0) {
    return '模型声称通过但未交 dimensions（缺键/空数组/非对象表）；总因不能代替 21 维结构'
  }
  if (!report.complete) {
    return '模型声称通过但 21 维判定不完整或 fail 缺摘录'
  }
  if (report.failCount > 0) {
    return '模型声称通过但存在维度逻辑不自洽'
  }
  if (!report.overallReason.trim()) {
    return '模型声称通过但未给出通过原因'
  }
  return null
}
