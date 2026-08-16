/**
 * 正文级大纲删毒验收
 * Run: npx tsx scripts/verify-outline-poison-strip.ts
 */
import { stripOutlinePoisonProse } from '../src/services/novel/novel-outline-poison-strip.js'
import { extractOutlineBoundaryLastBeat } from '../src/services/novel/novel-chapter-seam.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'

function pad(s: string, n: number): string {
  let out = s
  while ([...out].length < n) out += s
  return out
}

const outline = [
  '第4章：初入林海',
  '【本章时间】同日下午',
  '【本章地点】北疆林场·白山林区',
  '【本章人物】秦卫国',
  '【本章起因】秦卫国踏入白雪皑皑的林场深处',
  '【欲望】捕获猎物，解决温饱',
  '【阻碍】极寒环境、体能尚未完全恢复',
  '【局面变化】凭借前世特种兵的追踪技巧发现野兔踪迹',
  '【人物选择】冷静判断，设下陷阱',
  '【冲突层】外部',
  '【情绪手法】冷峻的生存气息',
  '【章末问题】陷阱能否奏效？',
].join('\n')

const inOutline = pad(
  '秦卫国踏入白雪皑皑的林场深处。寒风割脸，体能尚未完全恢复。他凭前世特种兵的追踪技巧，在雪地上发现野兔踪迹。冷静判断片刻，动手设下陷阱。',
  280,
)
const poison = pad(
  '片刻后野兔落入套中，他拎起猎物下山回家。揭开锅盖炖上肉汤，香气四溢，盘算着这个冬天怎么过。',
  400,
)

const r1 = stripOutlinePoisonProse({
  content: inOutline + poison,
  chapterOutline: outline,
})
console.log('strip1', {
  removed: r1.removedChars,
  keep: r1.keepCount,
  discard: r1.discardCount,
  len: [...r1.text].length,
  head: r1.text.slice(0, 80),
  tail: r1.text.slice(-80),
})
if (!r1.changed) throw new Error('expected poison removed')
if (r1.discardCount < 1) throw new Error('expected discardCount >= 1')
if (/肉汤|揭开锅|下山回家|香气四溢/.test(r1.text)) {
  throw new Error('poison (home/soup/catch success) must be deleted')
}
if (!/林场|野兔踪迹|陷阱/.test(r1.text)) {
  throw new Error('outline-related sentences must be kept')
}
console.log('drama-tag overshoot strip ok')

// 欲望完成态不得因「捕获猎物」被保留
const desirePoison = pad(
  '他终于捕获猎物，解决了温饱。家里炖起肉汤，邻居闻香而来。',
  300,
)
const r2 = stripOutlinePoisonProse({
  content: inOutline + desirePoison,
  chapterOutline: outline,
})
if (/肉汤|邻居闻香|解决了温饱/.test(r2.text)) {
  throw new Error('desire-completion must not be kept via 欲望 beat')
}
console.log('desire-poison strip ok')

// 末拍之后即使含大纲词也丢（下章抢戏）
const afterTrap = pad(
  '陷阱已经设好。天亮后他果然抓到野兔，在回程小路遇上赵大彪，冷漠无视径直回家。',
  280,
)
const r3 = stripOutlinePoisonProse({
  content: inOutline + afterTrap,
  chapterOutline: outline,
})
if (/赵大彪|抓到野兔|径直回家/.test(r3.text)) {
  throw new Error('post-actionBeat next-chapter beats must be deleted')
}
console.log('post-endpoint strip ok')

// 无毒稿不改
const r4 = stripOutlinePoisonProse({
  content: inOutline,
  chapterOutline: outline,
})
if (r4.changed && r4.discardCount > 0) {
  // 允许轻微规范化，但不得删掉核心
  if (!/设下陷阱|野兔踪迹/.test(r4.text)) {
    throw new Error('clean draft must keep endpoint beats')
  }
}
console.log('clean draft ok')

