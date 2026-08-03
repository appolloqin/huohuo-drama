/**
 * 每段最多 3 句
 * npx tsx scripts/verify-paragraph-max-sentences.ts
 */
import { enforceMaxSentencesPerParagraph } from '../src/common/novel/novel-paragraph-format.js'

const wall = '他拿雪搓干净了手，把卷在袖口里的肠子取出来搁在木盆里，解开抖了抖，里头还没冻实，得赶紧收拾。这东西在外头零下二十多度的地界放久了会发苦，吃着扎嘴。蹲在灶台边那块豁了边的木板前，左手把肠子捏住，右手拿那把从鹿皮套里抽出来的猎刀，刀尖轻轻一划，肠衣里那层脏水就流出来了。拿雪搓了几遍，又翻过来把里头那层黏膜刮净。这活儿费工夫，他动作不急，刀贴着肠壁一层层刮过去，外头那层薄皮不破才算利索。刮完了用雪再搓两遍，卷起来搁在干净的雪堆里冻着，回头炖汤时切段丢进去，提鲜。'

const out = enforceMaxSentencesPerParagraph(wall)
const paras = out.split(/\n\n+/).filter(Boolean)
// 6 句 → 宜 2 段×3 句（场面 1～6 段均可，不强制 3 段）
if (paras.length < 1 || paras.length > 6) {
  throw new Error(`场面段数宜在 1～6，实际 ${paras.length}`)
}
for (const p of paras) {
  const n = (p.match(/[。！？!?]/g) || []).length
  if (n > 3) throw new Error(`段超 3 句(${n}): ${p.slice(0, 40)}…`)
}
if (paras.length === 2 && paras.every(p => (p.match(/[。！？!?]/g) || []).length === 3)) {
  // ideal for this 6-sentence fixture
} else if (paras.some(p => (p.match(/[。！？!?]/g) || []).length > 3)) {
  throw new Error('单段不得超过 3 句')
}

console.log('verify-paragraph-max-sentences OK', {
  paragraphs: paras.length,
  sentences: paras.map(p => (p.match(/[。！？!?]/g) || []).length),
})
