/**
 * npx tsx scripts/verify-state-card-normalize.ts
 */
import {
  formatNeighborStateCardsBlock,
  isStateCardStale,
  normalizeChapterStateCard,
  projectStateCardFromLedgerAndSnapshot,
  sortChapterNumbersAscending,
} from '../src/common/novel/novel-state-card.js'
import { buildStateCardContentWindow } from '../src/services/novel/novel-state-card-extract.js'

if (normalizeChapterStateCard({}, 1) !== null) throw new Error('empty should be null')

const card = normalizeChapterStateCard({
  timeline: '午后密雪',
  place: '白桦林深处',
  scene: '途中',
  cast: '秦卫国',
  last_event: '辨认前方林子',
  props: '棉袄；铁丝钩',
  content_hash: 'abc',
}, 3)
if (!card || card.place !== '白桦林深处') throw new Error('normalize failed')

const projected = projectStateCardFromLedgerAndSnapshot({
  chapterNumber: 3,
  contentHash: 'h1',
  ledger: {
    chapter_number: 3,
    updated_at: new Date().toISOString(),
    environment: '林中密雪',
    timeline: '午后',
    appearance: '破棉袄',
    resources: '半截铁丝',
  },
  snapshot: {
    chapter_number: 3,
    time: '午后',
    place: '黑黢黢的林子',
    cast: '秦卫国',
    last_event: '辨认着前方那片林子',
    updated_at: new Date().toISOString(),
  },
})
if (!projected || !/林/.test(projected.place + projected.scene)) {
  throw new Error('project failed')
}

const block = formatNeighborStateCardsBlock({ prevCard: card, nextCard: null })
if (!/上章状态卡/.test(block) || /第1章/.test(block)) {
  throw new Error('neighbor block should only include prev')
}
if (isStateCardStale(card, 'abc') !== false) throw new Error('hash match')
if (isStateCardStale(card, 'zzz') !== true) throw new Error('hash mismatch')

const ordered = sortChapterNumbersAscending([3, 1, 2, 2])
if (ordered.join(',') !== '1,2,3') throw new Error(`order ${ordered}`)

const long = '甲'.repeat(8000)
const win = buildStateCardContentWindow(long)
if (win.includes('甲'.repeat(8000))) throw new Error('window must truncate')
if (![...win].length || [...win].length >= 8000) throw new Error('window size')

console.log('verify-state-card-normalize OK')
