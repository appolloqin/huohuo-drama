/**
 * S3 站内轻量指纹（design §5.5）：
 * 由 episodes.metadata.ai_detection.writing_model 聚合站内各模型输出统计特征，
 * 与待测文本对照。只输出「接近站内 xx 模型输出」证据，不宣称识别外部来源模型。
 * profile 存 app_settings(ai_detect_fingerprints)。
 */
import { getAppSetting, upsertAppSetting } from '../../db/repos/app-settings/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { APP_SETTING_KEYS } from '../../common/novel/novel-detect-calib.js'
import { extractRawFeatures, topBigrams, type RawFeatures } from './ai-detect-features.js'
import { parseEpisodeMetadata } from '../../common/drama/episode-meta.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import { now } from '../../common/http/response.js'

export type FpHit = { model: string; sim: number }
export type FpBuildSummary = { models: Array<{ model: string; samples: number }>; total: number }
type FpProfile = {
  version: number
  updated_at: string
  min_samples: number
  models: Record<string, { samples: number; avg: Partial<Record<keyof RawFeatures, number>>; top_bigrams: string[] }>
}

const FP_KEYS = [
  'sentence_len_cv', 'para_len_cv', 'char_ttr', 'bigram_repeat', 'trigram_repeat',
  'punct_density', 'dash_density', 'quote_density', 'syntactic_template_index', 'colloquial_density',
] as const
type FpKey = (typeof FP_KEYS)[number]
const FP_SCALE: Record<FpKey, number> = {
  sentence_len_cv: 0.5, para_len_cv: 0.6, char_ttr: 0.2, bigram_repeat: 0.2, trigram_repeat: 0.15,
  punct_density: 0.1, dash_density: 0.01, quote_density: 0.03, syntactic_template_index: 0.3, colloquial_density: 0.02,
}

let memo: { raw: string | null; at: number; profile: FpProfile | null } | null = null
const MEMO_MS = 60_000
export function resetFpCacheForTest() { memo = null }

async function loadFp(): Promise<FpProfile | null> {
  let raw: string | null = null
  try { raw = (await getAppSetting(APP_SETTING_KEYS.fingerprints))?.value ?? null } catch { return null }
  if (memo && memo.raw === raw && Date.now() - memo.at < MEMO_MS) return memo.profile
  let profile: FpProfile | null = null
  if (raw) {
    try { profile = JSON.parse(raw) as FpProfile } catch { profile = null }
    if (!(profile && profile.models && typeof profile.min_samples === 'number')) profile = null
  }
  memo = { raw, at: Date.now(), profile }
  return profile
}

export async function fingerprintEvidence(text: string): Promise<FpHit | null> {
  const p = await loadFp()
  if (!p || countNovelChars(text) < 300) return null
  const raws = extractRawFeatures(text)
  const grams = new Set(topBigrams(text, 300).map((g) => g[0]))
  if (grams.size < 30) return null
  let best: FpHit | null = null
  for (const [model, m] of Object.entries(p.models)) {
    if (!m || (m.samples ?? 0) < p.min_samples) continue
    let feat = 0
    let used = 0
    for (const k of FP_KEYS) {
      const avg = m.avg?.[k]
      const val = raws[k] as number | undefined
      if (avg == null || val == null || !Number.isFinite(avg) || !Number.isFinite(val)) continue
      used++
      const d = Math.abs(val - avg) / (FP_SCALE[k] || 1)
      feat += Math.max(0, 1 - Math.min(1, d))
    }
    if (!used) continue
    const gramsM = new Set(m.top_bigrams || [])
    let inter = 0
    for (const g of grams) if (gramsM.has(g)) inter++
    const overlap = gramsM.size ? inter / Math.max(1, Math.floor(gramsM.size * 0.6)) : 0
    const sim = Math.min(1, Math.max(0, (0.55 * (feat / used)) + (0.45 * Math.min(1, overlap))))
    if (!best || sim > best.sim) best = { model, sim: Math.round(sim * 1000) / 1000 }
  }
  return best && best.sim >= 0.55 ? best : null
}

export async function rebuildFingerprintProfile(opts?: { limitEpisodes?: number }): Promise<FpBuildSummary> {
  const limit = opts?.limitEpisodes ?? 600
  const rows = await episodesRepo.listEpisodesForAiDetect(limit)
  const per = new Map<string, { feats: RawFeatures[]; grams: Map<string, number> }>()
  for (const row of rows) {
    let wm: string | undefined
    try {
      const meta = parseEpisodeMetadata(row.metadata)
      wm = meta.ai_detection?.writing_model?.trim()
    } catch { /* skip */ }
    if (!wm) continue
    const text = (row.content || '').slice(0, 6000)
    if (countNovelChars(text) < 1200) continue
    const e = per.get(wm) || { feats: [] as RawFeatures[], grams: new Map<string, number>() }
    e.feats.push(extractRawFeatures(text))
    for (const [g, c] of topBigrams(text, 200)) e.grams.set(g, (e.grams.get(g) || 0) + c)
    per.set(wm, e)
  }
  const models: FpProfile['models'] = {}
  let total = 0
  for (const [model, e] of per) {
    if (e.feats.length < 3) continue
    const avg: Record<string, number> = {}
    for (const k of FP_KEYS) {
      const vals = e.feats.map((f) => (f as Record<string, number>)[k]).filter(Number.isFinite)
      avg[k] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000 : 0
    }
    const top = [...e.grams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map((x) => x[0])
    models[model] = { samples: e.feats.length, avg, top_bigrams: top }
    total += e.feats.length
  }
  const profile: FpProfile = {
    version: Date.now(),
    updated_at: new Date().toISOString(),
    min_samples: 3,
    models,
  }
  if (!Object.keys(models).length) {
    logTaskWarn('AiDetect', 'fingerprint-build-empty', { episodes: rows.length })
    return { models: [], total: 0 }
  }
  await upsertAppSetting(APP_SETTING_KEYS.fingerprints, JSON.stringify(profile), now())
  resetFpCacheForTest()
  return { models: Object.entries(models).map(([model, v]) => ({ model, samples: v.samples })), total }
}
