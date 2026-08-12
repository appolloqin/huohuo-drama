/**
 * 模型审 21 维逻辑自洽判定（状态卡 6 + 账本 15）
 * 通过/不通过须有总因；每维 ok|fail|na + 原因；fail 须附摘录。
 */
import { CONTINUITY_LEDGER_DIM_LABELS } from '../../common/novel/novel-continuity-state.js'
import { STATE_CARD_SIX_DIM_LABELS } from '../../common/novel/novel-state-card.js'

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
export const DIMENSION_AUDIT_OUTPUT_CONTRACT = `你必须按 **21 维**逐轴判定逻辑自洽，并给出通过/不通过总因。禁止只回 ok/passed 而无 dimensions。

21 维名（须全部出现，顺序可乱，名须一致）：
${DIMENSION_AUDIT_LABELS.map((d, i) => `${i + 1}.${d}`).join(' ')}

每维 status：
- ok：该轴逻辑自洽（reason 须一句说明为何说得通）
- fail：该轴逻辑不自洽（reason 点明断裂点；excerpt 须为待审正文连续 8 字以上原文）
- na：该维在状态卡/账本为未记录，且正文与邻章事实无法推出该维冲突（reason 写「未记录且无推断冲突」）

总则：任一维 fail → 整体不通过；全部齐全且无 fail 才可通过。
「允许倒叙/补叙」不免除自洽；无框再演已越过节点 → 相关维须 fail。

**章内进度回卷（须拦）**：同一章内，某段推进过程已写到完成态，后文又无闪回/补叙框、以当前进行时把**同一完成态过程**完整换皮再写一遍 → **动作逻辑**须 fail（可兼刚发生/本章变化）。只问进度是否说得通，不限题材场面。一句承接或有框回忆不算。`

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

  const rawDims = Array.isArray(src.dimensions) ? src.dimensions : null
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

/** 模型声称通过但未交齐 21 维 / 无总因 → 视为审校不合格 */
export function dimensionPassClaimInvalid(
  claimedPass: boolean,
  report: DimensionAuditReport | null,
): string | null {
  if (!claimedPass) return null
  if (!report || report.dimensions.length === 0) {
    return '模型声称通过但未按 21 维出具逻辑自洽判定'
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
