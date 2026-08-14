/**
 * 回归：先选稿，再对最终稿只删毒一次（不得用未删毒稿盖回）
 * Run: npx tsx scripts/verify-outline-deliver-restrip.ts
 */
import { stripOutlinePoisonProse } from '../src/services/novel/novel-outline-poison-strip.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'

const outline = [
  '第13章：黑市初探',
  '【本章起因】秦卫国带狍子皮进城寻找黑市入口',
  '【阻碍】黑市风险高，不知门路',
  '【局面变化】试探后联系上中间人老鬼',
  '【人物选择】谨慎接触，多看少说',
  '【章末问题】第一笔交易能谈成吗？',
].join('\n')

function pad(s: string, n: number): string {
  let out = s
  while ([...out].length < n) out += s
  return [...out].slice(0, n).join('')
}

const best =
  pad('天亮秦卫国卷好狍子皮出门进城。黑市风险高，他多看少说，先在摊位间转。他在巷子里打听门路。', 1600)
  + '终于试探后联系上中间人老鬼。老鬼让他改日带货再谈。'
  + pad('他当场把第一笔交易做成，又娶了县长女儿，全家迁进城里开铺。', 1024)

// 正确模型：选中 best 后只 strip 一次
const chosen = best
const once = stripOutlinePoisonProse({ content: chosen, chapterOutline: outline })
if (!once.changed || /县长女儿|开铺/.test(once.text)) {
  throw new Error('final single strip must cut outline-inconsistent tail')
}

const before = await detectOutlineCompliance({ content: chosen, chapterOutline: outline })
const after = await detectOutlineCompliance({ content: once.text, chapterOutline: outline })
if (!before.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('chosen overshoot fixture missing')
}
if (after.reasons.some(r => r.code === 'outline_endpoint_overshoot' && /过早完成/.test(r.message))) {
  throw new Error(`after one strip must clear endpoint-overshoot: ${after.reasons.map(r => r.message).join('|')}`)
}

// 错误模型对照：先 strip 再被 unstripped best 盖回
const undone = best
if (![...undone].length || !/县长女儿/.test(undone)) {
  throw new Error('control')
}

console.log('verify-outline-deliver-once-strip OK', {
  chosen: [...chosen].length,
  once: [...once.text].length,
  afterCodes: after.reasons.map(r => r.code),
})
