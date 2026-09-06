// src/services/ai/ai-detect-calibration.ts（Task 4.1 会续加档案加载函数，本文件本任务只到下方为止）
/** 分位点表与 z 标准化。seed 表覆盖"无训练档案"冷启动；训练后 app_settings 档案整体替换（Task 4.1）。 */
import type { Genre } from '../../common/novel/novel-detect-calib.js'
import {
  APP_SETTING_KEYS, AI_DETECT_ENGINE_VERSION, FUSION_FEATURE_KEYS, AI_DETECT_GENRES,
} from '../../common/novel/novel-detect-calib.js'
import { getAppSetting, upsertAppSetting } from '../../db/repos/app-settings/index.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import { now } from '../../common/http/response.js'
import type { RawFeatures } from './ai-detect-features.js'
import { seedFusionWeights as defaultSeedWeights } from './ai-evidence-rules.js'

export type PercentileKey = Exclude<keyof RawFeatures, 'char_count'>
/** 每个 key 一个升序数组（p05,p10,…,p95；seed 至少 5 个点即可） */
export type PercentileTable = Partial<Record<PercentileKey, number[]>>

export const DEFAULT_PERCENTILE_TABLES: Record<Genre, PercentileTable> = {
  web_fiction: {
    sentence_len_cv: [0.22, 0.32, 0.42, 0.55, 0.7, 0.9],
    para_len_cv: [0.3, 0.42, 0.55, 0.7, 0.9, 1.2],
    char_ttr: [0.2, 0.28, 0.34, 0.4, 0.48, 0.58],
    char_entropy: [7.6, 8.3, 8.9, 9.4, 9.9, 10.4],
    bigram_repeat: [0.05, 0.09, 0.14, 0.2, 0.28, 0.4],
    trigram_repeat: [0.02, 0.05, 0.08, 0.12, 0.18, 0.26],
    punct_density: [0.05, 0.08, 0.11, 0.14, 0.18, 0.24],
    dash_density: [0.0, 0.001, 0.003, 0.006, 0.012, 0.02],
    quote_density: [0.0, 0.004, 0.01, 0.018, 0.03, 0.05],
    opening_pattern_entropy: [3.2, 4.0, 4.7, 5.3, 5.9, 6.4],
    syntactic_template_index: [0.1, 0.16, 0.22, 0.3, 0.4, 0.55],
    dialogue_len_cv: [0.3, 0.45, 0.6, 0.75, 0.95, 1.2],
    tag_variety: [0.3, 0.5, 0.65, 0.8, 1.0, 1.3],
    tells_density: [0.0, 0.001, 0.0025, 0.005, 0.009, 0.016],
    colloquial_density: [0.0, 0.002, 0.005, 0.009, 0.015, 0.026],
  },
  official: {
    sentence_len_cv: [0.18, 0.26, 0.35, 0.46, 0.6, 0.8], para_len_cv: [0.25, 0.35, 0.48, 0.62, 0.85, 1.1],
    char_ttr: [0.18, 0.25, 0.3, 0.36, 0.44, 0.52], char_entropy: [7.2, 8.0, 8.6, 9.2, 9.8, 10.2],
    bigram_repeat: [0.06, 0.1, 0.15, 0.21, 0.3, 0.42], trigram_repeat: [0.02, 0.05, 0.08, 0.12, 0.17, 0.24],
    punct_density: [0.05, 0.08, 0.12, 0.15, 0.2, 0.26], dash_density: [0.0, 0.001, 0.002, 0.005, 0.01, 0.018],
    quote_density: [0.0, 0.002, 0.005, 0.01, 0.02, 0.035], opening_pattern_entropy: [3.0, 3.8, 4.5, 5.1, 5.7, 6.3],
    syntactic_template_index: [0.12, 0.18, 0.25, 0.34, 0.45, 0.58], dialogue_len_cv: [0.3, 0.5, 0.7, 0.9, 1.1, 1.4],
    tag_variety: [0.3, 0.5, 0.75, 1.0, 1.3, 1.6], tells_density: [0.0, 0.001, 0.002, 0.004, 0.007, 0.012],
    colloquial_density: [0.0, 0.001, 0.002, 0.004, 0.008, 0.015],
  },
  academic: {
    sentence_len_cv: [0.2, 0.28, 0.38, 0.5, 0.65, 0.85], para_len_cv: [0.28, 0.4, 0.52, 0.68, 0.9, 1.15],
    char_ttr: [0.19, 0.26, 0.32, 0.38, 0.46, 0.55], char_entropy: [7.4, 8.1, 8.7, 9.3, 9.9, 10.3],
    bigram_repeat: [0.06, 0.1, 0.15, 0.22, 0.31, 0.43], trigram_repeat: [0.02, 0.05, 0.08, 0.13, 0.19, 0.27],
    punct_density: [0.04, 0.07, 0.1, 0.14, 0.19, 0.25], dash_density: [0.0, 0.001, 0.002, 0.004, 0.009, 0.015],
    quote_density: [0.0, 0.002, 0.006, 0.012, 0.022, 0.04], opening_pattern_entropy: [3.1, 3.9, 4.6, 5.2, 5.8, 6.4],
    syntactic_template_index: [0.11, 0.17, 0.24, 0.33, 0.43, 0.56], dialogue_len_cv: [0.3, 0.5, 0.7, 0.9, 1.1, 1.4],
    tag_variety: [0.3, 0.55, 0.8, 1.1, 1.4, 1.8], tells_density: [0.0, 0.001, 0.003, 0.006, 0.01, 0.018],
    colloquial_density: [0.0, 0.0005, 0.0015, 0.003, 0.006, 0.012],
  },
  media: {
    sentence_len_cv: [0.25, 0.35, 0.48, 0.62, 0.8, 1.05], para_len_cv: [0.3, 0.45, 0.6, 0.8, 1.05, 1.4],
    char_ttr: [0.22, 0.3, 0.37, 0.45, 0.54, 0.64], char_entropy: [7.8, 8.5, 9.1, 9.6, 10.1, 10.6],
    bigram_repeat: [0.05, 0.09, 0.13, 0.19, 0.27, 0.38], trigram_repeat: [0.02, 0.04, 0.07, 0.11, 0.16, 0.24],
    punct_density: [0.05, 0.08, 0.12, 0.16, 0.21, 0.28], dash_density: [0.0, 0.002, 0.004, 0.008, 0.015, 0.03],
    quote_density: [0.0, 0.005, 0.012, 0.02, 0.034, 0.055], opening_pattern_entropy: [3.4, 4.2, 4.9, 5.5, 6.0, 6.5],
    syntactic_template_index: [0.1, 0.15, 0.21, 0.28, 0.38, 0.5], dialogue_len_cv: [0.3, 0.5, 0.7, 0.9, 1.15, 1.5],
    tag_variety: [0.3, 0.55, 0.8, 1.05, 1.35, 1.7], tells_density: [0.0, 0.001, 0.003, 0.006, 0.011, 0.02],
    colloquial_density: [0.0, 0.002, 0.006, 0.011, 0.019, 0.032],
  },
}

