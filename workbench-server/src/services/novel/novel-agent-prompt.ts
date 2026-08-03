import { novelAntiAiCoreFor } from '../../agents/novel-anti-ai-core.js'
import { WEBNOVEL_CHAPTER_PROSE_GUIDE, WEBNOVEL_STAT_FINGERPRINT_GUIDE } from '../../agents/webnovel-prose-style.js'
import { loadAgentSkills } from '../../agents/skills.js'
import { NOVEL_DEFAULT_PROMPTS, type NovelAgentType } from '../../agents/novel-defaults.js'
import { getAgentConfig } from '../../common/agent/agent-config.js'
import { appendLessonsToPrompt } from '../lesson/generation-lessons.js'
import type { ChatCompletionOptions } from '../ai/ai.js'

/** Agent 配置 maxTokens 建议下限（避免 DB 误设过低）；调用方可再按目标字数收紧上限 */
const AGENT_MIN_MAX_TOKENS: Partial<Record<NovelAgentType, number>> = {
  novel_chapter_writer: 2048,
  novel_outline: 8192,
  novel_writing_brief: 4096,
  novel_premise: 2048,
}

export async function buildNovelAgentSystem(agentType: NovelAgentType, fallbackSystem?: string): Promise<string> {
  const defaults = NOVEL_DEFAULT_PROMPTS[agentType]
  const cfg = await getAgentConfig(agentType)
  const base = cfg?.systemPrompt?.trim() || fallbackSystem || defaults.instructions
  const skills = loadAgentSkills(agentType)
  const antiAi = novelAntiAiCoreFor(agentType)
  const parts = [base]
  if (skills) parts.push('', skills)
  if (antiAi) parts.push('', antiAi)
  if (agentType === 'novel_chapter_writer') {
    parts.push('', WEBNOVEL_CHAPTER_PROSE_GUIDE, '', WEBNOVEL_STAT_FINGERPRINT_GUIDE)
  }
  return await appendLessonsToPrompt(parts.join('\n'), agentType)
}

export async function novelAgentCompletionOptions(
  agentType: NovelAgentType,
  fallback: ChatCompletionOptions,
): Promise<ChatCompletionOptions> {
  const cfg = await getAgentConfig(agentType)
  const minTokens = AGENT_MIN_MAX_TOKENS[agentType] ?? 0
  const fromDb = Number(cfg?.maxTokens)
  const fromFallback = Number(fallback.maxTokens)
  // 调用方传入的 fallback.maxTokens 视为目标上限（如按章节字数收紧）；DB 配置不得突破该上限
  const fallbackCap = Number.isFinite(fromFallback) && fromFallback > 0 ? fromFallback : null
  const preferred = Number.isFinite(fromDb) && fromDb > 0
    ? fromDb
    : (fallbackCap ?? (minTokens || 8192))
  let maxTokens = Math.max(minTokens, preferred)
  if (fallbackCap != null) maxTokens = Math.min(maxTokens, fallbackCap)

  return {
    maxTokens,
    temperature: cfg?.temperature ?? fallback.temperature,
  }
}
