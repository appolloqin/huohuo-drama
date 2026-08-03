/**
 * 人名复现不得抬高「短语重复」、不得出现在修改建议里；机械「了一」仍应可检出
 * npx tsx scripts/verify-name-bigram-not-phrase.ts
 */
import { detectAiText } from '../src/services/ai/ai-text-detection.js'

const body = Array.from({ length: 15 }, (_, i) =>
  i % 2 === 0
    ? `秦卫国把兔子搁上案板，苏婉看着他，赵大彪还在外头转。`
    : `院里风大，秦卫国拍了拍袖子，苏婉没吭声。`,
).join('\n\n')

const det = detectAiText(body)
const phrase = det.signals.find(s => s.key === 'phrase_repetition')?.score ?? 0
if (phrase >= 0.45) {
  throw new Error(`人名章短语重复应偏低，实际 ${Math.round(phrase * 100)}%`)
}
const bad = (det.suggestions || []).filter(s =>
  s.signal_key === 'phrase_repetition' && /秦卫|卫国/.test(s.match_text || ''),
)
if (bad.length) {
  throw new Error(`建议不应再钉人名二字组：${bad.map(b => b.match_text).join(',')}`)
}

const mechanical = Array.from({ length: 12 }, (_, i) =>
  [
    '他看了一眼门外，又听了一下动静。',
    '再愣了一下，又停了一下。',
    '他摸了一下刀柄，又扫了一眼院子。',
  ][i % 3],
).join('')
const det2 = detectAiText(mechanical)
const phrase2 = det2.signals.find(s => s.key === 'phrase_repetition')?.score ?? 0
const hitLe = (det2.suggestions || []).some(s =>
  s.signal_key === 'phrase_repetition' && s.match_text?.includes('了一'),
)
if (phrase2 < 0.5) {
  throw new Error(`机械「了一」复读短语分应偏高，实际 ${Math.round(phrase2 * 100)}% (chars=${det2.char_count})`)
}
if (!hitLe) {
  throw new Error('机械「了一」应出现在修改建议里')
}

console.log('verify-name-bigram-not-phrase OK', {
  nameChapterPhrase: Math.round(phrase * 100),
  nameChapterProb: det.probability,
  mechanicalPhrase: Math.round(phrase2 * 100),
})
