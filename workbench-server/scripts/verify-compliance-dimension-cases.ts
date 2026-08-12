/**
 * 21 维完整本地验收：每维正例注入 + 反例 mock 映射
 * Run: npx tsx scripts/verify-compliance-dimension-cases.ts
 *
 * 可选：RUN_LIVE_DIMENSION_AUDIT=1 时对反例各调一次真实模型（费时/耗额度，默认关）
 */
import {
  formatContinuityLedgerAuditBlock,
  CONTINUITY_LEDGER_DIM_LABELS,
} from '../src/common/novel/novel-continuity-state.js'
import {
  formatStateCardSixDimAuditBlock,
  STATE_CARD_SIX_DIM_LABELS,
} from '../src/common/novel/novel-state-card.js'
import {
  assertDimensionFixtureCoverage,
  DIMENSION_AUDIT_FIXTURES,
  DIMENSION_AUDIT_OUTLINE,
  listAllDimensionLabels,
  type DimensionAuditFixture,
} from '../src/services/novel/novel-dimension-audit-fixtures.js'
import { DIMENSION_AUDIT_LABELS } from '../src/services/novel/novel-dimension-verdict.js'

function allDimsOk() {
  return DIMENSION_AUDIT_LABELS.map(dimension => ({
    dimension,
    status: 'ok' as const,
    reason: '逻辑自洽',
  }))
}
import {
  auditOutlineBoundaryWithModel,
  buildOutlineBoundaryAuditUserPartsForTest,
  getOutlineBoundaryAuditSystemPromptForTest,
  mapOutlineBoundaryModelViolations,
} from '../src/services/novel/novel-outline-boundary-audit.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function buildInjection(fx: DimensionAuditFixture): string {
  const cardBlock = formatStateCardSixDimAuditBlock(fx.prevCard, 'prev')
  const ledgerBlock = formatContinuityLedgerAuditBlock(
    fx.prevLedger,
    '【上章一致性账本·15维】',
  )
  return buildOutlineBoundaryAuditUserPartsForTest({
    content: fx.okContent,
    chapterOutline: DIMENSION_AUDIT_OUTLINE,
    chapterNumber: 4,
    prevStateCardBlock: cardBlock,
    prevLedgerBlock: ledgerBlock,
  }).join('\n\n')
}

assertDimensionFixtureCoverage()
assert(STATE_CARD_SIX_DIM_LABELS.length === 6, 'state card dims')
assert(CONTINUITY_LEDGER_DIM_LABELS.length === 15, 'ledger dims')
assert(listAllDimensionLabels().length === 21, '21 labels')
console.log('fixture coverage: 21 dims ok')

const sys = getOutlineBoundaryAuditSystemPromptForTest()
assert(/逻辑自洽/.test(sys), 'system must require 逻辑自洽')
assert(/倒叙|先果后因/.test(sys), 'system must allow narrative orders')
assert(/手法与自洽|不免除/.test(sys), 'techniques must be gated by 逻辑自洽')
assert(/无框|再演一遍/.test(sys), 'unframed rewind must fail 自洽')
assert(/过程.*相位|相位倒退/.test(sys), 'process phase rewind must be in scope')
assert(/钟点词/.test(sys), 'must distinguish clock-word order from phase rewind')
assert(/dimensions|21/.test(sys) && /reason/.test(sys), 'must require reason + dimensions')
for (const lab of listAllDimensionLabels()) {
  assert(sys.includes(lab), `system prompt missing dimension label: ${lab}`)
}
console.log('system prompt lists all 21 dim labels')

let okCases = 0
let badCases = 0

