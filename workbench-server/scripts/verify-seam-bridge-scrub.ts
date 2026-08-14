/**
 * 结构卡对齐（替代旧词表 scrub）
 * npx tsx scripts/verify-seam-bridge-scrub.ts
 */
import {
  scrubModelConflictMessages,
  scrubDimensionAuditFalsePositives,
  DIMENSION_AUDIT_LABELS,
} from '../src/services/novel/novel-dimension-verdict.js'
import { computeSeamStructureVerdict } from '../src/services/novel/novel-seam-structure-verdict.js'
import { openingHasSeamBridge } from '../src/services/novel/novel-chapter-end-snapshot.js'

const pad = '数日后上午，院门口冻土发硬。他擦了把手，踱到院门口，拨开门闩。' + '后文推进。'.repeat(80)
if (!openingHasSeamBridge(pad)) throw new Error('数日后 must be bridge')

const snap = {
  chapter_number: 11,
  time: '傍晚',
  place: '对户小屋',
  cast: '来人、对户',
  last_event: '拒收',
  open_threads: '',
  updated_at: new Date().toISOString(),
}
const verdict = computeSeamStructureVerdict({
  content: pad,
  chapterNumber: 12,
  prevChapterTail: '对方拒收。来人僵在炕沿。',
  prevSnapshot: snap,
  chapterOutline: '刘干事上门盘问',
})
if (!verdict || verdict.place_continuity !== 'bridged') {
  throw new Error(`expected bridged: ${JSON.stringify(verdict)}`)
}

const dims = DIMENSION_AUDIT_LABELS.map((dimension) => {
  if (dimension === '时间线' || dimension === '地点' || dimension === '刚发生') {
    return {
      dimension,
      status: 'fail' as const,
      reason: '数日后上午无任何时间过渡，地点跳变',
      excerpt: '他擦了把手，踱到院门口',
    }
  }
  return { dimension, status: 'ok' as const, reason: '可推出' }
})

const scrubbed = scrubDimensionAuditFalsePositives(
  { complete: true, failCount: 3, overallReason: '开篇时间地点跳变无过渡', dimensions: dims },
  pad,
  '刘干事上门盘问',
  verdict,
)
if (!scrubbed || scrubbed.failCount !== 0) {
  throw new Error(`scrub failCount=${scrubbed?.failCount}`)
}

const kept = scrubModelConflictMessages(
  [
    '【时间线】数日后无过渡跳变；摘录「踱到院门口」',
    '吃书：人名与前序矛盾；摘录「某某把刀」',
  ],
  pad,
  '刘干事上门',
  verdict,
)
if (kept.length !== 1 || !/吃书/.test(kept[0]!)) {
  throw new Error(`model scrub: ${JSON.stringify(kept)}`)
}

console.log('verify-seam-bridge-scrub OK')
