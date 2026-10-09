/**
 * 章标题根因：【爽型】误写入「第N章：」标题位（括号是表象）
 * npx tsx scripts/verify-chapter-title-parse.ts
 */
import {
  assertOutlineChapterTitles,
  deriveShortChapterTitle,
  matchShuangTypeAsChapterTitle,
  matchTitleParenAnnotation,
  normalizeOutlineChapterTitles,
  reasonIfInvalidChapterTitleRest,
} from '../src/common/novel/novel-outline.js'

function assertEq(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// 根因病例：标题=爽型，括号=场面
const hit = matchShuangTypeAsChapterTitle('硬撕（千骑踏平铁狼寨）')
if (!hit || hit.shuang !== '硬撕' || hit.sceneHint !== '千骑踏平铁狼寨') {
  throw new Error(`shuang-as-title hit mismatch: ${JSON.stringify(hit)}`)
}
if (!matchShuangTypeAsChapterTitle('借力第三方')) {
  throw new Error('bare 爽型 title must match')
}
if (!matchShuangTypeAsChapterTitle('揭穿假账或别的')) {
  throw new Error('爽型+语气词 must match')
}
if (matchShuangTypeAsChapterTitle('铁狼寨千骑')) {
  throw new Error('scene title must not match 爽型')
}

if (!reasonIfInvalidChapterTitleRest('硬撕（千骑踏平铁狼寨）')?.includes('爽型')) {
  throw new Error('gate reason must name 爽型 field mix-up')
}

assertEq(deriveShortChapterTitle('硬撕（千骑踏平铁狼寨）', 7), '千骑踏平铁狼寨', 'promote scene from paren')
assertEq(deriveShortChapterTitle('借力第三方', 6), '第6章', 'bare 爽型 has no scene')

// 根因病例：标题后括号粘了【本章时间】
const timeAnn = matchTitleParenAnnotation('卯时百兵（穿越当日，卯时）')
if (!timeAnn || timeAnn.kind !== 'time' || timeAnn.main !== '卯时百兵') {
  throw new Error(`time annotation mismatch: ${JSON.stringify(timeAnn)}`)
}
if (!reasonIfInvalidChapterTitleRest('卯时百兵（穿越当日，卯时）')?.includes('时间')) {
  throw new Error('gate must name 本章时间 field mix-up')
}
assertEq(deriveShortChapterTitle('卯时百兵（穿越当日，卯时）', 1), '卯时百兵', 'strip time paren')

const outline = `
【分章概要】
第1章：卯时百兵（穿越当日，卯时）
【本章起因】签到得兵
第6章：借力第三方
【本章起因】秦默请来粮商何延年当众作证压二叔
【爽】借粮商之口戳穿空饷
第7章：硬撕（千骑踏平铁狼寨）
【本章起因】陆斩带铁骑压寨
第8章：揭穿假账或别的
【本章起因】当众对读假账册
`
const fixed = normalizeOutlineChapterTitles(outline)
if (!/^第1章：卯时百兵\s*$/m.test(fixed)) {
  throw new Error(`ch1 must drop time paren:\n${fixed}`)
}
if (!/【本章时间】穿越当日，卯时/.test(fixed)) {
  throw new Error(`ch1 must restore 【本章时间】:\n${fixed}`)
}
if (!/^第7章：千骑踏平铁狼寨\s*$/m.test(fixed)) {
  throw new Error(`ch7 must promote scene title:\n${fixed}`)
}
if (/第6章：借力第三方/.test(fixed)) {
  throw new Error(`ch6 must not keep 爽型 as title:\n${fixed}`)
}
if (!/【爽型】借力第三方/.test(fixed)) {
  throw new Error(`ch6 must put 爽型 back on 【爽型】 line:\n${fixed}`)
}
if (!/【爽型】硬撕/.test(fixed)) {
  throw new Error(`ch7 must inject 【爽型】硬撕:\n${fixed}`)
}
if (!/【爽型】揭穿假账/.test(fixed)) {
  throw new Error(`ch8 must inject 【爽型】揭穿假账:\n${fixed}`)
}
const after = assertOutlineChapterTitles(fixed)
if (!after.ok) {
  throw new Error(`normalized outline must pass: ${after.reasons.join('；')}\n${fixed}`)
}

console.log('verify-chapter-title-parse: ok')
