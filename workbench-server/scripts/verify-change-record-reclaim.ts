/**
 * 伪【变更记录】散文须回收为正文；结构化块才剥离
 * Run: npx tsx scripts/verify-change-record-reclaim.ts
 */
import {
  normalizeChangeRecordArtifacts,
  stripNovelChangeRecord,
  isStructuredChangeRecordBlock,
} from '../src/common/novel/novel-change-record.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const tip = '林子里黑得快，秦卫国眯起眼数着树干上的苔痕分辨方向。'
const fakeProse = '风小了些，可冷得更扎骨头。秦卫国蹲在松林边沿一棵老松背后，两只手拢在袖筒里。'
const fake2 = '他往手心里哈了口气，搓了搓，然后才抬脚往脚印方向摸过去。'
const dumped = [
  tip,
  '',
  '【变更记录】',
  '',
  fakeProse,
  '',
  '【变更记录】',
  '',
  fake2,
].join('\n')

assert(!isStructuredChangeRecordBlock(`【变更记录】\n\n${fakeProse}`), 'prose dump not structured')

const n = normalizeChangeRecordArtifacts(dumped)
assert(n.reclaimedFakeBlocks === 2, `expected 2 fake blocks, got ${n.reclaimedFakeBlocks}`)
assert(!n.changeBlock, 'fake dump must not become metadata')
assert(n.prose.includes(tip) && n.prose.includes(fakeProse) && n.prose.includes(fake2), 'all prose reclaimed')
assert(!n.prose.includes('【变更记录】'), 'headers removed from prose')

const stripped = stripNovelChangeRecord(dumped)
assert(!stripped.includes('【变更记录】'), 'strip must hide headers')
assert(stripped.includes(fakeProse), 'strip must keep reclaimed story')
console.log('fake change-record reclaim ok')

const structured = [
  tip.repeat(3),
  '',
  '【变更记录】',
  '- 场景: 林缘 → 松林道口',
  '  因果: 循野兔脚印摸到背风灌木丛并布下铁丝套',
].join('\n')
assert(isStructuredChangeRecordBlock(structured.slice(structured.indexOf('【变更记录】'))), 'structured ok')
const n2 = normalizeChangeRecordArtifacts(structured)
assert(!!n2.changeBlock, 'structured kept as metadata')
assert(n2.prose.includes(tip) && !n2.prose.includes('因果:'), 'prose excludes structured block')
assert(!stripNovelChangeRecord(structured).includes('【变更记录】'), 'editor strips structured')
console.log('structured change-record ok')

console.log('PASS')