// 人名误挂起因：推进到追踪/设陷阱后，不得因「秦卫国…」保留归家炖汤
const namePoison =
  inOutline
  + pad('秦卫国拎着兔子耳朵掂了掂，约莫两斤多沉。秦卫国推门进去生火炖肉汤，香气四溢。', 200)
const rName = stripOutlinePoisonProse({
  content: namePoison,
  chapterOutline: outline,
})
if (/拎着兔子|炖肉汤|香气四溢|推门进去生火/.test(rName.text)) {
  throw new Error('name-false-positive on 起因 must not keep home/soup poison')
}
if (!/设下陷阱|野兔踪迹/.test(rName.text)) {
  throw new Error('name-poison case must still keep outline beats')
}
console.log('name-false-positive strip ok')

// 无标签斜杠大纲
const slashOutline = '踏入林场深处 / 发现野兔踪迹 / 冷静设下陷阱'
const slashBody =
  pad('他踏入林场深处，在雪地发现野兔踪迹，冷静设下陷阱。', 200)
  + pad('随后成功猎杀野猪，当众打脸邻居，搬进砖瓦房。', 260)
const r5 = stripOutlinePoisonProse({
  content: slashBody,
  chapterOutline: slashOutline,
})
if (/野猪|打脸|砖瓦房/.test(r5.text)) {
  throw new Error('slash-outline poison must be deleted')
}
if (!/林场|野兔|陷阱/.test(r5.text)) {
  throw new Error('slash-outline keep failed')
}
console.log('slash-outline strip ok')

// 抽象【人物选择】不得当硬止点把长稿砍成碎片（ch12/13 日志回归）
const stanceOutline = [
  '第13章：黑市初探',
  '【本章时间】次日',
  '【本章地点】县城黑市',
  '【本章人物】秦卫国、黑市中间人老鬼',
  '【本章起因】秦卫国带狍子皮进城寻找黑市入口',
  '【欲望】打通销售渠道，换取生活物资',
  '【阻碍】黑市风险高，不知门路',
  '【局面变化】试探后联系上中间人老鬼',
  '【人物选择】谨慎接触，多看少说',
  '【冲突层】外部',
  '【章末问题】第一笔交易能谈成吗？',
].join('\n')

const stanceBody =
  pad(
    '天擦黑刘建国离开。秦卫国把门闩插死，跟苏婉说明天一早去县城。天亮他卷好狍子皮出门，钻进林子，绕开稽查，摸进县城黑市。他在摊位间多看少说，先问规矩。',
    2000,
  )
  + '他终于试探后联系上中间人老鬼，约定改日再谈。'
  + pad('随后他把全部家当卖光，当场娶了县长女儿。', 400)

const rStance = stripOutlinePoisonProse({
  content: stanceBody,
  chapterOutline: stanceOutline,
})
if ([...rStance.text].length < 800) {
  throw new Error(`abstract 人物选择 must not gut long draft: len=${[...rStance.text].length} action=${rStance.actionBeat}`)
}
if (/县长女儿|卖光/.test(rStance.text)) {
  throw new Error('overshoot after 局面变化 must be stripped even when 人物选择 is abstract')
}
if (/谨慎接触/.test(rStance.actionBeat) && !/联系上|老鬼|试探/.test(rStance.actionBeat)) {
  throw new Error(`actionBeat should not be abstract stance: ${rStance.actionBeat}`)
}
console.log('abstract-stance strip ok', {
  len: [...rStance.text].length,
  action: rStance.actionBeat,
  changed: rStance.changed,
})

// 末拍约在 65%：须砍掉约 1k 越界尾，且不得 strip-all 清空
const pad65 = (s: string, n: number) => {
  let out = s
  while ([...out].length < n) out += s
  return [...out].slice(0, n).join('')
}
const body65 =
  '天亮秦卫国卷好狍子皮出门进城。黑市风险高，他多看少说，先在摊位间转。'
  + pad65('他在巷子里打听门路，小心试探，不敢露富。', 1800)
  + '终于试探后联系上中间人老鬼。老鬼让他改日带货再谈。'
  + pad65('他当场把第一笔交易做成，又娶了县长女儿，全家迁进城里开铺。', 1024)
