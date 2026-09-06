/**
 * 方向性/护栏闸门（离线、零外服）：
 * - fixtures 空 → SKIP exit 0
 * - 小语料（<10）→ 只断言 seed 方向性（AI 均分 > 人写均分）+ 护栏常量，不卡 FPR/召回
 * - 较大语料 → 放宽离线阈值 humanFpr≤15% / aiRecall≥60%
 * Run: npx tsx scripts/verify-ai-detect-calib-fixture.ts
 */
import '../src/db/bootstrap.js'
import * as fs from 'fs'
import * as path from 'path'
import { runAiDetect } from '../src/services/ai/ai-detect-engine.js'
import {
  CALIB_MAX_HUMAN_FPR,
  CALIB_MIN_AI_RECALL,
  VERDICT_AI_THRESHOLD,
  VERDICT_MIXED_THRESHOLD,
} from '../src/common/novel/novel-detect-calib.js'

const OFFLINE_MAX_HUMAN_FPR = 0.15
const OFFLINE_MIN_AI_RECALL = 0.6
const SMALL_CORPUS = 10

const root = path.resolve('fixtures')
const load = (dir: string) => {
  const p = path.join(root, dir)
  if (!fs.existsSync(p)) return [] as string[]
  return fs.readdirSync(p)
    .filter((f) => f.endsWith('.txt') && f !== 'README.md')
    .map((f) => fs.readFileSync(path.join(p, f), 'utf8'))
}

if (CALIB_MAX_HUMAN_FPR !== 0.1 || CALIB_MIN_AI_RECALL !== 0.8) {
  throw new Error('online guardrail constants drifted')
}
if (VERDICT_AI_THRESHOLD !== 65 || VERDICT_MIXED_THRESHOLD !== 40) {
  throw new Error('verdict thresholds drifted')
}

const humans = load('human')
const ais = load('ai')
if (!humans.length || !ais.length) {
  console.log('verify-ai-detect-calib-fixture SKIP (fixtures empty)')
  console.log('guardrail constants OK', { CALIB_MAX_HUMAN_FPR, CALIB_MIN_AI_RECALL })
  process.exit(0)
}

const scorer = async () => { throw new Error('offline') }
const humanProbs: number[] = []
const aiProbs: number[] = []
let humanBad = 0
let aiLow = 0

for (const t of humans) {
  const r = await runAiDetect(t, {
    genre: 'web_fiction',
    skipCacheStore: true,
    enableAdversarial: false,
    referenceScorer: scorer,
  })
  humanProbs.push(r.probability)
  if (r.verdict === 'likely_ai') humanBad++
}
for (const t of ais) {
  const r = await runAiDetect(t, {
    genre: 'web_fiction',
    skipCacheStore: true,
    enableAdversarial: false,
    referenceScorer: scorer,
  })
  aiProbs.push(r.probability)
  if (r.probability < VERDICT_MIXED_THRESHOLD) aiLow++
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const humanMean = mean(humanProbs)
const aiMean = mean(aiProbs)
const humanFpr = humanBad / humans.length
const aiRecall = 1 - aiLow / ais.length
const n = humans.length + ais.length

console.log({
  humanMean,
  aiMean,
  humanFpr,
  aiRecall,
  humans: humans.length,
  ais: ais.length,
  mode: n < SMALL_CORPUS ? 'directionality' : 'offline-fpr-recall',
})

if (!(aiMean > humanMean)) {
  throw new Error(`seed 方向错：AI 均分 ${aiMean} 应 > 人写均分 ${humanMean}`)
}

if (n >= SMALL_CORPUS) {
  if (humanFpr > OFFLINE_MAX_HUMAN_FPR) {
    throw new Error(`人类误报 ${humanFpr} 超 ${OFFLINE_MAX_HUMAN_FPR * 100}%`)
  }
  if (aiRecall < OFFLINE_MIN_AI_RECALL) {
    throw new Error(`离线统计召回 ${aiRecall} < ${OFFLINE_MIN_AI_RECALL * 100}%`)
  }
} else {
  console.log('small corpus: skipped FPR/recall hard gates; directionality + constants only')
}

console.log('verify-ai-detect-calib-fixture OK')
process.exit(0)
