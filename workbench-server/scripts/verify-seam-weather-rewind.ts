/**
 * 天候/过程初起：工具可检；一致性硬审 detectChapterSeamReplay 须硬拦；coldOpen 不单独因天候硬拒
 * npx tsx scripts/verify-seam-weather-rewind.ts
 */
import {
  detectChapterSeamWeatherRewind,
  detectChapterSeamColdOpen,
  detectChapterSeamReplay,
} from '../src/services/novel/novel-chapter-seam.js'

function mustHit(label: string, prev: string, opening: string) {
  const hit = detectChapterSeamWeatherRewind({
    content: opening,
    chapterNumber: 4,
    prevChapterTail: prev,
  })
  if (!hit || !/天候倒退/.test(hit.message)) {
    throw new Error(`${label}: 应命中天候倒退，实际 ${hit?.message || 'null'}`)
  }
}

function mustMiss(label: string, prev: string, opening: string) {
  const hit = detectChapterSeamWeatherRewind({
    content: opening,
    chapterNumber: 4,
    prevChapterTail: prev,
  })
  if (hit) throw new Error(`${label}: 不应命中 → ${hit.message}`)
}

mustHit(
  '密雪→才开始落',
  '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。',
  '雪是下午才开始落的。起初只是稀稀拉拉几个碎粒，让风卷着往领口里钻。秦卫国站屋门口，拢了拢棉袄领子，抬头看天。铅灰的云压得低。',
)

mustMiss(
  '密雪续写',
  '雪越下越密，打在脸上生疼。辨认着前方那片林子。',
  '雪还是那么密，能见度不到二十步。他放慢脚步，目光在雪面上扫。',
)

mustMiss(
  '次日新雪',
  '雪越下越密，打在脸上生疼。辨认着前方那片林子。',
  '次日清晨，雪是天刚亮才开始落的。起初只是稀稀拉拉几个碎粒。他披上棉袄出门。',
)

// 仅天候：coldOpen 不得因天候单独硬拒（林中续写场景）
const weatherOnlyOpen = detectChapterSeamColdOpen({
  content: '雪是下午才开始落的。起初只是稀稀拉拉几个碎粒。林子里能见度很低，他继续往前辨脚印。'.repeat(2),
  chapterNumber: 4,
  prevChapterTail: '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。'.repeat(2),
  chapterOutline: '【本章起因】进入林海寻找猎物',
})
if (weatherOnlyOpen && /天候倒退/.test(weatherOnlyOpen.message)) {
  throw new Error(`weather must not hard-reject via coldOpen: ${weatherOnlyOpen.message}`)
}

// 一致性硬审须拦过程相位倒退（模型软放行时的兜底）
const hardWx = detectChapterSeamReplay({
  content: '雪是下午才开始落的。起初只是稀稀拉拉几个碎粒。林子里能见度很低，他继续往前辨脚印。'.repeat(2),
  chapterNumber: 4,
  prevChapterTail: '雪越下越密，打在脸上生疼。秦卫国眯起眼，辨认着前方那片黑黢黢的林子。'.repeat(2),
})
if (!hardWx || !/天候倒退|离场吃书/.test(hardWx.message)) {
  throw new Error(`hard replay must catch weather/departure phase, got: ${hardWx?.message || 'null'}`)
}

console.log('verify-seam-weather-rewind OK')
