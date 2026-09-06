// scripts/verify-ai-detect-features.ts
import { extractRawFeatures, FEATURE_RAW_KEYS, sentenceCv } from '../src/services/ai/ai-detect-features.js'

const human = '老赵把旱烟在鞋帮上磕了磕，火星子溅进雪里，滋的一响。他没说话，她也别说。远处狗咬了两声，又静下去，静得能听见屋檐水一滴一滴砸在冰壳上。\n\n"明儿就去把粮借回来。"他终于开口，嗓子眼里像卡着砂。'
const robot = '首先，我们需要认识到问题的复杂性。其次，应当从多个维度进行分析。与此同时，相关数据的积累也是不可或缺的一环。此外，值得注意的是，任何结论都需要充分证据的支持。综上所述，只有系统性地推进，才能取得实质性的进展。' + '我们需要保持谨慎。此外要注意细节。与此同时应统筹兼顾。'

const a = extractRawFeatures(human)
const b = extractRawFeatures(robot)
// 断言方向性：机械模板文在句长均匀度、套话密度上应显著高于人写样例
if (b.sentence_len_cv >= a.sentence_len_cv) {
  throw new Error(`expect human burstier cv: ${a.sentence_len_cv} vs ${b.sentence_len_cv}`)
}
if (b.tells_density <= a.tells_density) throw new Error('robot tells density should be higher')
if (FEATURE_RAW_KEYS.length < 14) throw new Error('feature list too short')
if (!Number.isFinite(a.char_entropy) || a.char_entropy <= 0) throw new Error('entropy')
if (a.bigram_repeat < 0 || a.bigram_repeat > 1) throw new Error('bigram_repeat range')
if (sentenceCv(['一二三。', '一二三。', '一二三。']) > 0.01) throw new Error('cv equal lens')

console.log('verify-ai-detect-features OK', {
  human_cv: a.sentence_len_cv.toFixed(2), robot_cv: b.sentence_len_cv.toFixed(2),
  robot_tells: b.tells_density.toFixed(2), human_tells: a.tells_density.toFixed(2),
})
