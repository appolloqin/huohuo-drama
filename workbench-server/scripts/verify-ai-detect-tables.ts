import '../src/db/bootstrap.js'
import { isMysqlDriver } from '../src/db/driver.js'
import * as runsRepo from '../src/db/repos/ai-detect-runs/index.js'
import * as fbRepo from '../src/db/repos/ai-detect-feedback/index.js'

const now = new Date().toISOString()
const future = new Date(Date.now() + 60_000).toISOString()
const key = { contentHash: 'h_tbl_test', genre: 'web_fiction', engineVersion: 'fusion_v2.0', cacheVariant: 'short|qwen-test@99|adv0' }
const id = await runsRepo.upsertRun({
  ...key, userId: null, sourceType: 'text', charCount: 123, probability: 55, verdict: 'mixed',
  confidence: 'medium', method: 'fusion_v2', resultJson: '{"ok":true}', modelRef: 'qwen-test@99',
  uncalibrated: 1, needsReview: 1, perturbScore: null, expiresAt: future, createdAt: now,
})
if (!Number.isFinite(id)) throw new Error('upsert id')
const hit = await runsRepo.findCacheableRun(key)
if (!hit || hit.id !== id) throw new Error('cache readback')
if (hit.resultJson !== '{"ok":true}') throw new Error('result json roundtrip')
await runsRepo.bumpCacheHit(id)
const hit2 = await runsRepo.findCacheableRun(key)
if (hit2!.cacheHit !== 1) throw new Error(`cache_hit should be 1, got ${hit2!.cacheHit}`)
// 过期行不命中
await runsRepo.upsertRun({ ...key, cacheVariant: 'x', userId: null, sourceType: 'text', charCount: 1,
  probability: 1, verdict: 'mixed', confidence: 'low', method: 'fusion_v2', resultJson: null,
  modelRef: null, uncalibrated: 0, needsReview: 0, perturbScore: null, expiresAt: '2020-01-01T00:00:00.000Z', createdAt: now })
const stale = await runsRepo.findCacheableRun({ ...key, cacheVariant: 'x' })
if (stale) throw new Error('expired row must not be returned')

const fbId = await fbRepo.insertFeedback({
  runId: id, contentHash: 'h_tbl_test', userId: null, sourceType: 'text', declaredLabel: 'human',
  adminLabel: null, consentStore: 1, note: 't', excerpt: 'abc', genre: 'web_fiction', createdAt: now,
})
await fbRepo.setAdminLabel(fbId, 'ai')
const [row] = await fbRepo.listTrainableFeedback()
if (!row || row.contentHash !== 'h_tbl_test' || row.adminLabel !== 'ai') throw new Error('feedback roundtrip')
if (id > 0 && fbId > 0) { /* driver ok */ }
console.log('verify-ai-detect-tables OK', { driver: isMysqlDriver() ? 'mysql' : 'sqlite' })
process.exit(0)
