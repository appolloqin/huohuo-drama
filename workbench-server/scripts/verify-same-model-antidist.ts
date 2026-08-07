/**
 * 同模型反分布（C2 收束后）：句式正则 + 基础虚词
 * Run: npx tsx scripts/verify-same-model-antidist.ts
 */
import {
  diversifyAiTransitionTells,
  diversifySymmetricMeiYou,
  diversifyBuShuYuSkeleton,
  diversifyZheBuShiSkeleton,
  diversifyJiAJiB,
} from '../src/common/novel/novel-ai-tells.js'

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    failed++
  } else {
    console.log('ok', msg)
  }
}

const lexical = diversifyAiTransitionTells('四肢百骸透着酸软无力，那是长期饥饿留下的病根，身体完好无损。')
assert(!/四肢百骸/.test(lexical), '四肢百骸 replaced')
assert(!/酸软无力/.test(lexical), '酸软无力 replaced')
assert(!/病根/.test(lexical), '病根 replaced')

const sym = diversifySymmetricMeiYou('没有弹孔伤疤，没有被岁月战火掏空的内里。别处还有一句。')
assert(!/没有弹孔伤疤，没有被岁月/.test(sym), 'symmetric 没有拆开')
assert(/也摸不着|也没有/.test(sym), 'symmetric rewrite present')

const sk = diversifyBuShuYuSkeleton(
  '这双手不属于那个在边境线身经百战、最后为掩护队友引爆手雷的特种兵王。',
)
assert(!/这双手不属于那个在边境线身经百战/.test(sk), '不属于骨架拆开')
assert(/哪像那个/.test(sk), '不属于 rewrite present')

const zbs = diversifyZheBuShiSkeleton('这不是梦里的虚无缥缈，是1966年北疆林场最破的一间茅屋。')
assert(!/这不是梦里的虚无缥缈，是/.test(zbs), '这不是…是… 拆开')

const ji = diversifyJiAJiB('连呼吸都刻意压得极轻极浅。')
assert(!/极轻极浅/.test(ji), '极A极B 拆开')

const combined = diversifyAiTransitionTells(
  '他猛地睁眼。没有弹孔伤疤，没有被岁月掏空。这双手不属于那个身经百战的老兵甲乙丙丁戊己庚辛。四肢百骸发虚。',
)
assert(!/四肢百骸/.test(combined), 'pipeline lexical')
assert(!/没有弹孔伤疤，没有被岁月/.test(combined), 'pipeline symmetric')

if (failed) {
  console.error(`\nFAILED: ${failed}`)
  process.exit(1)
}
console.log('\nPASS')
