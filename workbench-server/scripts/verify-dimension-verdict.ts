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

// 对象表形式（模型常交维名→status，旧逻辑只认数组会误判「未交21维」）
const asObject: Record<string, string> = {}
for (const d of DIMENSION_AUDIT_LABELS) asObject[d] = 'ok'
const objReport = parseDimensionAuditReport({
  passed: true,
  score: 90,
  reason: '全文自洽，21维均无fail',
  dimensions: asObject,
}, content)
assert(objReport?.complete === true && objReport.failCount === 0, 'object-map dimensions parse')
assert(!dimensionPassClaimInvalid(true, objReport), 'object-map pass claim ok')

const nestedObj: Record<string, { status: string; reason: string }> = {}
for (const d of DIMENSION_AUDIT_LABELS) {
  nestedObj[d] = { status: 'ok', reason: '承接' }
}
const nestedReport = parseDimensionAuditReport({
  passed: true,
  reason: '对象嵌套也算',
  dimensions: nestedObj,
}, content)
assert(nestedReport?.complete === true, 'nested object-map dimensions parse')

const missing = parseDimensionAuditReport({
  passed: true,
  reason: '只有总因',
}, content)
assert(dimensionPassClaimInvalid(true, missing), 'missing dimensions still invalid')

const sys = getOutlineBoundaryAuditSystemPromptForTest()
assert(/21.?维|dimensions/.test(sys) && /reason/.test(sys), 'outline system requires 21+reason')
assert(/先 dimensions|键顺序/.test(sys), 'outline contract must prioritize dimensions key order')
const cont = getContinuityCheckSystemPromptForTest(false)
assert(/21.?维|dimensions/.test(cont) && /reason/.test(cont), 'continuity system requires 21+reason')
assert(/先 dimensions|键顺序/.test(cont), 'continuity contract must prioritize dimensions key order')

console.log('PASS')
