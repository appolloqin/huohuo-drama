/**
 * 分章短标题去重辅助
 * Run: npx tsx scripts/verify-outline-short-title-dedupe.ts
 */
import {
  findDuplicateOutlineShortTitles,
  listOutlineChapterShortTitles,
} from '../src/services/novel/novel-writing.js'

const sample = `
第4章：二叔通匪
【本章时间】穿越第四日
第5章：黑风寨夜袭
第13章：二叔通匪
【本章时间】穿越第十三日
`
const listed = listOutlineChapterShortTitles(sample)
if (listed.length !== 3) throw new Error(`expected 3 titles, got ${listed.length}`)
const dups = findDuplicateOutlineShortTitles(
  '第13章：二叔通匪\n【本章时间】x',
  ['二叔通匪', '黑风寨夜袭'],
)
if (dups.length !== 1 || dups[0]!.title !== '二叔通匪') {
  throw new Error(`expected dup 二叔通匪, got ${JSON.stringify(dups)}`)
}
const clean = findDuplicateOutlineShortTitles('第13章：账房对质\n', ['二叔通匪'])
if (clean.length) throw new Error('clean title should not dup')
console.log('verify-outline-short-title-dedupe OK')
