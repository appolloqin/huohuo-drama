/**
 * 重建站内模型指纹档案。
 * Run: npx tsx scripts/rebuild-ai-detect-fingerprint.ts
 */
import '../src/db/bootstrap.js'
import { rebuildFingerprintProfile } from '../src/services/ai/ai-detect-model-fingerprint.js'

const out = await rebuildFingerprintProfile()
console.log('fingerprints rebuilt', out)
process.exit(0)
