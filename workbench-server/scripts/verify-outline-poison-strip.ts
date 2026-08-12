/**
 * 正文级大纲删毒验收
 * Run: npx tsx scripts/verify-outline-poison-strip.ts
 */
import { stripOutlinePoisonProse } from '../src/services/novel/novel-outline-poison-strip.js'

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

console.log('PASS')