/** 特征方向：low_ai=值越低越像 AI；high_ai=值越高越像 AI（阈值方向修复，spec P0-3） */
export const FEATURE_DIRECTIONS: Record<PercentileKey, 'low_ai' | 'high_ai'> = {
  sentence_len_cv: 'low_ai', para_len_cv: 'low_ai',
  char_ttr: 'low_ai', char_entropy: 'low_ai',
  bigram_repeat: 'high_ai', trigram_repeat: 'high_ai',
  punct_density: 'low_ai',                     // 中文正常 0.05–0.25，过疏才像 AI（修复旧 0.018–0.045→0.74 反向 bug）
  dash_density: 'high_ai', quote_density: 'low_ai',
  opening_pattern_entropy: 'low_ai', syntactic_template_index: 'high_ai',
  dialogue_len_cv: 'low_ai', tag_variety: 'low_ai',
  tells_density: 'high_ai', colloquial_density: 'low_ai',
}
export const PERCENTILE_KEYS = Object.keys(FEATURE_DIRECTIONS) as PercentileKey[]
export function directionOf(key: PercentileKey): 'low_ai' | 'high_ai' { return FEATURE_DIRECTIONS[key] }
/** 单特征 → AI 倾向分 [0.05,0.95]：low_ai 时 z 低分高，high_ai 反之（供旧 signals 兼容与统计线复用） */
export function aiScoreFromZ(key: PercentileKey, value: number, table: PercentileTable): number {
  const z = zFeature(key, value, table)
  const s = directionOf(key) === 'low_ai' ? 1 / (1 + Math.exp(z)) : 1 / (1 + Math.exp(-z))
  return Math.round(Math.min(0.95, Math.max(0.05, s)) * 100) / 100
}

