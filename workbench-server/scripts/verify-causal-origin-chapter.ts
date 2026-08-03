/**
 * 因果起点应按章解析，禁止把全书最新快照注入前章
 * Run: npx tsx scripts/verify-causal-origin-chapter.ts
 */
import {
  parseCausalChainAsOfChapter,
  formatCausalOriginInjectBlock,
} from '../src/services/novel/novel-causal-chain/index.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
  console.log('ok', msg)
}

assert(parseCausalChainAsOfChapter('# 当前状态（第100章末）\n\n## 场景\n江城') === 100, 'parse 100')
assert(parseCausalChainAsOfChapter('# 当前状态（第1章末）') === 1, 'parse 1')
assert(parseCausalChainAsOfChapter('无标题') === null, 'parse null')

const late = {
  markdown: '',
  asOfChapter: 100,
  usable: false,
  note: '因果链文件当前为第100章末快照，与第2章所需的第1章末不符',
}
const block = formatCausalOriginInjectBlock(late)
assert(!/2005|省级|入狱/.test(block), 'no late-state body when unusable')
assert(/第100章末|第1章末|上章正文/.test(block), 'explains mismatch')

const ok = {
  markdown: '# 当前状态（第1章末）\n\n## 场景\n草垛',
  asOfChapter: 1,
  usable: true,
}
const blockOk = formatCausalOriginInjectBlock(ok)
assert(blockOk.includes('第1章末') && blockOk.includes('草垛'), 'inject matching snapshot')

console.log('PASS')
