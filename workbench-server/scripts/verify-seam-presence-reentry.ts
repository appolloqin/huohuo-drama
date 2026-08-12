/**
 * 章缝在场状态：共处后再抵达 / 共处后外宿声称；已离场归来不拦
 * npx tsx scripts/verify-seam-presence-reentry.ts
 */
import { detectChapterSeamPresenceReentry } from '../src/services/novel/novel-chapter-end-snapshot.js'
import { detectChapterSeamColdOpen } from '../src/services/novel/novel-chapter-seam.js'

const prevTail = `
秦卫国没说话，从兜里掏出那截剩下的麻绳，扔到她跟前。“缠紧点。”苏婉低下头，左手笨拙地捏起绳头，开始一圈一圈地绕。
动作比早上慢了些，但每股之间绕得越发匀实。
秦卫国坐在她对面，拿起一根木料继续削第二副踏板的楔口。屋里只有柴火噼啪声和刀削木头的沙沙声，偶尔掺进一两声苏婉的咳嗽。
窗外天色暗下来，风又起了。
`.trim()

const snap = {
  chapter_number: 7,
  time: '傍晚',
  place: '屋里',
  cast: '秦卫国、苏婉',
  last_event: '秦卫国坐在她对面削踏板，苏婉缠麻绳',
  open_threads: '',
  updated_at: new Date().toISOString(),
}

function mustHit(label: string, opening: string) {
  const hit = detectChapterSeamPresenceReentry({
    content: opening,
    chapterNumber: 8,
    prevChapterTail: prevTail,
    prevSnapshot: snap,
  })
  if (!hit) throw new Error(`应命中：${label}`)
}

function mustMiss(label: string, opening: string, prev?: string) {
  const hit = detectChapterSeamPresenceReentry({
    content: opening,
    chapterNumber: 8,
    prevChapterTail: prev ?? prevTail,
    prevSnapshot: snap,
  })
  if (hit) throw new Error(`不应命中：${label} → ${hit.message}`)
}

// A: 多种「再进场」
mustHit('推门进来', '雪光映进窗棂。秦卫国推门进来的时候，提着猎物。')
mustHit('走了进来', '天亮后，秦卫国走了进来，袖口还带着雪。苏婉抬起头。')
mustHit('进了屋', '灶火还亮着。他进了屋，把背上的东西放下。')
mustHit('回到家', '日头偏西，秦卫国回到家，看见苏婉还在炕边坐着。')
mustHit('赶回来', '后晌，他赶回来，一进门就问她手好些没。')

// B: 凭空外宿
mustHit('进山一宿', '苏婉把粥热好。秦卫国进山一宿，这会儿才进门，冻得脸上发青。')

// 负例：正当承接 / 已离场再归来
mustMiss(
  '对坐续写无进场',
  '秦卫国放下刀子，看了看苏婉缠好的绳。屋里火光跳了跳，风从窗缝钻进来。',
)
mustMiss(
  '已离场后推门归来',
  '雪光映进窗棂。秦卫国推门进来，提着猎物。',
  '秦卫国披上大衣，跟苏婉说了声「我出去一趟」，推门走了。门外雪很大，人影没入夜色。',
)

// C: 已在途 → 禁止开篇从封闭场合重演出发（题材无关）
{
  const forestPrev = '秦卫国没再回头，一步步往林子深处走。他眯起眼，辨认着前方那片黑黢黢的林子。'
  const replayLeave = detectChapterSeamPresenceReentry({
    content: '晨雾未散。茅屋的门在身后合上。苏婉站在门槛里。他说门闩插死，晌午前回。',
    chapterNumber: 4,
    prevChapterTail: forestPrev,
  })
  if (!replayLeave || !/离场吃书/.test(replayLeave.message)) {
    throw new Error('已在途后重演出发应命中离场吃书')
  }
}

const cold = detectChapterSeamColdOpen({
  content: '雪光映进窗棂。秦卫国推门进来，提着猎物。他把狍子搁下，开始处理，苏婉在灶边烧水。',
  chapterNumber: 8,
  prevChapterTail: prevTail,
  chapterOutline: '处理猎物 / 炖肉 / 邻居眼红',
  prevSnapshot: snap,
})
if (!cold || !/在场吃书/.test(cold.message)) {
  throw new Error('冷开篇应落到在场吃书')
}

console.log('verify-seam-presence-reentry OK')
