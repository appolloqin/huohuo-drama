/**
 * 拍点倒序：悬念钩子拍剔除（问句 / 会不会…），不靠标签白名单
 * npx tsx scripts/verify-seam-order-exclude-ending-q.ts
 */
import {
  detectOutlineBeatOrderRewind,
  findStaleOutlineBeats,
  isSuspenseHookBeat,
  phraseAppearsIn,
  phraseStronglyAppearsIn,
} from '../src/services/novel/novel-chapter-seam.js'

const endQ = '赵大彪会不会去找刘干事换招再来？'
if (!isSuspenseHookBeat(endQ)) throw new Error('章末问句应识别为悬念钩子')
if (!isSuspenseHookBeat('他还会不会再来')) throw new Error('无问号的会不会句也应识别')

const prevSoft = ('夜里安静了。秦卫国心想，赵大彪会不会善罢甘休，明天再看。').repeat(5)
if (!phraseAppearsIn(prevSoft, endQ)) {
  throw new Error('宽松窗对照：短重叠仍可能命中')
}
if (phraseStronglyAppearsIn(prevSoft, endQ)) {
  throw new Error('强窗对照：不得因短重叠命中')
}

const outline = `第8章：清晨风波
【本章起因】赵大彪堵在门口当众散布偷猎谣言；秦卫国已备妥合法狩猎许可应对
【欲望】洗清偷猎嫌疑
【阻碍】谣言传播、有心人推波助澜
【局面变化】秦卫国展示合法狩猎许可，反问赵大彪的贡献
【人物选择】当着邻居揭穿，让谣言不攻自破
【章末问题】赵大彪会不会去找刘干事换招再来？
【信息增量】狩猎许可的政策空隙、秦卫国的先知优势`

const opening = ('次日清晨，赵大彪堵在门口当众散布偷猎谣言。秦卫国已备妥合法狩猎许可应对。').repeat(4)

const stale = findStaleOutlineBeats(outline, prevSoft)
if (stale.some(s => /刘干事|换招再来|会不会去找/.test(s))) {
  throw new Error(`悬念钩子不得进 stale: ${stale.join(' | ')}`)
}

const hit = detectOutlineBeatOrderRewind({
  content: opening,
  chapterNumber: 8,
  prevChapterTail: prevSoft,
  chapterOutline: outline,
})
if (hit) {
  throw new Error(`不应因悬念措辞重叠倒序误杀: ${hit.message}`)
}

const slash = '门口散谣亮证 / 当众揭穿 / 赵大彪会不会再来找茬？'
const slashHit = detectOutlineBeatOrderRewind({
  content: opening,
  chapterNumber: 8,
  prevChapterTail: prevSoft,
  chapterOutline: slash,
})
if (slashHit) {
  throw new Error(`无标签悬念拍不应误杀: ${slashHit.message}`)
}

const prevDone = (
  '秦卫国当众展开狩猎许可，反问赵大彪为林场做过什么贡献，邻居哄笑声里赵大彪灰溜溜走了。'
).repeat(4)
const trueHit = detectOutlineBeatOrderRewind({
  content: opening,
  chapterNumber: 8,
  prevChapterTail: prevDone,
  chapterOutline: outline,
})
if (!trueHit) {
  throw new Error('上章已完成局面变化、开篇仍写起因时，应判拍点倒序')
}

console.log('verify-seam-order-exclude-ending-q OK')
