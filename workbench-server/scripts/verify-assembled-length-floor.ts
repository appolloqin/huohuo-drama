/**
 * M4 字数地板
 * Run: npx tsx scripts/verify-assembled-length-floor.ts
 */
import { enforceAssembledLengthFloor, countNovelChars } from '../src/common/novel/novel-char-limit.js'

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    failed++
  } else {
    console.log('ok', msg)
  }
}

const long = '甲'.repeat(2500)
const short = '乙'.repeat(300)
const r1 = enforceAssembledLengthFloor({ assembled: long, candidate: short, minLen: 2800 })
assert(r1.rejected, 'waist-cut rejected')
assert(countNovelChars(r1.text) === 2500, 'fallback to assembled')

const ok = '丙'.repeat(2400)
const r2 = enforceAssembledLengthFloor({ assembled: long, candidate: ok, minLen: 2800 })
assert(!r2.rejected, 'near-length kept')

const tiny = '丁'.repeat(500)
const r3 = enforceAssembledLengthFloor({ assembled: tiny, candidate: '戊'.repeat(100), minLen: 800 })
assert(!r3.rejected, 'short assemble does not trigger')

if (failed) {
  console.error(`\nFAILED: ${failed}`)
  process.exit(1)
}
console.log('\nPASS')
