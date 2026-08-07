/**
 * 大纲覆盖校验：中间缺章须检出；分卷切块大小
 * npx tsx scripts/verify-outline-coverage-holes.ts
 */
import {
  listMissingOutlineChapters,
  listMissingOutlineChaptersInRange,
  validateOutlineChapterCoverage,
} from '../src/common/novel/novel-outline.js'

const withHole = `
【世界观设定】
- **修炼体系**：无
- **大陆/地域**：北疆
- **修真门派/势力**：林场
【总纲】测试
【分卷设计】
- 第一卷《测》（第1～5章）：目标
【分章概要】
第1章：一
【本章时间】早
【本章地点】家
【本章人物】甲
【本章起因】起
【欲望】欲
【阻碍】阻
【局面变化】变
【人物选择】选
【冲突层】外部
【情绪手法】抑
【章末问题】？
【信息增量】增
【主题回响】题

第3章：三
【本章时间】午
【本章地点】外
【本章人物】甲
【本章起因】起
【欲望】欲
【阻碍】阻
【局面变化】变
【人物选择】选
【冲突层】人际
【情绪手法】扬
【章末问题】？
【信息增量】增
【主题回响】题

第5章：五
【本章时间】晚
【本章地点】家
【本章人物】甲
【本章起因】起
【欲望】欲
【阻碍】阻
【局面变化】变
【人物选择】选
【冲突层】自我
【情绪手法】收
【章末问题】？
【信息增量】增
【主题回响】题
`

const cov = validateOutlineChapterCoverage(withHole, 5)
if (cov.ok) throw new Error('hole outline must fail coverage')
if (cov.maxChapter !== 5) throw new Error(`max expected 5 got ${cov.maxChapter}`)
if (cov.missingChapters.join(',') !== '2,4') {
  throw new Error(`missing expected 2,4 got ${cov.missingChapters}`)
}
if (listMissingOutlineChapters(withHole, 5).join(',') !== '2,4') {
  throw new Error('listMissingOutlineChapters mismatch')
}
if (listMissingOutlineChaptersInRange(withHole, 3, 5).join(',') !== '4') {
  throw new Error('range missing expected 4')
}

// 旧逻辑只看 max：max=5 会误判完整 —— 本校验必须挡住
if (cov.missing !== 2) throw new Error('missing count should be 2')

console.log('verify-outline-coverage-holes OK')