for (const fx of DIMENSION_AUDIT_FIXTURES) {
  assert([...fx.okContent].length >= 200, `${fx.id}: okContent too short`)
  assert([...fx.badContent].length >= 200, `${fx.id}: badContent too short`)

  const user = buildInjection(fx)
  assert(user.includes(fx.dimension), `${fx.id}: injection missing dim ${fx.dimension}`)
  assert(user.includes(fx.okAnchor), `${fx.id}: injection missing anchor「${fx.okAnchor}」`)
  assert(user.includes('逻辑自洽') || sys.includes('逻辑自洽'), `${fx.id}: 逻辑自洽 missing`)

  // 正例：须交齐 21 维 + reason 才算通过
  const okMapped = mapOutlineBoundaryModelViolations({
    ok: true,
    reason: `【${fx.dimension}】与邻章事实逻辑自洽`,
    dimensions: allDimsOk(),
    violations: [],
  }, fx.okContent)
  assert(okMapped.length === 0, `${fx.id}: ok mock must map to []`)

  // 反例：维度 fail → 落入章缝/维度硬因
  const badDims = allDimsOk().map(d =>
    d.dimension === fx.dimension
      ? {
          dimension: fx.dimension,
          status: 'fail' as const,
          reason: fx.breakHint,
          excerpt: fx.badExcerpt,
        }
      : d,
  )
  const badMapped = mapOutlineBoundaryModelViolations({
    ok: false,
    reason: fx.breakHint,
    dimensions: badDims,
    violations: [],
  }, fx.badContent)
  assert(badMapped.length >= 1, `${fx.id}: bad mock must yield reasons`)
  assert(
    badMapped.some(r => r.code === 'chapter_seam_cold_open' && r.message.includes(fx.dimension)),
    `${fx.id}: mapped message must include dim`,
  )

  okCases += 1
  badCases += 1
  console.log(`  ✓ ${fx.group}/${fx.dimension} (${fx.id}) ok+bad`)
}

console.log(`local mock cases: ${okCases} ok + ${badCases} bad = ${okCases + badCases}`)

// 空维「未记录」仍须出现在账本块（不凭空捏造该维硬伤的前提）
const sparseLedger = formatContinuityLedgerAuditBlock(
  { actions: '进林' },
  '【稀疏账本】',
)
assert(sparseLedger.includes('未记录'), 'sparse ledger must show 未记录')
assert(sparseLedger.includes('动作逻辑：进林'), 'sparse ledger keeps recorded dim')
console.log('sparse ledger 未记录 policy ok')

const live = process.env.RUN_LIVE_DIMENSION_AUDIT === '1'
if (live) {
  console.log('RUN_LIVE_DIMENSION_AUDIT=1 — auditing bad fixtures with real model…')
  let liveHit = 0
  let liveMiss = 0
  for (const fx of DIMENSION_AUDIT_FIXTURES) {
    const cardBlock = formatStateCardSixDimAuditBlock(fx.prevCard, 'prev')
    const ledgerBlock = formatContinuityLedgerAuditBlock(
      fx.prevLedger,
      '【上章一致性账本·15维】',
    )
    const reasons = await auditOutlineBoundaryWithModel({
      content: fx.badContent,
      chapterOutline: DIMENSION_AUDIT_OUTLINE,
      chapterNumber: 4,
      prevStateCardBlock: cardBlock,
      prevLedgerBlock: ledgerBlock,
    })
    const hit = reasons.some(r =>
      r.message.includes(fx.dimension)
      || /维度|逻辑|自洽|矛盾|吃书/.test(r.message),
    )
    if (hit) {
      liveHit += 1
      console.log(`  live HIT  ${fx.dimension}`)
    } else {
      liveMiss += 1
      console.warn(`  live MISS ${fx.dimension} reasons=${JSON.stringify(reasons)}`)
    }
  }
  console.log(`live summary: hit=${liveHit} miss=${liveMiss}`)
  assert(liveHit >= 16, `live audit expected ≥16/21 hits, got ${liveHit}`)
} else {
  console.log('skip live model (set RUN_LIVE_DIMENSION_AUDIT=1 to enable)')
}

console.log('PASS')
