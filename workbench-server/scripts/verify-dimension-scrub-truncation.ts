/**
 * 全文达标时剔除「仅截取开篇」误杀；大纲点名来者不判人物空降
 * npx tsx scripts/verify-dimension-scrub-truncation.ts
 */
import {
  parseDimensionAuditReport,
  scrubDimensionAuditFalsePositives,
} from '../src/services/novel/novel-dimension-verdict.js'

const longBody = `${'秦卫国把门推开一拃宽，应付刘干事几句。'.repeat(80)}`
const parsed = {
  passed: false,
  score: 62,
  reason: '本章正文仅截取开篇数句，未构成完整章节，无法验证与上章结尾的衔接',
  dimensions: [
    { dimension: '时间线', status: 'fail', reason: '仅截取开篇数句无法验证', excerpt: '秦卫国把门推开一拃宽' },
    { dimension: '地点', status: 'fail', reason: '上章末地点与本章开篇无过渡', excerpt: '秦卫国把门推开一拃宽' },
    { dimension: '人物', status: 'fail', reason: '刘干事无任何引入铺垫突然出场', excerpt: '应付刘干事几句' },
    { dimension: '场景', status: 'ok', reason: '可推出' },
  ],
}

const report = parseDimensionAuditReport(parsed, longBody)
if (!report || report.failCount < 2) throw new Error('parse 应保留 fail')

const scrubbed = scrubDimensionAuditFalsePositives(
  report,
  longBody,
  '刘干事上门关心，秦卫国周旋',
)
if (!scrubbed) throw new Error('scrub 应返回')
if (scrubbed.dimensions.find(d => d.dimension === '时间线')?.status !== 'ok') {
  throw new Error('截取开篇类时间线 fail 应剔除')
}
if (scrubbed.dimensions.find(d => d.dimension === '人物')?.status !== 'ok') {
  throw new Error('大纲点名来者不应人物空降 fail')
}
if (scrubbed.dimensions.find(d => d.dimension === '地点')?.status !== 'fail') {
  throw new Error('真实场合跳切地点 fail 应保留')
}
if (TRUNC_GUARD(scrubbed.overallReason)) {
  throw new Error(`总因不应仍以截取为主：${scrubbed.overallReason}`)
}

console.log('verify-dimension-scrub-truncation OK', { failCount: scrubbed.failCount })

function TRUNC_GUARD(s: string): boolean {
  return /仅截取|未构成完整/.test(s) && !/跳切|无过渡|场合|地点/.test(s)
}
