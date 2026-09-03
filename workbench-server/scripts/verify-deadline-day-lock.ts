/**
 * 主期限天数锁定：首立1日不得无说明改成3日
 * npx tsx scripts/verify-deadline-day-lock.ts
 */
import { lockDeadlineDayConsistency } from '../src/common/novel/novel-deadline-day-lock.js'
import { stripIntraChapterNearDuplicate } from '../src/services/novel/novel-intra-chapter-dedupe.js'
import { WEBNOVEL_DEADLINE_CLOCK_GUIDE } from '../src/agents/webnovel-prose-style.js'

if (!WEBNOVEL_DEADLINE_CLOCK_GUIDE.includes('分拍分工')) {
  throw new Error('deadline guide must state 分拍分工')
}
if (!WEBNOVEL_DEADLINE_CLOCK_GUIDE.includes('急拍≠重立约')) {
  throw new Error('deadline guide must ban 急拍重立约')
}
if (!WEBNOVEL_DEADLINE_CLOCK_GUIDE.includes('首立几天就锁几天')) {
  throw new Error('deadline guide must lock primary day count')
}

const sample = [
  '“三百两白银，再加一具游煞骸骨，1日之内交到尸傀门清河值房。”',
  '',
  '钱虎伸出手指：“3日之内，你亲手斩一头游煞。斩不了，明日卯时一过，我去镇魔司补卷。”',
  '',
  '秦卫东猛一挡到秦霄身前：“3日期限，卯时起算，是也不是？”',
  '',
  '钱虎哼声：“3日，3日之后我亲自来收尸。”',
].join('\n')

const { text, removed, primaryDays } = lockDeadlineDayConsistency(sample)
if (!removed) throw new Error('expected day lock rewrite')
if (primaryDays !== 1) throw new Error(`primaryDays expected 1, got ${primaryDays}`)
if (/3日之内|3日期限/.test(text)) {
  throw new Error(`3日 deadline left:\n${text}`)
}
if (!text.includes('1日之内') || !text.includes('1日期限')) {
  throw new Error(`should rewrite to 1日:\n${text}`)
}
// 过去时「3日前」不应被当期限
const past = '秦卫东道：“我侄儿3日前去了乱葬岗。”钱虎说：“1日之内交来。”后又说：“3日之内斩游煞。”'
const pastOut = lockDeadlineDayConsistency(past)
if (/3日前/.test(pastOut.text) === false) throw new Error('must keep 3日前')
if (/3日之内/.test(pastOut.text)) throw new Error(`past sample still has 3日之内:\n${pastOut.text}`)

const via = stripIntraChapterNearDuplicate(sample).text
if (/3日之内|3日期限/.test(via)) throw new Error(`dedupe path left 3日:\n${via}`)

const changeOk = [
  '“1日之内交来。”',
  '钱虎改口：“改限为3日之内，再给你两天。”',
].join('\n')
const keepChange = lockDeadlineDayConsistency(changeOk)
if (!keepChange.text.includes('3日之内')) {
  throw new Error(`explicit 改限 must keep 3日:\n${keepChange.text}`)
}

console.log('verify-deadline-day-lock OK', { primaryDays })
