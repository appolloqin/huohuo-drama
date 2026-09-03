/**
 * U+FFFD 乱码：检测 + 词表修复（同步）
 * npx tsx scripts/verify-replacement-char.ts
 */
import {
  countReplacementChars,
  hasReplacementChars,
  repairNovelReplacementCharsLexicon,
} from '../src/common/novel/novel-replacement-char.js'
import { normalizeNovelTemporalNumerals } from '../src/common/novel/novel-temporal-numerals.js'

const sample =
  '那份借据脱手飘了半截，正好被秦霄另一只手接住。“……你！”钱虎踉\uFFFD后退两步，一头撞在身后拿煞刀那弟子的刀鞘上，差点一屁股坐倒。'

if (!hasReplacementChars(sample)) {
  throw new Error('expected hasReplacementChars(sample)=true')
}
if (countReplacementChars(sample) !== 1) {
  throw new Error(`expected 1 FFFD, got ${countReplacementChars(sample)}`)
}

const fixed = repairNovelReplacementCharsLexicon(sample)
if (hasReplacementChars(fixed)) {
  throw new Error(`lexicon left FFFD:\n${fixed}`)
}
if (!fixed.includes('踉跄后退')) {
  throw new Error(`expected 踉跄后退, got:\n${fixed}`)
}

const viaTemporal = normalizeNovelTemporalNumerals(sample)
if (hasReplacementChars(viaTemporal) || !viaTemporal.includes('踉跄后退')) {
  throw new Error(`temporal path failed:\n${viaTemporal}`)
}

const clean = '钱虎踉跄后退两步。'
if (repairNovelReplacementCharsLexicon(clean) !== clean) {
  throw new Error('clean text must be unchanged')
}

const awkward = '他感到尴\uFFFD，只好走开。'
const awkwardFixed = repairNovelReplacementCharsLexicon(awkward)
if (!awkwardFixed.includes('尴尬') || hasReplacementChars(awkwardFixed)) {
  throw new Error(`尴尬 repair failed: ${awkwardFixed}`)
}

// 未知词：词表修不了，应保留 FFFD（留给模型短修补）
const unknown = '他使出玄\uFFFD秘法。'
const unknownOut = repairNovelReplacementCharsLexicon(unknown)
if (!hasReplacementChars(unknownOut)) {
  throw new Error('unknown digraph must keep FFFD for LLM path')
}

console.log('verify-replacement-char OK')