const r65 = stripOutlinePoisonProse({ content: body65, chapterOutline: stanceOutline })
if (!r65.text.trim()) throw new Error('65%-endpoint strip must not blank chapter')
if (/县长女儿|开铺/.test(r65.text)) throw new Error('65%-endpoint overshoot tail must be removed')
if ([...r65.text].length < 1000) throw new Error(`65%-endpoint kept too short: ${[...r65.text].length}`)
if (!r65.changed) throw new Error('65%-endpoint strip should change')
console.log('65pct-endpoint strip ok', { len: [...r65.text].length, removed: r65.removedChars })

// 无保留拍对齐：不得清空
const rNone = stripOutlinePoisonProse({
  content: pad65('他在屋里睡觉做梦，完全没有进城。', 1200),
  chapterOutline: stanceOutline,
})
if (!rNone.text.trim() || rNone.text.length < 100) {
  throw new Error('unaligned draft must keep original, not blank')
}
if (rNone.changed) throw new Error('unaligned draft should not strip-all')
console.log('unaligned-keep-original ok')

// 恨爽急盼：局面变化后的急/盼不得当毒尾砍掉
const emotionOutline = [
  '第1章：雪夜逼债',
  '【本章起因】二叔踹门逼债',
  '【阻碍】字据抵房',
  '【局面变化】从任人拿捏到当众立下还款死约，秦守财被迫接受延期，但放话到期必来收房',
  '【人物选择】当场写下新字据赌自己的手',
  '【章末问题】一个月后五十块从哪来？',
  '【恨】秦守财踹门拍字据逼腾房',
  '【爽】秦建国立约硬刚并亮修机本事',
  '【急】一个月内先还五十否则收房',
  '【盼】柴油机修好抵债；缺弹簧垫圈须自制',
  '【爽型】硬撕',
].join('\n')
const emotionBody = [
  '门被踹开。秦守财拍着字据骂着要腾房。',
  '秦建国按住字据：「账我认，一个月先还五十。」又踩上院里柴油机：「这机器我修，修好抵工分。」秦守财嘴角一抽，账本差点滑落。',
  '「腊月二十结账，少一分扣口粮。」他甩下盖章欠款单。',
  '秦建国敲了敲缸体，眉头微皱：「……缺个弹簧垫圈，得自己做。」墙角锈铁堆着，他掂了掂。',
].join('')
const rEmo = stripOutlinePoisonProse({ content: emotionBody, chapterOutline: emotionOutline })
if (!/缺个弹簧|自己做/.test(rEmo.text)) {
  throw new Error('emotion 盼/急 tail must not be stripped as poison')
}
if ([...rEmo.text].length < [...emotionBody].length * 0.85) {
  throw new Error(`emotion strip removed too much: ${[...rEmo.text].length}/${[...emotionBody].length}`)
}
const emoBound = extractOutlineBoundaryLastBeat(emotionOutline)
if (!/弹簧垫圈|自制|柴油机/.test(emoBound.actionBeat)) {
  throw new Error(`emotion boundary must be 盼, got: ${emoBound.actionBeat}`)
}
const emoCheck = detectOutlineCompliance({
  content: emotionBody,
  chapterOutline: emotionOutline,
  chapterNumber: 1,
})
if (emoCheck.reasons.some(r => r.code === 'outline_endpoint_overshoot')) {
  throw new Error('emotion chapter must not false-positive outline_endpoint_overshoot')
}
console.log('emotion-beat strip keep 急盼 ok', { action: emoBound.actionBeat.slice(0, 40), len: [...rEmo.text].length })

console.log('PASS')
