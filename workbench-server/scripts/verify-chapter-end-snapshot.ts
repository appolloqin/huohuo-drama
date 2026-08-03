/**
 * 章末状态契约：派生 + 开篇对照
 * Run: npx tsx scripts/verify-chapter-end-snapshot.ts
 */
import {
  deriveChapterEndSnapshot,
  detectOpeningAgainstChapterEndSnapshot,
  formatChapterEndSnapshotBlock,
} from '../src/services/novel/novel-chapter-end-snapshot.js'
import { detectChapterSeamColdOpen } from '../src/services/novel/novel-chapter-seam.js'

const ch4 = `
就在日头爬到树梢正中央的时候，岩壁根下那丛荆条动了。一团灰褐色的毛球从雪洞里探出半个脑袋。
秦卫国连呼吸都屏住了。他一动不动趴在雪地里，脸上的冷和心里的热搅在一块儿。
`.repeat(3)

const snap = deriveChapterEndSnapshot({
  chapterNumber: 4,
  content: ch4,
  ledger: {
    timeline: '正午，日头在树梢正中',
    environment: '红松林雪地、岩壁根',
    relations: '秦卫国独处狩猎',
    actions: '日头正中时发现雪洞灰兔探头',
    foreshadowing: '明日可设套',
  },
  contentHash: 'test',
})
if (!snap) throw new Error('derive failed')
if (!/正午/.test(snap.time)) throw new Error(`time should be noon: ${snap.time}`)
if (!/林|雪/.test(snap.place)) throw new Error(`place outdoor: ${snap.place}`)

const block = formatChapterEndSnapshotBlock(snap)
if (!/上章末状态契约/.test(block)) throw new Error('block missing header')

const dawn = `
晨光还没把树梢染白，秦卫国已经退到上风处一棵老松背后。他盯着窟窿口，细线卡住灰兔。
`.repeat(4)

const cold = detectChapterSeamColdOpen({
  content: dawn,
  chapterNumber: 5,
  prevChapterTail: ch4,
  chapterOutline: '设置简易陷阱 / 剥皮处理 / 回程遇赵大彪',
  prevSnapshot: snap,
})
// 晨光开篇相对正午契约：时辰倒退，或地点/刚发生未承接（二者任一即可）
if (!cold || !/(时辰倒退|地点\/经过倒退)/.test(cold.message)) {
  throw new Error(`expected seam cold with snapshot: ${cold?.message}`)
}

const homeOpen = `
天没亮，秦卫国醒了。炕那头苏婉还蜷着。他摸出猎刀，开了门往林子走。
`.repeat(5)
const placeHit = detectOpeningAgainstChapterEndSnapshot({
  content: homeOpen,
  chapterNumber: 5,
  prevSnapshot: snap,
})
if (!placeHit || !/地点\/经过倒退/.test(placeHit.message)) {
  throw new Error(`expected place rewind: ${placeHit?.message}`)
}

console.log('PASS')
