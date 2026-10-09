/**
 * 变更记录与正文分离：ensure 不得把块拼回 prose
 * npx tsx scripts/verify-change-record-separated.ts
 */
import {
  buildFallbackChangeRecord,
  ensureCausalChangeRecordAppended,
  hasValidChangeRecord,
} from '../src/services/novel/novel-causal-chain/ensure-causal-change-record.js'
import { resolveFullChapterForAudit } from '../src/services/novel/novel-causal-chain/causal-chain-parser.js'

const prose = '秦卫国坐在炕沿上搓麻绳，手指翻飞。风从窗缝进来。'
const fallback = buildFallbackChangeRecord(prose, 3)
if (!hasValidChangeRecord(fallback)) throw new Error('fallback block alone must be valid')

const ensured = await ensureCausalChangeRecordAppended({
  content: `${prose}\n\n${fallback}`,
  chapterNumber: 3,
  force: false,
})
if (ensured.prose.includes('【变更记录】') || ensured.prose.includes('因果:')) {
  throw new Error(`prose must not carry change record: ${ensured.prose.slice(-80)}`)
}
if (!ensured.changeBlock || !hasValidChangeRecord(ensured.changeBlock)) {
  throw new Error('changeBlock must be valid separately')
}
if (!ensured.prose.includes('搓麻绳')) throw new Error('prose kept')

const audit = resolveFullChapterForAudit(ensured.prose, ensured.changeBlock)
if (!audit.includes('【变更记录】') || !audit.includes('搓麻绳')) {
  throw new Error('audit merge only for check')
}
if (ensured.auditContent.includes('【变更记录】') && ensured.prose.includes('【变更记录】')) {
  throw new Error('auditContent may merge; prose must not')
}

// 裸子字段粘正文须离开 prose（不调 LLM：附合法块 + force:false）
const dirty = [
  prose,
  '  感知: 袍袖磨边',
  '  耗时: 片刻',
  '',
  fallback,
].join('\n')
const peeled = await ensureCausalChangeRecordAppended({
  content: dirty,
  chapterNumber: 3,
  force: false,
})
if (/感知:\s*袍袖|耗时:\s*片刻/.test(peeled.prose)) {
  throw new Error(`orphan subfields must leave prose: ${peeled.prose}`)
}
if (peeled.prose.includes('【变更记录】')) {
  throw new Error('header must not remain in prose')
}

console.log('verify-change-record-separated OK', {
  proseLen: [...ensured.prose].length,
  hasBlock: !!ensured.changeBlock,
})