/** 逆正态CDF查表（±3 裁剪域）；线性内插，确定性可测 */
const Z_TABLE_P = [0.00135, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.99865]
const Z_TABLE = [-3, -2.3263, -1.6449, -1.2816, -0.6745, 0, 0.6745, 1.2816, 1.6449, 2.3263, 3]
const normInv = (p: number): number => {
  if (p <= Z_TABLE_P[0]!) return Z_TABLE[0]!
  if (p >= Z_TABLE_P[Z_TABLE_P.length - 1]!) return Z_TABLE[Z_TABLE_P.length - 1]!
  for (let i = 1; i < Z_TABLE_P.length; i++) {
    if (p <= Z_TABLE_P[i]!) {
      const t = (p - Z_TABLE_P[i - 1]!) / (Z_TABLE_P[i]! - Z_TABLE_P[i - 1]!)
      return Z_TABLE[i - 1]! + t * (Z_TABLE[i]! - Z_TABLE[i - 1]!)
    }
  }
  return 0
}

/** v 落在表中的百分位 [0,1]（分段线性内插） */
export function percentileOf(raw: number, points: number[]): number {
  if (!points?.length) return 0.5
  if (raw <= points[0]!) return 0
  const last = points[points.length - 1]!
  if (raw >= last) return 1
  for (let i = 1; i < points.length; i++) {
    if (raw <= points[i]!) {
      const seg = points[i]! - points[i - 1]!
      return (i - 1 + (seg ? (raw - points[i - 1]!) / seg : 0)) / (points.length - 1)
    }
  }
  return 0.5
}

/** 百分位 → 裁剪 z 分数（±3）；p=percentileOf(v, table)，z=Φ⁻¹(p) */
export function zFeature(key: PercentileKey, value: number, table: PercentileTable): number {
  const points = table[key]
  if (!points || !Number.isFinite(value)) return 0
  const p = percentileOf(value, points)
  const z = normInv(Math.min(0.99865, Math.max(0.00135, p)))
  return Math.min(3, Math.max(-3, z))
}

/** z → [0,1] 证据线分：dir=high_ai 时 z 越高分越高；low_ai 反之 */
export function lineScoreFromPercentiles(
  raws: Pick<RawFeatures, PercentileKey>,
  dir: Record<string, 'high_ai' | 'low_ai'>,
  weight: Record<string, number>,
  table: PercentileTable,
): number {
  let acc = 0, sum = 0
  for (const k of Object.keys(dir) as PercentileKey[]) {
    const w = weight[k] || 0
    sum += w
    const z = zFeature(k, raws[k] || 0, table)
    const signed = dir[k] === 'low_ai' ? -z : z
    acc += w * (1 / (1 + Math.exp(-signed)))  // z→概率化贡献
  }
  return sum ? Math.min(0.99, Math.max(0.01, acc / sum)) : 0.5
}

export const __forTest = { normInv }

// ========== Task 4.1：校准档案加载 / ppl 映射 / 落库 / 回滚 ==========

export type PplTrack = { mu: number; sd: number }
export type StatSub = { w: number[]; b: number }
export type CalibProfile = {
  version?: number
  engine_version?: string
  /** key: 小写模型名（不含 @configId）；echo 覆盖 echo+prompt_logprobs 两轨 */
  ppl_tracks?: Record<string, { echo?: PplTrack; proxy?: PplTrack }>
  percentiles?: Partial<Record<Genre, PercentileTable>>
  /** S1 子模型（15 维，PERCENTILE_KEYS 顺序）；缺省用 seed 加权 */
  stat_submodel?: { w: number[]; b: number }
  /** 全融合权重（仅语料 ppl 覆盖率≥0.8 时导出）；缺省用 seedFusionWeights */
  fusion?: Record<string, { w: number[]; b: number }>
  metrics?: { fpr: number | null; recall: number | null; train: 's1_only' | 'full' }
}

