/**
 * 局部重生成：保留前序分章
 * Run: npx tsx scripts/verify-outline-keep-before-chapter.ts
 */
import { keepOutlineBeforeChapter } from '../src/common/novel/novel-outline.js'

const sample = `【世界观设定】
x

【分卷设计】
- 第一卷｜第1～10章：黑风岭
- 第二卷｜第11～20章：北境

【分章概要】
第4章：二叔通匪
【本章时间】穿越第四日
【信息增量】通匪败露

第5章：黑风寨夜袭
【本章时间】穿越第五日

第11章：筒车引水
【本章时间】穿越第十一日

第13章：二叔通匪
【本章时间】穿越第十三日
`

const kept = keepOutlineBeforeChapter(sample, 11)
if (!kept.includes('第4章：二叔通匪')) throw new Error('must keep ch4')
if (!kept.includes('第5章：黑风寨夜袭')) throw new Error('must keep ch5')
if (kept.includes('第11章')) throw new Error('must drop from ch11')
if (kept.includes('第13章')) throw new Error('must drop ch13')
if (!kept.includes('【分卷设计】')) throw new Error('must keep volume design')

const empty = keepOutlineBeforeChapter(sample, 1)
if (empty) throw new Error('from=1 should return empty (full regen)')

console.log('verify-outline-keep-before-chapter OK')
