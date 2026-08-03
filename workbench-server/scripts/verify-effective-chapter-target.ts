/**
 * npx tsx scripts/verify-effective-chapter-target.ts
 */
import { resolveEffectiveChapterTarget } from '../src/services/novel/novel-chapter-target.js'

const r = resolveEffectiveChapterTarget({
  chapterOutline: '拍点甲仔细描写一场冲突 / 拍点乙推进关系变化 / 他决定改变命运走向',
  userTarget: 2700,
})
if (r.beatCount < 2) throw new Error(`beatCount ${r.beatCount}`)
if (r.effectiveTarget >= 2700) throw new Error(`should downscale got ${r.effectiveTarget}`)
const expected = Math.min(2700, Math.max(800, r.beatCount * 500))
if (r.effectiveTarget !== expected) throw new Error(`math ${r.effectiveTarget} != ${expected}`)
if (!r.downscaled || !r.promptBlock.includes('大纲驱动')) {
  throw new Error('downscaled prompt missing')
}

const longOutline = Array.from({ length: 12 }, (_, i) => `拍点${i}详细描写一场完整冲突与反应`).join(' / ')
const long = resolveEffectiveChapterTarget({
  chapterOutline: longOutline,
  userTarget: 2700,
})
if (long.effectiveTarget !== 2700) throw new Error(`should not exceed user ${long.effectiveTarget}`)
if (long.downscaled) throw new Error('should not downscale when beats enough')

const empty = resolveEffectiveChapterTarget({ chapterOutline: '', userTarget: 2000 })
if (empty.effectiveTarget !== 2000 || empty.beatCount !== 0) {
  throw new Error('empty outline should keep user target')
}

console.log('verify-effective-chapter-target OK', { r, longBeats: long.beatCount })