/** ppl→证据线。低 ppl（更可预测=更 AI）→ z 为负 → 分高 */
export function pplToZ(ppl: number, track?: PplTrack): number | null {
  if (!track || !Number.isFinite(ppl) || ppl <= 0 || !(track.sd > 0.05)) return null
  return Math.max(-3, Math.min(3, (ppl - track.mu) / track.sd))
}
export function pplLineScore(z: number | null, k = 1.0): number | null {
  if (z == null || !Number.isFinite(z)) return null
  return Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp(k * z))))
}

function validateProfile(raw: unknown): { profile: CalibProfile | null; problems: string[] } {
  const problems: string[] = []
  if (!raw || typeof raw !== 'object') return { profile: null, problems: ['档案为空'] }
  const p = raw as CalibProfile
  if (!Number.isFinite(Number(p.version))) problems.push('version 非法')
  if (p.fusion) {
    for (const [g, v] of Object.entries(p.fusion)) {
      if (!AI_DETECT_GENRES.includes(g as Genre)) problems.push(`未知 genre ${g}`)
      if (!Array.isArray(v?.w) || v.w.length !== FUSION_FEATURE_KEYS.length || !Number.isFinite(v?.b)) problems.push(`genre ${g} 融合权重维度不符`)
    }
  }
  if (p.stat_submodel && p.stat_submodel.w.length !== PERCENTILE_KEYS.length) problems.push('stat_submodel 维度不符')
  return { profile: problems.length ? null : p, problems }
}

const MEMO_TTL_MS = 60_000
let memo: { raw: string | null; at: number; result: LoadCalibResult } | null = null
export function resetCalibMemoForTest() { memo = null }

export type LoadCalibResult = {
  calibrated: boolean
  profile: CalibProfile | null
  profileVersion: number | null
  meta: { version: number | null; source: 'profile' | 'seed' | 'broken'; problems: string[] }
  weightsFor(genre: Genre): { w: number[]; b: number }
  tableFor(genre: Genre): PercentileTable
  statsSub?: StatSub
  /** modelRef 形如 `model@cfgId`——取 @ 前段查 track */
  pplTrack(modelRef: string, mode: 'echo' | 'proxy'): PplTrack | undefined
}

function buildResult(profile: CalibProfile | null, problems: string[]): LoadCalibResult {
  const seedOnly = profile == null
  return {
    calibrated: !seedOnly,
    profile,
    profileVersion: seedOnly ? null : profile!.version ?? null,
    meta: {
      version: seedOnly ? null : profile!.version ?? null,
      source: profile ? 'profile' : (problems.length ? 'broken' : 'seed'),
      problems,
    },
    weightsFor(genre) {
      const g = profile?.fusion?.[genre]
      return g ? { w: g.w, b: g.b } : defaultSeedWeights(genre)
    },
    tableFor(genre) {
      return { ...DEFAULT_PERCENTILE_TABLES[genre], ...(profile?.percentiles?.[genre] ?? {}) } as PercentileTable
    },
    statsSub: profile?.stat_submodel?.w.length === PERCENTILE_KEYS.length ? profile.stat_submodel : undefined,
    pplTrack(modelRef, mode) {
      if (!profile?.ppl_tracks) return undefined
      const base = String(modelRef || '').toLowerCase().split('@')[0]
      return profile.ppl_tracks[base]?.[mode] ?? profile.ppl_tracks.default?.[mode]
    },
  }
}

