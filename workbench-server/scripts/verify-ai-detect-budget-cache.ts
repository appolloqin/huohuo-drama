// scripts/verify-ai-detect-budget-cache.ts
import '../src/db/bootstrap.js'
import { pickBudgetTier, resolveBudget, cacheKeyFor } from '../src/services/ai/ai-detect-budget.js'
import { lookupRunCache, recordRun } from '../src/services/ai/ai-detect-store.js'
import { AI_DETECT_ENGINE_VERSION } from '../src/common/novel/novel-detect-calib.js'

if (pickBudgetTier(800) !== 'short') throw new Error('tier short')
if (pickBudgetTier(5000) !== 'standard') throw new Error('tier std')
if (pickBudgetTier(60_000) !== 'long') throw new Error('tier long')
if (resolveBudget('short').maxCandidates !== 0) throw new Error('short: no S2')
if (resolveBudget('short').allowPerturb) throw new Error('short: no perturb')
if (!resolveBudget('standard').allowPerturb) throw new Error('std perturb on')

const key = cacheKeyFor({
  contentHash: 'abc', genre: 'web_fiction', engineVersion: AI_DETECT_ENGINE_VERSION,
  tier: 'standard', refKey: 'echo-m', perturbed: true, profileVersion: 400,
})
if (!key.cacheVariant.includes('t=standard') || !key.cacheVariant.includes('v=echo-m') || !key.cacheVariant.includes('adv=1') || !key.cacheVariant.includes('prof=400')) throw new Error('variant: ' + key.cacheVariant)
const key0 = cacheKeyFor({ contentHash: 'abc', genre: 'web_fiction', engineVersion: AI_DETECT_ENGINE_VERSION, tier: 'short', refKey: 'echo-m', perturbed: false, profileVersion: null })
if (!key0.cacheVariant.endsWith('prof=0')) throw new Error(key0.cacheVariant)

const stored = await recordRun({
  probe: key,
  result: { probability: 55, verdict: 'mixed', confidence: 'medium', method: 'fusion_v2', content_hash: 'abc', perplexity_model: 'echo-m', needs_review: true, calibration: 'calibrated', engine_version: AI_DETECT_ENGINE_VERSION, segments: [], elapsed_ms: 12 } as never,
  userId: 1, sourceType: 'text', charCount: 1234,
})
if (!stored) throw new Error('store failed (provision? run bootstrap with DB_AUTO_INIT)')
const hit = await lookupRunCache(key)
if (!hit || hit.row?.probability !== 55) throw new Error('cache miss')
if (JSON.parse(hit.row.resultJson!).method !== 'fusion_v2') throw new Error('result roundtrip')
const hit2 = await lookupRunCache(key)
if (!hit2 || hit2.row.cacheHit < 1) throw new Error('bump counter')
const miss = await lookupRunCache({ ...key, cacheVariant: key.cacheVariant.replace('adv=1', 'adv=0') })
if (miss) throw new Error('variant leakage')
console.log('verify-ai-detect-budget-cache OK')
process.exit(0)
