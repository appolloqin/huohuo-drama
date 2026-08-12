/**
 * 21 维判定解析 / 空过关拒绝
 * Run: npx tsx scripts/verify-dimension-verdict.ts
 */
import {
  DIMENSION_AUDIT_LABELS,
  conflictsFromDimensionFails,
  dimensionPassClaimInvalid,
  parseDimensionAuditReport,
} from '../src/services/novel/novel-dimension-verdict.js'
import { mapOutlineBoundaryModelViolations } from '../src/services/novel/novel-outline-boundary-audit.js'
import { getContinuityCheckSystemPromptForTest } from '../src/services/novel/novel-continuity-check.js'
import { getOutlineBoundaryAuditSystemPromptForTest } from '../src/services/novel/novel-outline-boundary-audit.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

assert(DIMENSION_AUDIT_LABELS.length === 21, '21 labels')

const content = '秦卫国站在屋檐底下，拢了拢棉袄领子，抬头看天。他转身回屋取绳再出门往林子走。'.repeat(8)

const emptyPass = mapOutlineBoundaryModelViolations({ ok: true, violations: [] }, content)
assert(emptyPass.length >= 1, 'empty pass must become violation')
assert(/21.?维|维度/.test(emptyPass[0].message), `empty pass msg: ${emptyPass[0].message}`)

const dimsOk = DIMENSION_AUDIT_LABELS.map(dimension => ({
  dimension,
  status: 'ok' as const,
  reason: '与上章事实可闭合',
}))
const okMapped = mapOutlineBoundaryModelViolations({
  ok: true,
  reason: '21 维均逻辑自洽，开篇承接在途状态',
  dimensions: dimsOk,
  violations: [],
}, content)
assert(okMapped.length === 0, 'full ok dims must map to []')

const dimsFail = dimsOk.map(d =>
  d.dimension === '地点'
    ? {
        dimension: '地点',
        status: 'fail' as const,
        reason: '上章已在途，开篇却在屋檐下重演出发',
        excerpt: '秦卫国站在屋檐底下',
      }
    : d,
)
const failMapped = mapOutlineBoundaryModelViolations({
  ok: false,
  reason: '地点维不自洽',
  dimensions: dimsFail,
  violations: [],
}, content)
assert(failMapped.some(r => /地点/.test(r.message)), 'fail dim must map')

const report = parseDimensionAuditReport({
  reason: '不通过',
  dimensions: dimsFail,
}, content)
assert(report && report.failCount === 1 && report.complete, 'fail report')
assert(conflictsFromDimensionFails(report!).some(c => /屋檐/.test(c)), 'conflict has excerpt')
assert(dimensionPassClaimInvalid(true, report), 'pass claim invalid when fail')

const sys = getOutlineBoundaryAuditSystemPromptForTest()
assert(/21.?维|dimensions/.test(sys) && /reason/.test(sys), 'outline system requires 21+reason')
const cont = getContinuityCheckSystemPromptForTest(false)
assert(/21.?维|dimensions/.test(cont) && /reason/.test(cont), 'continuity system requires 21+reason')

console.log('PASS')