export async function loadCalibProfile(): Promise<LoadCalibResult> {
  let raw: string | null = null
  try { raw = (await getAppSetting(APP_SETTING_KEYS.calibration))?.value ?? null } catch { raw = null }
  if (memo && memo.raw === raw && Date.now() - memo.at < MEMO_TTL_MS) return memo.result
  let profile: CalibProfile | null = null
  let problems: string[] = []
  if (raw) {
    try {
      const v = validateProfile(JSON.parse(raw))
      profile = v.profile
      problems = v.problems
      if (!profile) logTaskWarn('AiDetect', 'calibration-profile-invalid', { problems: v.problems })
    } catch {
      problems = ['档案 JSON 解析失败']
      logTaskWarn('AiDetect', 'calibration-profile-parse-error')
    }
  }
  const result = buildResult(profile, problems)
  memo = { raw, at: Date.now(), result }
  return result
}

/** 训练视图共用管线（Task 5.3 CLI / Task 6.2 retrain 单一实现，杜绝两侧漂移）。
 * 自封闭实现（不 import novel-detect-train，避免 Task 4.1→5.2 前向依赖）；train-core 的 buildPercentiles 与此逻辑一致，verify:ai-detect-train 双保。 */
export function buildPercentilesFromRaw(rawsList: RawFeatures[]): PercentileTable {
  const table = {} as PercentileTable
  const quantile = (vals: number[], p: number) => {
    const v = vals.filter(Number.isFinite).sort((a, b) => a - b)
    if (!v.length) return 0
    const idx = (v.length - 1) * p
    const lo = Math.floor(idx); const hi = Math.min(v.length - 1, lo + 1)
    return v[lo]! + (v[hi]! - v[lo]!) * (idx - lo)
  }
  for (const k of PERCENTILE_KEYS) {
    const vals = rawsList.map((r) => (r as unknown as Record<string, number>)[k] ?? 0)
    ;(table as Record<string, number[]>)[k] = [0.05, 0.25, 0.5, 0.75, 0.9, 0.95]
      .map((p) => Math.round(quantile(vals, p) * 10000) / 10000)
  }
  return table
}
/** 方向校正百分位向量：low_ai 取反再 sigmoid（z≥1 高分位 = AI 向） */
export function featureVectorOf(raws: RawFeatures, table: PercentileTable): number[] {
  return PERCENTILE_KEYS.map((k) => {
    const z = zFeature(k, (raws as unknown as Record<string, number>)[k] ?? 0, table)
    return 1 / (1 + Math.exp(-(directionOf(k) === 'low_ai' ? -z : z)))
  })
}

/** 读取原始校准档案对象（retrain 继承字段用）；损坏/缺失返回 null */
export async function readRawCalibProfile(): Promise<CalibProfile | null> {
  try {
    const row = await getAppSetting(APP_SETTING_KEYS.calibration)
    if (!row?.value) return null
    return validateProfile(JSON.parse(row.value)).profile
  } catch { return null }
}

/** 两级版本轮换：当前→backup，新版入当前（spec §5.9）。 */
export async function saveProfileWithRotate(next: CalibProfile): Promise<{ to: number; backupAvailable: boolean }> {
  const cur = await getAppSetting(APP_SETTING_KEYS.calibration).catch(() => null)
  const curVersion = cur?.value ? Number(JSON.parse(cur.value)?.version) || 0 : 0
  const version = Math.max(curVersion + 100, (next.version ?? 0) + 100)
  const withMeta: CalibProfile = { ...next, version, engine_version: AI_DETECT_ENGINE_VERSION }
  if (cur?.value) await upsertAppSetting(APP_SETTING_KEYS.calibrationBackup, cur.value, now())
  await upsertAppSetting(APP_SETTING_KEYS.calibration, JSON.stringify(withMeta), now())
  resetCalibMemoForTest()
  return { to: version, backupAvailable: !!cur?.value }
}

export async function rollbackCalibProfile(): Promise<{ ok: boolean; activeVersion?: number; reason?: string }> {
  const backup = await getAppSetting(APP_SETTING_KEYS.calibrationBackup).catch(() => null)
  if (!backup?.value) return { ok: false, reason: '无备份档案' }
  if (validateProfile(JSON.parse(backup.value)).profile == null) return { ok: false, reason: '备份档案已损坏，保持现行' }
  await upsertAppSetting(APP_SETTING_KEYS.calibration, backup.value, now())
  resetCalibMemoForTest()
  return { ok: true, activeVersion: JSON.parse(backup.value).version }
}
