/**
 * 校准语料采集 CLI（离线可用：读 fixtures + 可选站内 episodes）。
 * 产出：workbench-data/ai-detect-samples.json
 *
 * Usage (cwd=workbench-server):
 *   npx tsx scripts/collect-ai-detect-samples.ts
 */
import '../src/db/bootstrap.js'
import * as fs from 'fs'
import * as path from 'path'
import { collectDetectSamples, resolveWorkspace, AI_DETECT_SAMPLES_REL } from '../src/services/ai/ai-detect-store.js'

const out = await collectDetectSamples()
const p = resolveWorkspace(AI_DETECT_SAMPLES_REL)
fs.mkdirSync(path.dirname(p), { recursive: true })
fs.writeFileSync(p, JSON.stringify(out, null, 2), 'utf8')
console.log('samples written', p, out.byLabel, { n: out.samples.length })
process.exit(0)
