/**
 * 同字辈互称叔伯硬审
 * Run: npx tsx scripts/verify-peer-kinship-audit.ts
 */
import { detectPeerKinshipAddressConflicts } from '../src/common/novel/novel-peer-kinship-audit.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
  console.log('ok', msg)
}

const bad = `
秦德东最后一个进来，大马金刀往右首一坐，端起茶碗先啜口，才慢悠悠开口：“大侄子，大清早把族老们都叫来，是发饷啊，还是开仓放粮？”秦默没接话，冲秦德民点了点头。

秦德民站起来，抖开手里的纸，清了清嗓子：“二叔，是这样的。昨日我领着人把库房和武备仓都清点了一遍。”
`

const badHits = detectPeerKinshipAddressConflicts(bad)
assert(badHits.length >= 1, '秦德民称秦德东二叔应硬拦')
assert(badHits.some((h) => h.rule === 'peer_kinship_address'), 'rule=peer_kinship_address')
assert(badHits.some((h) => h.message.includes('秦德民')), 'message 含说话人')

const ok = `
秦德东最后一个进来，往右首一坐，开口：“大侄子，大清早把族老们都叫来？”秦默站起来，清了清嗓子：“二叔，是这样的。库房缺银四十两。”
`
const okHits = detectPeerKinshipAddressConflicts(ok)
assert(okHits.length === 0, '秦默称二叔合法，不应拦')

console.log('all peer kinship audit checks passed')
