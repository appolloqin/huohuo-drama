/**
 * 用终端失败稿片段验证：曝光点应过；拓跋烈仍缺
 */
import {
  infoDeltaPointCovered,
  isInfoDeltaResultStatePoint,
} from '../src/services/novel/novel-outline-beat-cover.js'

const content = `
秦默从怀里摸出一封泛黄的信，信封口封蜡已经裂了，他抽出信纸，当众展开，
「昨夜你密会黑风寨残部，送出去的信，我让人截了回来。」
把信纸往地上一掷。秦德东手里那把刀当啷一声掉在地上。身后那几十个旧部一个接一个把刀扔了。
赵铁柱挡在秦默身前。秦德东挤出几个字：「名单在我枕头底下。」
`

const p = '秦德东通匪证据曝光，旧部彻底归心'
console.log({
  isResult: isInfoDeltaResultStatePoint(p),
  covered: infoDeltaPointCovered(content, p),
})

const p2 = '北狄拓跋烈犯边，第二卷主敌登场'
console.log({
  tuoba: infoDeltaPointCovered(content, p2),
})
