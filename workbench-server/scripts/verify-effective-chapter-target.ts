/**
 * npx tsx scripts/verify-effective-chapter-target.ts
 */
import { resolveEffectiveChapterTarget } from '../src/services/novel/novel-chapter-target.js'

const r = resolveEffectiveChapterTarget({
  chapterOutline: '拍点甲仔细描写一场冲突 / 拍点乙推进关系变化 / 他决定改变命运走向',
  userTarget: 2800,
})
if (r.beatCount < 2) throw new Error(`beatCount ${r.beatCount}`)
if (r.effectiveTarget !== 2800) throw new Error(`must keep user target got ${r.effectiveTarget}`)
if (r.downscaled) throw new Error('must not force downscale')
if (!r.sparseBeats || !r.promptBlock.includes('2800')) {
  throw new Error('sparse hint missing')
}

const longOutline = Array.from({ length: 12 }, (_, i) => `拍点${i}详细描写一场完整冲突与反应`).join(' / ')
const long = resolveEffectiveChapterTarget({
  chapterOutline: longOutline,
  userTarget: 2700,
})
if (long.effectiveTarget !== 2700 || long.sparseBeats) {
  throw new Error('enough beats should not sparse')
}

const empty = resolveEffectiveChapterTarget({ chapterOutline: '', userTarget: 2000 })
if (empty.effectiveTarget !== 2000 || empty.beatCount !== 0) {
  throw new Error('empty outline should keep user target')
}

console.log('verify-effective-chapter-target OK', { r, longBeats: long.beatCount })
