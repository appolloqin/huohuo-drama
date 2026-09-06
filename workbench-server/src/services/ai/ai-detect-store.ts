/** runs 历史+结果缓存、feedback CRUD、校准语料采集；routes 唯一持久化入口（check:layers 合规） */
import * as fs from 'fs'
import * as path from 'path'
import * as runsRepo from '../../db/repos/ai-detect-runs/index.js'
import * as feedbackDataRepo from '../../db/repos/ai-detect-feedback/index.js'
import type { AiDetectRunCacheKey, AiDetectRunRow } from '../../db/repos/types.js'
import { CACHE_TTL_DAYS, SHORT_TEXT_CHARS } from '../../common/novel/novel-detect-calib.js'
import { now } from '../../common/http/response.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { parseEpisodeMetadata } from '../../common/drama/episode-meta.js'
import type { AiDetectionResult } from './ai-text-detection.js'
import { hashNovelContent } from './ai-text-detection.js'

export type RunProbe = AiDetectRunCacheKey

/** 路径约定：fixtures 在 workbench-server/fixtures/，samples 在 workbench-server/workbench-data/ */
export const AI_DETECT_FIXTURES_REL = 'fixtures'
export const AI_DETECT_SAMPLES_REL = path.join('workbench-data', 'ai-detect-samples.json')

export function resolveWorkspace(rel: string): string {
  const cwd = process.cwd()
  const direct = path.resolve(cwd, rel)
  if (cwd.endsWith('workbench-server') || fs.existsSync(direct)) return direct
  return path.resolve(cwd, 'workbench-server', rel)
}

export type SampleRow = {
  id: string
  label: 'human' | 'ai'
  genre: 'web_fiction'
  source: 'fixtures' | 'platform' | 'feedback'
  model?: string
  chars: number
  text: string
  hash: string
}

/** 校准语料采集（spec §5.9/G6）：平台 AI + fixtures + 授权反馈。纯读，不写库。 */
export async function collectDetectSamples(opts?: {
  sampleChars?: number
  perModel?: number
  limitEpisodes?: number
}): Promise<{ samples: SampleRow[]; byLabel: { web_fiction: { human_count: number; ai_count: number } } }> {
  const perModel = opts?.perModel ?? 5
  const sampleChars = opts?.sampleChars ?? 8000
  const samples: SampleRow[] = []

  try {
    const rows = await episodesRepo.listEpisodesForAiDetect(opts?.limitEpisodes ?? 200)
    const picked = new Map<string, number>()
    for (const row of rows) {
      let wm: string | undefined
      let content = row.content || ''
      try { wm = parseEpisodeMetadata(row.metadata).ai_detection?.writing_model?.trim() } catch { continue }
      if (!wm || countNovelChars(content) < 1500) continue
      const taken = picked.get(wm) || 0
      if (taken >= perModel) continue
      picked.set(wm, taken + 1)
      content = [...content].slice(0, sampleChars).join('')
      samples.push({
        id: `plat-${wm}-${row.id}`,
        label: 'ai',
        genre: 'web_fiction',
        source: 'platform',
        model: wm,
        chars: countNovelChars(content),
        text: content,
        hash: hashNovelContent(content),
      })
    }
  } catch { /* 允许空库：跳过平台样本 */ }

  const dirs: Array<[string, 'human' | 'ai']> = [['human', 'human'], ['ai', 'ai']]
  for (const [sub, label] of dirs) {
    const dir = path.join(resolveWorkspace(AI_DETECT_FIXTURES_REL), sub)
    let files: string[] = []
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).slice(0, 80) } catch { continue }
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8').trim()
      const chars = countNovelChars(text)
      // fixtures 门槛放宽到 800，便于离线结构冒烟；正式训练仍靠 collect CLI + 护栏
      if (chars < 800) continue
      const clipped = [...text].slice(0, sampleChars).join('')
      samples.push({
        id: `fix-${sub}-${f}-${samples.length}`,
        label,
        genre: 'web_fiction',
        source: 'fixtures',
        model: label === 'ai' ? f.replace(/\.txt$/, '') : undefined,
        chars: countNovelChars(clipped),
        text: clipped,
        hash: hashNovelContent(clipped),
      })
    }
  }

  try {
    for (const fb of await feedbackDataRepo.listTrainableFeedback()) {
      if (!fb.excerpt || (fb.sourceLabel !== 'human' && fb.sourceLabel !== 'ai')) continue
      const chars = countNovelChars(fb.excerpt)
      if (chars < 800) continue
      samples.push({
        id: `fb-${fb.id}`,
        label: fb.sourceLabel,
        genre: 'web_fiction',
        source: 'feedback',
        chars,
        text: fb.excerpt,
        hash: fb.contentHash,
      })
    }
  } catch { /* feedback 表未就绪时跳过 */ }

  const byLabel = {
    web_fiction: {
      human_count: samples.filter((s) => s.label === 'human').length,
      ai_count: samples.filter((s) => s.label === 'ai').length,
    },
  }
  return { samples, byLabel }
}

export async function lookupRunCache(probe: RunProbe): Promise<{ row: AiDetectRunRow } | null> {
  try {
    const row = await runsRepo.findCacheableRun(probe)
    if (!row) return null
    await runsRepo.bumpCacheHit(row.id).catch(() => undefined)
    return { row }
  } catch { return null }
}

export async function recordRun(args: {
  probe: RunProbe
  result: AiDetectionResult
  userId: number | null
  sourceType: string
  charCount: number
}): Promise<boolean> {
  try {
    const createdAt = now()
    const expires = new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000)
    const expiresAt = createdAt.includes('T')
      ? expires.toISOString()
      : expires.toISOString().replace('T', ' ').slice(0, 19)
    const cacheable = !!args.result.method && args.charCount >= SHORT_TEXT_CHARS
    await runsRepo.upsertRun({
      ...args.probe,
      userId: args.userId,
      sourceType: args.sourceType,
      charCount: args.charCount,
      probability: args.result.probability,
      verdict: args.result.verdict,
      confidence: args.result.confidence,
      method: args.result.method,
      resultJson: cacheable ? JSON.stringify({ ...args.result, suggestions: undefined }) : null,
      modelRef: args.result.perplexity_model ?? null,
      uncalibrated: args.result.calibration === 'none',
      needsReview: args.result.needs_review ?? false,
      perturbScore: args.result.perturb?.applied ? (args.result.perturb.stability ?? null) : null,
      elapsedMs: args.result.elapsed_ms ?? null,
      expiresAt,
      createdAt,
      cacheHit: 0,
    })
    return true
  } catch { return false }
}

export const feedbackRepo = {
  insert: feedbackDataRepo.insertFeedback,
  listTrainable: feedbackDataRepo.listTrainableFeedback,
  setAdminLabel: feedbackDataRepo.setAdminLabel,
  findById: feedbackDataRepo.findFeedbackById,
  countPendingReview: feedbackDataRepo.countPendingReview,
}
