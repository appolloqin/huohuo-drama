/**
 * 模型审须注入并对照：状态卡 6 维 + 账本 15 维
 * Run: npx tsx scripts/verify-compliance-dimension-audit.ts
 */
import {
  formatContinuityLedgerAuditBlock,
  CONTINUITY_LEDGER_DIM_LABELS,
} from '../src/common/novel/novel-continuity-state.js'
import {
  formatStateCardSixDimAuditBlock,
  STATE_CARD_SIX_DIM_LABELS,
  type ChapterStateCard,
} from '../src/common/novel/novel-state-card.js'
import {
  buildOutlineBoundaryAuditUserPartsForTest,
  getOutlineBoundaryAuditSystemPromptForTest,
} from '../src/services/novel/novel-outline-boundary-audit.js'
import { getContinuityCheckSystemPromptForTest } from '../src/services/novel/novel-continuity-check.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

assert(STATE_CARD_SIX_DIM_LABELS.length === 6, 'state card must list 6 dims')
assert(CONTINUITY_LEDGER_DIM_LABELS.length === 15, 'ledger must list 15 dims')

const card: ChapterStateCard = {
  chapter_number: 3,
  content_hash: 'x',
  updated_at: new Date().toISOString(),
  schema_version: 1,
  timeline: '同日下午',
  place: '林场边缘',
  scene: '雪地进林',
  cast: '秦卫国',
  progress: { catalyst_done: true, last_event: '往林子深处走' },
  props: '猎刀',
}
const cardBlock = formatStateCardSixDimAuditBlock(card, 'prev')
for (const lab of STATE_CARD_SIX_DIM_LABELS) {
  assert(cardBlock.includes(lab), `state card block missing ${lab}`)
}
console.log('state card 6-dim format ok')

const ledgerBlock = formatContinuityLedgerAuditBlock(
  { timeline: '下午', environment: '林场', actions: '进林' },
  '【上章一致性账本·15维】',
)
for (const lab of CONTINUITY_LEDGER_DIM_LABELS) {
  assert(ledgerBlock.includes(lab), `ledger block missing ${lab}`)
}
assert(ledgerBlock.includes('未记录'), 'empty dims should show 未记录')
console.log('ledger 15-dim format ok')

const sys = getOutlineBoundaryAuditSystemPromptForTest()
assert(/状态卡.*6|6.?维/.test(sys), 'system must require state-card 6 dims')
assert(/账本.*15|15.?维/.test(sys), 'system must require ledger 15 dims')
assert(/倒叙|先果后因/.test(sys), 'system must allow narrative orders')
assert(/逻辑自洽/.test(sys), 'system must use 逻辑自洽 as primary standard')
assert(/手法与自洽|不免除/.test(sys), 'system must gate techniques by 逻辑自洽')
assert(/无框|再演一遍/.test(sys), 'system must reject unframed rewind as non-补叙')
assert(/过程.*相位|相位倒退/.test(sys), 'system must cover process/phase rewind (not only clock words)')
assert(/钟点词/.test(sys), 'system must distinguish 钟点词序 from phase rewind')
assert(/dimensions|21/.test(sys) && /reason/.test(sys), 'system must require reason + 21 dimensions')
assert(!/只要与有记录维不矛盾/.test(sys), 'must not use narrow recorded-dim-only pass criteria')
const contSys = getContinuityCheckSystemPromptForTest(false)
assert(/逻辑自洽/.test(contSys), 'continuity system must use 逻辑自洽')
assert(/不免除|≠/.test(contSys), 'continuity must not exempt techniques from 自洽')
assert(/章缝逻辑不自洽|再演一遍/.test(contSys), 'continuity must flag unframed seam rewind')
assert(/过程.*相位|才开始/.test(contSys), 'continuity must flag process phase rewind')
assert(/dimensions|21/.test(contSys) && /reason/.test(contSys), 'continuity must require reason + dimensions')
const contCausal = getContinuityCheckSystemPromptForTest(true)
assert(/章缝逻辑不自洽|再演一遍/.test(contCausal), 'causal continuity must flag unframed seam rewind')
assert(/过程相位|才开始/.test(contCausal), 'causal continuity must flag process phase rewind')
assert(/dimensions|21/.test(contCausal), 'causal continuity must require dimensions')
console.log('system prompt policy ok')

const parts = buildOutlineBoundaryAuditUserPartsForTest({
  content: '他在雪地放慢脚步，发现野兔踪迹，设下陷阱。'.repeat(20),
  chapterOutline: '【人物选择】设下陷阱',
  chapterNumber: 4,
  prevStateCardBlock: cardBlock,
  prevLedgerBlock: ledgerBlock,
})
const user = parts.join('\n\n')
assert(user.includes('状态卡'), 'user must inject state card')
assert(user.includes('一致性账本') || user.includes('15维'), 'user must inject ledger')
assert(user.includes('时间线') && user.includes('修为境界'), 'user must contain dim labels')
console.log('user injection ok')

console.log('PASS')
