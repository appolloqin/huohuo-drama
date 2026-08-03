/**
 * 段落节奏打散应降低检测器的段落均匀度
 * npx tsx scripts/verify-paragraph-rhythm.ts
 */
import { varyNovelParagraphRhythm } from '../src/common/novel/novel-paragraph-format.js'
import { detectAiText } from '../src/services/ai/ai-text-detection.js'

// 8 段近乎等长（模拟润色规范化后的模板切段）
const uniform = [
  '秦卫国把脊背贴紧岩壁根，一动不敢动，西北风顺着豁口灌下来。',
  '他眯着眼，视线落在岩壁上方那片被雪半掩的阴影，腥气还在鼻腔。',
  '心里有数，这东西若真是野猪，今天这身子板跟它硬碰嫌命长。',
  '屏住呼吸，膝盖抵着前腿，半蹲在那块冷硬的雪壳子上一动不动。',
  '他盯准一处凹地，岩壁根下背风朝阳，雪浅草厚，正是山兔出没处。',
  '手从腰后抽出猎刀，刀身贴在小臂外侧，刀尖微压着雪壳子往前摸。',
  '松根盘错的地方积雪更薄，他侧身贴过去，脚步轻得几乎没有声响。',
  '远处林子里传来一声闷响，他停住，等了半晌才继续朝凹地挪过去。',
].join('\n\n')

const before = detectAiText(uniform)
const paraBefore = before.signals.find(s => s.key === 'paragraph_uniformity')?.score ?? 0
const afterText = varyNovelParagraphRhythm(uniform)
const after = detectAiText(afterText)
const paraAfter = after.signals.find(s => s.key === 'paragraph_uniformity')?.score ?? 0

if (paraBefore < 0.5) {
  throw new Error(`夹具段落均匀度应偏高，实际 ${paraBefore}`)
}
if (paraAfter >= paraBefore) {
  throw new Error(`打散后段落均匀度应下降：${paraBefore} → ${paraAfter}`)
}
if (paraAfter > 0.3) {
  throw new Error(`打散后段落均匀度应进入低档(≤28%)，实际 ${Math.round(paraAfter * 100)}%`)
}
const paras = afterText.split(/\n\n+/).filter(Boolean)
for (const p of paras) {
  const n = (p.match(/[。！？!?]/g) || []).length
  if (n > 3) throw new Error(`段超 3 句(${n})`)
}

console.log('verify-paragraph-rhythm OK', {
  paraBefore: Math.round(paraBefore * 100),
  paraAfter: Math.round(paraAfter * 100),
  paragraphs: paras.length,
})
