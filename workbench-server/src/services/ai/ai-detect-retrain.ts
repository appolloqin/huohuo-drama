/** 重训编排（spec §5.9）：samples.json → 向量 → 两折 CV → 护栏 → saveProfileWithRotate */
import * as fs from 'fs'
import { extractRawFeatures } from './ai-detect-features.js'
import {
  saveProfileWithRotate, rollbackCalibProfile, readRawCalibProfile,
  buildPercentilesFromRaw, featureVectorOf, type CalibProfile,
} from './ai-detect-calibration.js'
import { resolveWorkspace, AI_DETECT_SAMPLES_REL, feedbackRepo } from './ai-detect-store.js'
import { getAppSetting } from '../../db/repos/app-settings/index.js'
import { APP_SETTING_KEYS, AI_DETECT_ENGINE_VERSION, type Genre } from '../../common/novel/novel-detect-calib.js'
import { logisticTrain, passesGuardrail, twoFoldMetrics, type TrainSample } from '../../common/novel/novel-detect-train.js'

export type RetrainSummary = {
  ok: boolean
  reason?: string
  version?: number
  metrics?: { fpr: number; recall: number }
}

export async function retrainFromSamplesFile(opts?: { genre?: Genre }): Promise<RetrainSummary> {
  const genre = opts?.genre ?? 'web_fiction'
  const samplesPath = process.env.AI_DETECT_SAMPLES_PATH || resolveWorkspace(AI_DETECT_SAMPLES_REL)
  if (!fs.existsSync(samplesPath)) {
    return { ok: false, reason: '语料不存在：先运行 npm run ai-detect:collect-samples / collect-ai-detect-samples.ts' }
  }
  const parsed = JSON.parse(fs.readFileSync(samplesPath, 'utf8')) as {
    samples?: Array<{ label: string; text: string; genre?: string }>
  }
  const rows = (parsed.samples || []).filter(
    (s) => (s.label === 'human' || s.label === 'ai')
      && (s.genre ?? 'web_fiction') === genre
      && s.text
      && s.text.length >= 80,
  )
  if (rows.length < 80) return { ok: false, reason: `样本过少(${rows.length})（两类合计需 ≥80）` }

  const rawsAll = rows.map((s) => extractRawFeatures(s.text))
  const table = buildPercentilesFromRaw(rawsAll)
  const samples: TrainSample[] = rows.map((s, i) => ({
    x: featureVectorOf(rawsAll[i]!, table),
    y: s.label === 'ai' ? 1 : 0,
    label: s.label as 'human' | 'ai',
    genre,
  }))
  const cv = twoFoldMetrics(samples)
  const guard = passesGuardrail({
    metrics: { fpr: cv.fpr, recall: cv.recall, minOk: true },
    minPerClass: 40,
    counts: {
      human: samples.filter((s) => s.y === 0).length,
      ai: samples.filter((s) => s.y === 1).length,
    },
  })
  if (!guard.ok) return { ok: false, reason: guard.reason || `护栏未通过 fpr=${cv.fpr} recall=${cv.recall}` }

  const model = logisticTrain(samples)
  const prior = await readRawCalibProfile()
  const next: CalibProfile = {
    ...(prior ?? {}),
    stat_submodel: { w: model.w, b: model.b },
    percentiles: { ...(prior?.percentiles ?? {}), [genre]: table },
    metrics: { fpr: cv.fpr, recall: cv.recall, train: 's1_only' },
  }
  const saved = await saveProfileWithRotate(next)
  return { ok: true, version: saved.to, metrics: { fpr: cv.fpr, recall: cv.recall } }
}

export async function rollbackProfile() {
  return rollbackCalibProfile()
}

export async function getCalibrationStatus(): Promise<{
  engine_version: string
  calibrated: boolean
  profile_version: number | null
  metrics: CalibProfile['metrics']
  fingerprints: { models: Array<{ model: string; samples: number }> } | null
  samples_file: { exists: boolean; mtime: string | null; generated_at: string | null }
  pending_feedback_count: number
}> {
  const raw = await readRawCalibProfile()
  let fingerprints: { models: Array<{ model: string; samples: number }> } | null = null
  try {
    const fpRow = await getAppSetting(APP_SETTING_KEYS.fingerprints)
    if (fpRow?.value) {
      const parsed = JSON.parse(fpRow.value) as {
        models?: Record<string, { samples?: number }>
      }
      if (parsed.models) {
        fingerprints = {
          models: Object.entries(parsed.models).map(([model, v]) => ({
            model,
            samples: Number(v?.samples) || 0,
          })),
        }
      }
    }
  } catch { /* ignore */ }

  const samplesPath = resolveWorkspace(AI_DETECT_SAMPLES_REL)
  let mtime: string | null = null
  let generatedAt: string | null = null
  const exists = fs.existsSync(samplesPath)
  if (exists) {
    try {
      mtime = fs.statSync(samplesPath).mtime.toISOString()
      const doc = JSON.parse(fs.readFileSync(samplesPath, 'utf8')) as { generated_at?: string }
      generatedAt = typeof doc.generated_at === 'string' ? doc.generated_at : null
    } catch { /* ignore */ }
  }

  let pending = 0
  try { pending = await feedbackRepo.countPendingReview() } catch { pending = 0 }

  return {
    engine_version: AI_DETECT_ENGINE_VERSION,
    calibrated: !!(raw?.stat_submodel || raw?.fusion),
    profile_version: raw?.version ?? null,
    metrics: raw?.metrics,
    fingerprints,
    samples_file: { exists, mtime, generated_at: generatedAt },
    pending_feedback_count: pending,
  }
}
