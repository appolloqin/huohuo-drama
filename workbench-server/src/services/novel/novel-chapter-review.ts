/**
 * 章节多维审稿（solo）— 加载 novel_review Skill + 平台标准 + 句式预检
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { stripNovelChangeRecord } from '../../common/novel/novel-change-record.js'
import type { NovelMetadata } from '../../common/novel/novel-meta.js'
import {
  formatAiPatternHints,
  scanNovelAiPatterns,
  type AiPatternScanResult,
} from '../../common/novel/novel-ai-pattern-scan.js'
import {
  buildNovelReviewPlatformRubric,
  normalizeNovelReviewPlatform,
  NOVEL_REVIEW_PLATFORM_LABELS,
  type NovelReviewPlatform,
} from '../../common/novel/novel-review-platforms.js'
import { loadAgentSkills } from '../../agents/skills.js'
import {
  NOVEL_REVIEW_AGENT_TYPE,
  NOVEL_REVIEW_DEFAULT_PROMPT,
} from '../../agents/novel-review-defaults.js'
import { getAgentConfig } from '../../common/agent/agent-config.js'
import { appendLessonsToPrompt } from '../lesson/generation-lessons.js'
import { logTaskWarn } from '../../common/task/task-logger.js'

export type ReviewSeverity = 'S1' | 'S2' | 'S3' | 'S4'
export type ReviewCategory =
  | 'structure'
  | 'character'
  | 'prose'
  | 'consistency'
  | 'platform'
  | 'safety'
  | 'causal'
  | 'rule_boundary'
  | 'format'

export type ReviewFinding = {
  severity: ReviewSeverity
  category: ReviewCategory
  location: string
  evidence: string
  issue: string
  fix: string
}

export type ChapterReviewResult = {
  verdict: 'APPROVE' | 'CONCERNS' | 'REJECT'
  summary: string
  findings: ReviewFinding[]
  pattern_scan: AiPatternScanResult
  platform: NovelReviewPlatform
  platform_label: string
  content_hash: string
  checked_at: string
  model_failed: boolean
}

const CATEGORIES = new Set<string>([
  'structure', 'character', 'prose', 'consistency', 'platform', 'safety',
  'causal', 'rule_boundary', 'format',
])
const SEVERITIES = new Set<string>(['S1', 'S2', 'S3', 'S4'])

async function buildReviewSystem(platform: NovelReviewPlatform): Promise<string> {
  const cfg = await getAgentConfig(NOVEL_REVIEW_AGENT_TYPE)
  const base = cfg?.systemPrompt?.trim() || NOVEL_REVIEW_DEFAULT_PROMPT
  const skills = loadAgentSkills(NOVEL_REVIEW_AGENT_TYPE)
  const rubric = buildNovelReviewPlatformRubric(platform)
  const parts = [base]
  if (skills) parts.push('', skills)
  parts.push('', rubric)
  parts.push('', 'category 可取 safety（安全/低俗/侵权）与 platform（平台质量标准未达标）。安全项优先于文采建议。')
  return appendLessonsToPrompt(parts.join('\n'), NOVEL_REVIEW_AGENT_TYPE)
}

function trunc(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function normalizeFinding(raw: unknown): ReviewFinding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const severity = String(o.severity || '')
  const category = String(o.category || '')
  if (!SEVERITIES.has(severity) || !CATEGORIES.has(category)) return null
  const evidence = typeof o.evidence === 'string' ? o.evidence.trim() : ''
  const issue = typeof o.issue === 'string' ? o.issue.trim() : ''
  if (!evidence || !issue) return null
  return {
    severity: severity as ReviewSeverity,
    category: category as ReviewCategory,
    location: typeof o.location === 'string' ? o.location.slice(0, 80) : '',
    evidence: evidence.slice(0, 200),
    issue: issue.slice(0, 240),
    fix: typeof o.fix === 'string' ? o.fix.slice(0, 240) : '',
  }
}

function mergePatternFindings(
  findings: ReviewFinding[],
  scan: AiPatternScanResult,
): ReviewFinding[] {
  const out = [...findings]
  for (const f of scan.findings.slice(0, 8)) {
    const sev: ReviewSeverity = f.severity === 'blocking' ? 'S2' : 'S3'
    const dup = out.some(
      (x) => x.category === 'prose' && x.evidence.includes(f.excerpt.slice(0, 20)),
    )
    if (dup) continue
    out.push({
      severity: sev,
      category: 'prose',
      location: `句式预检·${f.class}`,
      evidence: f.excerpt,
      issue: `读感风险（${f.class}）`,
      fix: f.advice,
    })
  }
  return out.slice(0, 16)
}

function deriveVerdict(findings: ReviewFinding[]): ChapterReviewResult['verdict'] {
  if (findings.some((f) => f.severity === 'S1' || f.category === 'safety')) return 'REJECT'
  if (findings.some((f) => f.severity === 'S2')) return 'CONCERNS'
  const s3 = findings.filter((f) => f.severity === 'S3').length
  if (s3 >= 5) return 'CONCERNS'
  return 'APPROVE'
}

export async function reviewNovelChapter(args: {
  content: string
  chapterNumber: number
  dramaTitle: string
  meta: NovelMetadata
  writingBrief?: string
  chapterOutline?: string
  platform?: string | null
  billing?: TextBillingContext
}): Promise<ChapterReviewResult> {
  const prose = stripNovelChangeRecord(args.content)
  const checkedAt = new Date().toISOString()
  const contentHash = hashNovelContent(prose)
  const platform = normalizeNovelReviewPlatform(
    args.platform || args.meta.review_platform || 'fanqie',
  )
  const patternScan = scanNovelAiPatterns(prose)
  const patternHints = formatAiPatternHints(patternScan)

  const system = await buildReviewSystem(platform)
  const user = [
    `【书名】${args.dramaTitle}`,
    `【章号】第${args.chapterNumber}章`,
    `【目标平台】${NOVEL_REVIEW_PLATFORM_LABELS[platform]}（${platform}）`,
    args.meta.novel_genre ? `【题材】${args.meta.novel_genre}` : '',
    args.writingBrief?.trim() ? `【写作说明】\n${trunc(args.writingBrief, 1000)}` : '',
    args.chapterOutline?.trim() ? `【本章大纲】\n${trunc(args.chapterOutline, 500)}` : '',
    `【正文字数】${countNovelChars(prose)}`,
    `【句式预检】等级=${patternScan.grade}；blocking=${patternScan.blocking_count}；advisory=${patternScan.advisory_count}`,
    patternHints.length
      ? patternHints.map((h) => `- ${h.signal_key}「${h.match_text}」${h.advice}`).join('\n')
      : '- （无命中）',
    '请严格对照系统中的【平台审稿标准】输出 findings；安全问题用 category=safety。',
    '【待审查正文】',
    trunc(prose, 14000),
  ].filter(Boolean).join('\n\n')

  let findings: ReviewFinding[] = []
  let summary = ''
  let verdict: ChapterReviewResult['verdict'] = 'CONCERNS'
  let modelFailed = false

  try {
    const cfg = await getAgentConfig(NOVEL_REVIEW_AGENT_TYPE)
    const raw = await chatCompletionTextAudit(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      {
        temperature: cfg?.temperature ?? 0.2,
        maxTokens: cfg?.maxTokens ?? 4096,
        billing: args.billing
          ? { ...args.billing, reason: args.billing.reason || '小说章节审稿' }
          : undefined,
      },
    )
    if (!raw?.trim()) {
      modelFailed = true
    } else {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      const parsed = JSON.parse(
        start >= 0 && end > start ? raw.slice(start, end + 1) : raw,
      ) as Record<string, unknown>
      summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : ''
      const list = Array.isArray(parsed.findings) ? parsed.findings : []
      findings = list.map(normalizeFinding).filter((x): x is ReviewFinding => !!x).slice(0, 16)
      const v = String(parsed.verdict || '')
      if (v === 'APPROVE' || v === 'CONCERNS' || v === 'REJECT') verdict = v
      else verdict = deriveVerdict(findings)
    }
  } catch (err: unknown) {
    modelFailed = true
    logTaskWarn('Novel', 'chapter-review-llm-failed', {
      error: err instanceof Error ? err.message : 'parse',
    })
  }

  findings = mergePatternFindings(findings, patternScan)
  if (modelFailed && !summary) {
    summary = patternScan.blocking_count
      ? `模型审稿未返回，已据句式预检标出 ${patternScan.blocking_count} 处须优先处理的读感问题（平台：${NOVEL_REVIEW_PLATFORM_LABELS[platform]}）`
      : `模型审稿未返回；句式预检无明显 blocking（平台：${NOVEL_REVIEW_PLATFORM_LABELS[platform]}），请人工通读`
  }
  if (modelFailed || !findings.length) {
    verdict = deriveVerdict(findings)
  } else {
    if (verdict === 'APPROVE' && patternScan.blocking_count > 0) verdict = 'CONCERNS'
    if (findings.some((f) => f.category === 'safety' && (f.severity === 'S1' || f.severity === 'S2'))) {
      verdict = 'REJECT'
    }
  }

  return {
    verdict,
    summary,
    findings,
    pattern_scan: patternScan,
    platform,
    platform_label: NOVEL_REVIEW_PLATFORM_LABELS[platform],
    content_hash: contentHash,
    checked_at: checkedAt,
    model_failed: modelFailed,
  }
}
