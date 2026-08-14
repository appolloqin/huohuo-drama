/**
 * 章缝结构判定卡
 * npx tsx scripts/verify-seam-structure-verdict.ts
 */
import {
  computeSeamStructureVerdict,
  formatSeamStructureVerdictBlock,
  enforceSeamStructureOnDimensionReport,
} from '../src/services/novel/novel-seam-structure-verdict.js'
import {
  scrubDimensionAuditFalsePositives,
  DIMENSION_AUDIT_LABELS,
} from '../src/services/novel/novel-dimension-verdict.js'
import { detectSeamPlaceJump } from '../src/services/novel/novel-chapter-end-snapshot.js'

const prevTail = '对方拒收。来人僵在炕沿。屋里只剩灶火噼啪两声。'
const snap = {
  chapter_number: 11,
  time: '傍晚',
  place: '对户小屋',
  cast: '来人、对户',
  last_event: '拒收',
  open_threads: '',
  updated_at: new Date().toISOString(),
}

const daysLater = `
数日后上午，院门口冻土发硬。他擦了把手，踱到院门口，拨开门闩探出半张脸。
外头站着刘干事，笑着说上门关心。
`.trim() + '后文。'.repeat(100)

const bridged = computeSeamStructureVerdict({
  content: daysLater,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
  chapterOutline: '刘干事上门盘问来历',
})
if (!bridged || bridged.place_continuity !== 'bridged') {
  throw new Error(`数日后应 bridged：${JSON.stringify(bridged)}`)
}
if (bridged.bridge !== 'cross_day_or_gap') {
  throw new Error(`桥类型应为 cross_day_or_gap：${bridged.bridge}`)
}
if (bridged.visitor_from_outline !== 'yes') {
  throw new Error(`大纲点名刘干事且开篇出现 → yes：${bridged.visitor_from_outline}`)
}
if (detectSeamPlaceJump({
  content: daysLater,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})) {
  throw new Error('bridged 不应硬拦')
}

const block = formatSeamStructureVerdictBlock(bridged)
if (!/权威·禁止覆写/.test(block) || !/place_continuity|场合连续/.test(block)) {
  throw new Error(`format 块不完整：${block.slice(0, 200)}`)
}

const poison = `
灶房里热气扑脸，锅沿还挂着昨夜的水汽。院门被拍得砰砰响。
有人在外头叫门。
`.trim()
const jump = computeSeamStructureVerdict({
  content: poison,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})
if (!jump || jump.place_continuity !== 'jump' || jump.bridge !== 'none') {
  throw new Error(`无桥换场应 jump：${JSON.stringify(jump)}`)
}
if (!detectSeamPlaceJump({
  content: poison,
  chapterNumber: 12,
  prevChapterTail: prevTail,
  prevSnapshot: snap,
})) {
  throw new Error('jump 应硬拦')
}

const same = computeSeamStructureVerdict({
  content: '门外忽然响起敲门声。他透过门缝看清来人，才开了一条缝应付几句。',
  chapterNumber: 12,
  prevChapterTail: '他把门闩插死，把东西搁在灶台边。',
  prevSnapshot: { ...snap, place: '屋里', last_event: '插门' },
})
if (!same || same.place_continuity !== 'same') {
  throw new Error(`同场合应 same：${JSON.stringify(same)}`)
}

// 按卡强制对齐：bridged 时跳切维 fail 须洗掉（非词表 scrub）
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
  daysLater,
  '刘干事上门盘问',
  bridged,
)
if (!scrubbed || scrubbed.failCount !== 0) {
  throw new Error(`按卡对齐 failCount=${scrubbed?.failCount}`)
}

const enforced = enforceSeamStructureOnDimensionReport(
  { complete: true, failCount: 3, overallReason: '跳变', dimensions: dims },
  bridged,
)
if (!enforced || enforced.failCount !== 0) {
  throw new Error('enforce 应对齐 bridged')
}

console.log('verify-seam-structure-verdict OK', {
  bridged: bridged.place_continuity,
  jump: jump.place_continuity,
  same: same.place_continuity,
  visitor: bridged.visitor_from_outline,
})
