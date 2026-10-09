/**
 * 无变化【变更记录】须可被 parseChangeRecord 解析；有变化时禁止「见正文」空壳
 * Run: npx tsx scripts/verify-change-record-fallback.ts
 */
import {
  buildFallbackChangeRecord,
  hasValidChangeRecord,
  isStubChangeRecord,
  runCausalChainAudit,
} from '../src/services/novel/novel-causal-chain/index.js'
import { parseChangeRecord } from '../src/services/novel/novel-causal-chain/causal-chain-parser.js'
import { normalizeChangeRecordArtifacts } from '../src/common/novel/novel-change-record.js'

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

// 有实质变化：程序化 fallback 必须为空（禁止见正文 stub）
const changed = '秦默掌心令牌吐兵，三百刀盾手列阵于府前。他签到得兵，又收走账本。'
const changedFb = buildFallbackChangeRecord(changed, 1)
if (changedFb.trim()) {
  throw new Error('changed prose must not get programmatic stub fallback')
}

const stub = `【变更记录】
- 场景/状态: （见正文本章变化）
  因果: 本章场景、人物状态或情节转折已在正文完整叙述，此处汇总为因果链索引
  触发: 见正文关键事件
- 人物: （见正文）
  因果: 人物心理或处境变化随正文事件推进，与上章因果起点衔接`
if (!isStubChangeRecord(stub)) throw new Error('stub detector must flag 见正文')
if (hasValidChangeRecord(`${changed}\n\n${stub}`)) {
  throw new Error('stub change record must not pass hasValidChangeRecord')
}

// 行中粘连 stub 须被 normalize 剥离出正文
const glued = `${changed.slice(0, 40)}。”孙满仓瘫在门槛边。”${stub.replace(/\n/g, '')}`
const n = normalizeChangeRecordArtifacts(glued)
if (n.prose.includes('【变更记录】') || n.prose.includes('见正文')) {
  throw new Error(`mid-line stub must leave prose: ${n.prose.slice(-120)}`)
}
if (n.changeBlock && isStubChangeRecord(n.changeBlock) && hasValidChangeRecord(n.changeBlock)) {
  throw new Error('normalized stub block must not be treated as valid')
}

console.log('verify-change-record-fallback OK')
