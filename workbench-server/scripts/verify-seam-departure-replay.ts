/**
 * 章缝离场吃书（题材无关）：已在途 → 禁止开篇从封闭场合重演出发
 * npx tsx scripts/verify-seam-departure-replay.ts
 */
import {
  classifyPlaceCategory,
  detectChapterSeamPresenceReentry,
  prevEndsWithDeparture,
} from '../src/services/novel/novel-chapter-end-snapshot.js'

function mustHit(label: string, prev: string, opening: string) {
  if (!prevEndsWithDeparture(prev) && classifyPlaceCategory(prev.slice(-200)) !== 'away') {
    throw new Error(`${label}: 上章末应识别为离场/在途`)
  }
  const hit = detectChapterSeamPresenceReentry({
    content: opening,
    chapterNumber: 4,
    prevChapterTail: prev,
  })
  if (!hit || !/离场吃书/.test(hit.message)) {
    throw new Error(`${label}: 应命中离场吃书，实际 ${hit?.message || 'null'}`)
  }
}

function mustMiss(label: string, prev: string, opening: string) {
  const hit = detectChapterSeamPresenceReentry({
    content: opening,
    chapterNumber: 4,
    prevChapterTail: prev,
  })
  if (hit && /离场吃书/.test(hit.message)) {
    throw new Error(`${label}: 不应命中离场吃书 → ${hit.message}`)
  }
}

// 重生年代：入林后再演出门
mustHit(
  '入林→重演出门',
  '秦卫国没再回头，一步步往林子深处走。他眯起眼，辨认着前方那片黑黢黢的林子。',
  '晨雾未散，林子灰蒙蒙。茅屋的门在身后合上。苏婉站在门槛里。他说我晌午前回。',
)

// 入林后开篇倒退门口看天/回屋取物再上路（无「出门」字样也须拦）
mustHit(
  '入林→门口看天回屋',
  '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。',
  '雪是下午才开始落的。起初只是稀稀拉拉几个碎粒。秦卫国站屋门口，拢了拢棉袄领子，抬头看天。他转身回屋，捡了绳子和斧头，又掰了块玉米饼子揣怀里。风呜呜地刮，他沿着屋后那条土路往林子深处走。',
)

// 跨日赶回再出门：不应误杀
mustMiss(
  '次日赶回再出门',
  '雪越下越密。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。',
  '次日清晨他赶回了家。苏婉还在炕上。他把房门带上，说一声我去一趟，迈步出门。',
)

// 都市：已上街再演离家
mustHit(
  '上街→重演离家',
  '他头也不回，走进夜色里的街道。人影没入霓虹里。',
  '他把房门带上，对妻子说今晚晚点回，转身走进电梯。',
)

// 玄幻：已出城再演从厢房出发
mustHit(
  '出城→重演厢房出发',
  '他出了城门，往官道走去，不再回头。',
  '他推开厢房门，对师妹说一声我去一趟，迈步出门。',
)

// 负例：途中续写
mustMiss(
  '林中续写',
  '秦卫国没再回头，一步步往林子深处走。辨认着前方那片林子。',
  '晨雾还没散透，林子里灰蒙蒙一片。他踩着深雪往前辨脚印，顺着坡跟过去。',
)

// 负例：上章还在屋里，开篇出门合法
mustMiss(
  '屋里→出门合法',
  '秦卫国坐在炕沿上擦刀。苏婉把糠饼掰开，推到他手边。屋里只剩柴火噼啪声。',
  '天没亮透，秦卫国披上大衣推门出去。苏婉站在门槛里没出声。门外雪很深。',
)

console.log('verify-seam-departure-replay OK')
