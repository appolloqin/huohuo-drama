/**
 * 字数区间硬拒：目标 2800 时 ~1900 字必须抛错
 * Run: npx tsx scripts/verify-chapter-length-band.ts
 */
import { assertNovelChapterLengthBand, countNovelChars } from '../src/common/novel/novel-char-limit.js'

const target = 2800
const minLen = Math.round(target * 0.88) // 2464
const maxLen = Math.round(target * 1.12)

const short = '甲'.repeat(1917)
try {
  assertNovelChapterLengthBand({ text: short, minLen, maxLen, chapterNumber: 11 })
  throw new Error('1917 vs 2800 must reject')
} catch (e: any) {
  if (!/过短|1917|2464/.test(e?.message || '')) {
    throw new Error(`unexpected: ${e?.message}`)
  }
}

const ok = '乙'.repeat(2500)
assertNovelChapterLengthBand({ text: ok, minLen, maxLen, chapterNumber: 11 })

const pendingMin = Math.round(target * 0.82)
try {
  assertNovelChapterLengthBand({ text: short, minLen: pendingMin, maxLen, chapterNumber: 11 })
  throw new Error('1917 vs pending min must reject')
} catch (e: any) {
  if (!/过短/.test(e?.message || '')) throw e
}

if (countNovelChars(short) !== 1917) throw new Error('count mismatch')
console.log('verify-chapter-length-band OK')
