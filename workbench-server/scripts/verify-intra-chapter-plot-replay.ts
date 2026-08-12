/**
 * 章内情节单元再演：模型审契约 + 生成禁回放 brief + mock 映射
 * Run: npx tsx scripts/verify-intra-chapter-plot-replay.ts
 */
import { DIMENSION_AUDIT_LABELS } from '../src/services/novel/novel-dimension-verdict.js'
import {
  getOutlineBoundaryAuditSystemPromptForTest,
  mapOutlineBoundaryModelViolations,
} from '../src/services/novel/novel-outline-boundary-audit.js'
import { getContinuityCheckSystemPromptForTest } from '../src/services/novel/novel-continuity-check.js'
import { buildFrozenProgressNoReplayBlockForTest } from '../src/services/novel/novel-chapter-beat-generate.js'
import { DIMENSION_AUDIT_OUTPUT_CONTRACT } from '../src/services/novel/novel-dimension-verdict.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const sysOutline = getOutlineBoundaryAuditSystemPromptForTest()
assert(/章内进度回卷/.test(sysOutline), 'outline system must cover intra-chapter rewind')
assert(!/寻踪→设伏|交涉→摊牌/.test(sysOutline), 'outline must not enumerate genre chains')
const sysCont = getContinuityCheckSystemPromptForTest(false)
assert(/章内进度回卷/.test(sysCont), 'continuity system must cover intra-chapter rewind')
assert(!/寻踪→设伏|交涉→摊牌/.test(sysCont), 'continuity must not enumerate genre chains')
const sysCausal = getContinuityCheckSystemPromptForTest(true)
assert(/章内进度回卷/.test(sysCausal), 'causal system must cover intra-chapter rewind')
assert(/章内进度回卷/.test(DIMENSION_AUDIT_OUTPUT_CONTRACT), 'dimension contract must mention intra-chapter rewind')
assert(!/寻踪→设伏/.test(DIMENSION_AUDIT_OUTPUT_CONTRACT), 'contract must not enumerate genre chains')
console.log('PASS prompt contract')

const prior = '他把关键步骤做到完成态，停在结果上，准备进入下一步冲突。'.repeat(4)
const block = buildFrozenProgressNoReplayBlockForTest(prior)
assert(/勿回卷|完成态/.test(block), 'beat brief must warn against progress rewind')
assert(!/寻踪|设伏|蹲守/.test(block), 'beat brief must not list genre beats')
assert(block.includes('完成态') || block.includes('停在结果'), 'beat brief should anchor prior')
console.log('PASS beat no-replay brief')

const halfA = '他把关键步骤做到完成态，停在结果上，准备进入下一步冲突。'
const halfB = '他再次以当前进行时把同一完成态过程从头完整做了一遍，仿佛前段从未发生。'
const content = (halfA + halfB).repeat(6)

const dims = DIMENSION_AUDIT_LABELS.map(dimension =>
  dimension === '动作逻辑'
    ? {
        dimension: '动作逻辑',
        status: 'fail' as const,
        reason: '章内进度回卷：前段已到完成态，后段无框完整再演',
        excerpt: '再次以当前进行时把同一完成态过程从头完整做了一遍',
      }
    : {
        dimension,
        status: 'ok' as const,
        reason: '逻辑自洽',
      },
)

const mapped = mapOutlineBoundaryModelViolations({
  ok: false,
  reason: '章内进度回卷：完成态过程换皮再演',
  dimensions: dims,
  violations: [],
}, content)
assert(mapped.some(r => /动作逻辑|进度回卷|再演/.test(r.message)), `mapped fail: ${JSON.stringify(mapped)}`)
console.log('PASS mock dimension fail maps')

const emptyPass = mapOutlineBoundaryModelViolations({ ok: true, violations: [] }, content)
assert(emptyPass.length >= 1, 'empty pass still rejected')
console.log('PASS')
