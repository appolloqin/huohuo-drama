/**
 * npx tsx scripts/verify-state-card-validate.ts
 */
import {
  fieldGroundedInText,
  castNames,
  looksLikePersonName,
  validateStateCardAgainstContent,
  validateStateCardNeighborSeam,
} from '../src/services/novel/novel-state-card-validate.js'
import type { ChapterStateCard } from '../src/common/novel/novel-state-card.js'

function baseCard(over: Partial<ChapterStateCard> = {}): ChapterStateCard {
  return {
    chapter_number: 3,
    content_hash: 'h',
    updated_at: new Date().toISOString(),
    schema_version: 1,
    timeline: '午后',
    place: '黑黢黢的林子',
    scene: '途中',
    cast: '秦卫国',
    progress: { catalyst_done: 'unknown', last_event: '辨认着前方那片黑黢黢的林子' },
    props: '破棉袄',
    ...over,
  }
}

if (!fieldGroundedInText('黑黢黢的林子', '雪越下越密。辨认着前方那片黑黢黢的林子。')) {
  throw new Error('place should ground')
}
if (fieldGroundedInText('东海龙宫', '雪越下越密。辨认着前方那片林子。')) {
  throw new Error('unrelated place should not ground')
}

// 弯引号 + 句首代词省略：她低下头 ↔ 苏婉低下头（结构，非场面词）
const ropeProse = '秦卫国坐在炕沿搓绳。苏婉低下头，照着他说的法子绞，这回麻芯子听话了些，三股拧成一股，绕在木条上头，绑紧。'
const ropeEvent = '”她低下头，照着他说的法子绞，这回麻芯子听话了些，三股拧成一股，绕在木条上头，绑紧。'
if (!fieldGroundedInText(ropeEvent, ropeProse)) {
  throw new Error('quoted last_event with pronoun lead should ground')
}

// 人名：姓氏首字 + 无体貌标记；动作碎片/状语不进 cast
if (looksLikePersonName('赶紧') || looksLikePersonName('照着他') || looksLikePersonName('马上')) {
  throw new Error('non-name tokens should fail looksLikePersonName')
}
if (!looksLikePersonName('秦卫国') || !looksLikePersonName('苏婉')) {
  throw new Error('real names should pass looksLikePersonName')
}

const noiseCast = castNames('赶紧、照着他、马上、跟着她、秦卫国、苏婉')
if (noiseCast.some(n => ['赶紧', '照着他', '马上', '跟着她'].includes(n))) {
  throw new Error(`cast noise not filtered: ${noiseCast.join(',')}`)
}
if (!noiseCast.includes('秦卫国') || !noiseCast.includes('苏婉')) {
  throw new Error(`real names dropped: ${noiseCast.join(',')}`)
}

// 纯噪声 cast → 无人名候选 → 不因 cast 失败
const ropeCard = validateStateCardAgainstContent(
  baseCard({
    chapter_number: 10,
    place: '炕沿',
    scene: '屋里',
    cast: '赶紧、照着他',
    progress: { catalyst_done: 'unknown', last_event: ropeEvent },
    props: '麻绳',
  }),
  `${ropeProse} 他们还在屋里搓绳。`.repeat(2),
)
if (!ropeCard.ok) {
  throw new Error(`rope chapter should pass: ${ropeCard.issues.map(i => i.message).join(';')}`)
}

const good = validateStateCardAgainstContent(
  baseCard(),
  '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。他穿着破棉袄往前走。'.repeat(2),
)
if (!good.ok) throw new Error(`should pass: ${good.issues.map(i => i.message).join(';')}`)

const bad = validateStateCardAgainstContent(
  baseCard({ progress: { catalyst_done: 'unknown', last_event: '提着三只野兔推门进了屋' } }),
  '雪越下越密。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。'.repeat(2),
)
if (bad.ok) throw new Error('wrong last_event should fail')

const seam = validateStateCardNeighborSeam({
  prevCard: baseCard(),
  nextCard: baseCard({
    chapter_number: 4,
    place: '茅屋门口',
    scene: '门口',
    timeline: '下午',
    progress: { catalyst_done: 'unknown', last_event: '站在屋门口看天' },
  }),
  nextOpening: '雪是下午才开始落的。秦卫国站屋门口，拢了拢棉袄领子，抬头看天。',
})
if (seam.ok || !seam.issues.some(i => i.code === 'seam_place_rewind')) {
  throw new Error('away→door without cross-day should fail')
}

const seamOk = validateStateCardNeighborSeam({
  prevCard: baseCard(),
  nextCard: baseCard({
    chapter_number: 4,
    place: '茅屋',
    scene: '屋里',
    timeline: '次日清晨赶回了家',
    progress: { catalyst_done: 'unknown', last_event: '回到家中' },
  }),
  nextOpening: '次日清晨他赶回了家。苏婉还在炕上。',
})
if (!seamOk.ok) throw new Error(`cross-day return should pass: ${seamOk.issues.map(i => i.message).join(';')}`)

// 上章地点写成全章旅程，但章末刚发生已是接人/归家 → 下章室内不得误判途中倒退
const journeyHome = validateStateCardNeighborSeam({
  prevCard: baseCard({
    chapter_number: 9,
    place: '北疆林场公社到自家院落，全程雪地天寒；晌午西坡清林；傍晚老白桦底下',
    scene: '途中雪地至院落一带',
    progress: { catalyst_done: 'unknown', last_event: '傍晚站在树下接苏婉回家' },
  }),
  nextCard: baseCard({
    chapter_number: 10,
    place: '自家屋里',
    scene: '室内炕沿',
    timeline: '数日间',
    progress: { catalyst_done: 'unknown', last_event: '坐在炕沿搓麻绳' },
  }),
  nextOpening: '秦卫国坐在炕沿上搓麻绳，手指翻飞。',
})
if (!journeyHome.ok) {
  throw new Error(`journey-then-home end should pass seam: ${journeyHome.issues.map(i => i.message).join(';')}`)
}

console.log('verify-state-card-validate OK')
