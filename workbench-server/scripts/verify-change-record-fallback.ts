/**
 * 无变化【变更记录】须可被 parseChangeRecord 解析，否则硬审仍报 missing_record
 * Run: npx tsx scripts/verify-change-record-fallback.ts
 */
import {
  buildFallbackChangeRecord,
  hasValidChangeRecord,
  runCausalChainAudit,
} from '../src/services/novel/novel-causal-chain/index.js'
import { parseChangeRecord } from '../src/services/novel/novel-causal-chain/causal-chain-parser.js'

const prose = '秦卫国坐在炕沿上搓麻绳，手指翻飞。'
const fallback = buildFallbackChangeRecord(prose, 10)
const entries = parseChangeRecord(fallback)
if (!entries.length) throw new Error(`fallback not parseable:\n${fallback}`)
if (!hasValidChangeRecord(`${prose}\n\n${fallback}`)) {
  throw new Error('hasValidChangeRecord failed on fallback')
}

const audit = runCausalChainAudit({ content: `${prose}\n\n${fallback}`, chapterNumber: 10 })
if (!audit.passed) {
  throw new Error(`audit should pass with fallback, hard=${audit.hard.map(h => h.rule).join(',')}`)
}

// 旧格式也应兼容
const legacy = `【变更记录】
- （无状态变化，因果起点延续）
  因果: 本章未发生场景/时间/人物状态/伤势/物品变更`
if (!hasValidChangeRecord(`${prose}\n\n${legacy}`)) {
  throw new Error('legacy no-change bullet must parse')
}

const missing = runCausalChainAudit({ content: prose, chapterNumber: 10 })
if (missing.passed || !missing.hard.some(h => h.rule === 'causal_missing_record')) {
  throw new Error('bare prose must hard-fail missing_record')
}

console.log('verify-change-record-fallback OK')
