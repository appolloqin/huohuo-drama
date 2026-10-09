/**
 * 本章大纲 → 总大纲替换 / 规范化
 * npx tsx scripts/verify-chapter-outline-sync.ts
 */
import {
  normalizeChapterSectionForBook,
  replaceOutlineChapterSection,
  sliceOutlineChapterSection,
  extractTagBlock,
} from '../src/services/novel/novel-outline-drama-fields.js'

const book = `【世界观】测试

第3章：烂账
【信息增量】旧三条

第4章：二叔通匪
【信息增量】黑风虎与一千二百。
【恨】拍桌

第5章：夜袭
【信息增量】号角
`

const chapterDesc = `二叔通匪

【本章时间】穿越第四日
【信息增量】黑风虎；一千二百。补上了三年的欠了三年的税银。
【恨】拍桌
`

const section = normalizeChapterSectionForBook({
  chapterNumber: 4,
  chapterOutline: chapterDesc,
})
if (!section.startsWith('第4章：二叔通匪')) {
  throw new Error(`须补章头: ${section.slice(0, 40)}`)
}
if (!extractTagBlock(section, '信息增量')?.includes('税银')) {
  throw new Error('须保留税银信息增量')
}

const next = replaceOutlineChapterSection(book, 4, section)
const ch4 = sliceOutlineChapterSection(next, 4)
if (!extractTagBlock(ch4, '信息增量')?.includes('税银')) {
  throw new Error(`写回后第4章须含税银: ${ch4.slice(0, 200)}`)
}
const ch3 = sliceOutlineChapterSection(next, 3)
const ch5 = sliceOutlineChapterSection(next, 5)
if (!ch3.includes('烂账') || !ch5.includes('夜袭')) {
  throw new Error('邻章不得被破坏')
}

const again = replaceOutlineChapterSection(next, 4, section)
if (again.replace(/\s+/g, '') !== next.replace(/\s+/g, '')) {
  // 允许空白归一差异；内容应稳定
  const a = extractTagBlock(sliceOutlineChapterSection(again, 4), '信息增量')
  const b = extractTagBlock(ch4, '信息增量')
  if (a !== b) throw new Error('幂等失败')
}

console.log('verify-chapter-outline-sync OK')
