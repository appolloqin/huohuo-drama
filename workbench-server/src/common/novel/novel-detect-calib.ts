/** AI 率检测引擎公共常量：护栏阈值/临界带/settings key 的单一事实源（spec G6/G8/G10/G14）。 */

export const AI_DETECT_ENGINE_VERSION = 'fusion_v2.0'
export const AI_DETECT_FEATURE_VERSION = 'f1'

export const VERDICT_AI_THRESHOLD = 65
export const VERDICT_MIXED_THRESHOLD = 40
/** 临界带宽度：任一 verdict 阈值 ±CRITICAL_MARGIN 内触发 S5 扰动复测（仅临界样本） */
export const CRITICAL_MARGIN = 10

/** 训练导出护栏：人类样本误报率上限 / AI 样本召回下限（两折 CV 需同时满足） */
export const CALIB_MAX_HUMAN_FPR = 0.10
export const CALIB_MIN_AI_RECALL = 0.80

export const CACHE_TTL_DAYS = 30
/** 单次检测 S2 参考模型 chat/completions 调用硬顶 */
export const REF_CALL_BUDGET_CAP = 8
export const REF_MIN_WINDOW_CHARS = 3000

export const HUMANIZE_TARGET_MIN = 15
export const HUMANIZE_TARGET_MAX = 50
export const DEFAULT_HUMANIZE_TARGET = 40
/** episode-meta 读回与 novel-meta 双侧 clamp 必须同步用这两个值 */
export { HUMANIZE_TARGET_MIN as HUMANIZE_TARGET_CLAMP_MIN, HUMANIZE_TARGET_MAX as HUMANIZE_TARGET_CLAMP_MAX }

export const SHORT_TEXT_PROB_MAX = 90
export const SHORT_TEXT_CHARS = 300

export type Genre = 'web_fiction' | 'official' | 'academic' | 'media'
export const AI_DETECT_GENRES: readonly Genre[] = ['web_fiction', 'official', 'academic', 'media']

const GENRE_ALIASES: Record<string, Genre> = {
  web_fiction: 'web_fiction', novel: 'web_fiction', fiction: 'web_fiction',
  official: 'official', gov: 'official',
  academic: 'academic', paper: 'academic', thesis: 'academic',
  media: 'media', news: 'media', marketing: 'media',
}

export function normalizeGenre(raw: unknown): Genre {
  if (typeof raw !== 'string') return 'web_fiction'
  const hit = GENRE_ALIASES[raw.trim().toLowerCase()]
  return hit && AI_DETECT_GENRES.includes(hit) ? hit : 'web_fiction'
}

/** 40±10 或 65±10（含两侧端点区间） */
export function isCriticalBand(probability: number): boolean {
  return Math.abs(probability - VERDICT_MIXED_THRESHOLD) <= CRITICAL_MARGIN
    || Math.abs(probability - VERDICT_AI_THRESHOLD) <= CRITICAL_MARGIN
}

export const APP_SETTING_KEYS = {
  calibration: 'ai_detect_calibration',
  calibrationBackup: 'ai_detect_calibration_backup',
  fingerprints: 'ai_detect_fingerprints',
} as const

/** 融合特征向量维度顺序（档案 weights_json 的 feature_keys 必须与此一致，版本随 engine_version 演进） */
export const FUSION_FEATURE_KEYS = [
  's1_stat',        // 统计证据线 [0,1]
  's2_line',        // 参考模型证据线（校准 z → [0,1]），缺失记 0
  's2_z',           // 裁剪到 ±3 的标准化 ppl z（保留幅度信息），缺失记 0
  'fp_sim',         // S3 风格指纹相似度 [0,1]，缺失记 0
  'perturb_stab',   // S5 扰动复检证据 [0,1]，缺失记 0
  'same_family',    // 写作与参考同系 0/1（提示融合可学到降权）
  'log_len',        // log10(char_count)/5 归一，缺失记 0
  's2_missing',     // 缺失指示位
  'fp_missing',
  's5_missing',
] as const
