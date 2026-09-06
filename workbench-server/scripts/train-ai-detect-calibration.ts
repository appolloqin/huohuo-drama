/**
 * 离线校准训练（spec §5.9；G6 交付件）。
 * 输入：workbench-data/ai-detect-samples.json（collect 产物）
 * Flags：--samples <path>；--export-profile（默认 dry-run 只打印指标）；--offline（跳过 ppl_tracks）
 *
 * 护栏未通过时非零退出（空库/样本不足属预期）。
 */
import '../src/db/bootstrap.js'
import * as fs from 'fs'
import { extractRawFeatures } from '../src/services/ai/ai-detect-features.js'
import {
  saveProfileWithRotate, buildPercentilesFromRaw, featureVectorOf, readRawCalibProfile,
  type CalibProfile,
} from '../src/services/ai/ai-detect-calibration.js'
import { resolveWorkspace, AI_DETECT_SAMPLES_REL } from '../src/services/ai/ai-detect-store.js'
import {
  buildPplTracks, twoFoldMetrics, logisticTrain, passesGuardrail,
  type TrainSample,
} from '../src/common/novel/novel-detect-train.js'

const argv = process.argv.slice(2)
const samplesPath = argv.includes('--samples')
  ? argv[argv.indexOf('--samples') + 1]!
  : resolveWorkspace(AI_DETECT_SAMPLES_REL)
const exportProfile = argv.includes('--export-profile')
const offline = argv.includes('--offline')

type RawSample = {
  label: string
  genre?: string
  text: string
  model?: string
  pplByModel?: Record<string, { echo?: number; proxy?: number }>
}
if (!fs.existsSync(samplesPath)) {
  console.error('语料不存在：先运行 npx tsx scripts/collect-ai-detect-samples.ts')
  process.exit(1)
}
const doc = JSON.parse(fs.readFileSync(samplesPath, 'utf8')) as { samples?: RawSample[] }
const rows = (doc.samples || []).filter(
  (s) => (s.label === 'human' || s.label === 'ai') && typeof s.text === 'string' && s.text.length >= 80,
)
if (!rows.length) {
  console.error('无有效样本')
  process.exit(1)
}

const rawsAll = rows.map((s) => extractRawFeatures(s.text))
const percentiles = buildPercentilesFromRaw(rawsAll)
const samples: TrainSample[] = rows.map((s, i) => ({
  x: featureVectorOf(rawsAll[i]!, percentiles),
  y: s.label === 'ai' ? 1 : 0,
  label: s.label as 'human' | 'ai',
  genre: s.genre || 'web_fiction',
}))
const byGenre = new Map<string, TrainSample[]>()
for (const s of samples) {
  const arr = byGenre.get(s.genre) || []
  arr.push(s)
  byGenre.set(s.genre, arr)
}

type GenreEval = { genre: string; n: number; fpr: number; recall: number; ok: boolean; reason?: string }
const evals: GenreEval[] = [...byGenre.entries()].map(([g, list]) => {
  const cv = twoFoldMetrics(list)
  const guard = passesGuardrail({
    metrics: { fpr: cv.fpr, recall: cv.recall, minOk: true },
    minPerClass: 40,
    counts: {
      human: list.filter((s) => s.y === 0).length,
      ai: list.filter((s) => s.y === 1).length,
    },
  })
  return {
    genre: g,
    n: list.length,
    fpr: +cv.fpr.toFixed(4),
    recall: +cv.recall.toFixed(4),
    ok: guard.ok,
    reason: guard.reason,
  }
})
for (const e of evals) {
  console.log(`${e.genre}: n=${e.n} fpr=${e.fpr} recall=${e.recall} guard=${e.ok}${e.reason ? ` (${e.reason})` : ''}`)
}
if (evals.some((e) => !e.ok)) {
  console.error('护栏未通过，不落库（fixtures 不足时属预期；需扩语料后重跑）')
  process.exit(1)
}

const statSubModel = logisticTrain(samples)
const pplTracks = offline
  ? {}
  : buildPplTracks(rows.flatMap((s) => Object.entries(s.pplByModel || {}).flatMap(([m, v]) => {
    const out: Array<{ ppl: number; refModel: string; mode: 'echo' | 'proxy' }> = []
    if (typeof v.echo === 'number') out.push({ ppl: v.echo, refModel: m, mode: 'echo' })
    if (typeof v.proxy === 'number') out.push({ ppl: v.proxy, refModel: m, mode: 'proxy' })
    return out
  })))

const prior = await readRawCalibProfile()
const profile: CalibProfile = {
  ...(prior ?? {}),
  version: 0,
  percentiles: { ...(prior?.percentiles ?? {}), web_fiction: percentiles },
  stat_submodel: statSubModel,
  ppl_tracks: Object.keys(pplTracks).length ? pplTracks : prior?.ppl_tracks,
  metrics: {
    fpr: Math.max(...evals.map((e) => e.fpr)),
    recall: Math.min(...evals.map((e) => e.recall)),
    train: 's1_only',
  },
  fusion: prior?.fusion,
}
if (exportProfile) {
  const saved = await saveProfileWithRotate(profile)
  console.log('profile saved, version=', saved.to)
} else {
  console.log('dry-run ok', { dims: samples[0]!.x.length, evals })
}
