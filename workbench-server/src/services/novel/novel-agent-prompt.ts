import { novelAntiAiCoreFor } from '../../agents/novel-anti-ai-core.js'
import { WEBNOVEL_CHAPTER_PROSE_GUIDE } from '../../agents/webnovel-prose-style.js'
import { loadAgentSkills } from '../../agents/skills.js'
import { NOVEL_DEFAULT_PROMPTS, type NovelAgentType } from '../../agents/novel-defaults.js'
import { getAgentConfig } from '../../common/agent/agent-config.js'
import { appendLessonsToPrompt } from '../lesson/generation-lessons.js'
import type { ChatCompletionOptions } from '../ai/ai.js'

/** Agent 配置 maxTokens 不得低于此值（避免 DB 里误设 1024 导致长章写不出） */
const AGENT_MIN_MAX_TOKENS: Partial<Record<NovelAgentType, number>> = {
  novel_chapter_writer: 8192,
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
  if (agentType === 'novel_chapter_writer') parts.push('', WEBNOVEL_CHAPTER_PROSE_GUIDE)
  return await appendLessonsToPrompt(parts.join('\n'), agentType)
}

export async function novelAgentCompletionOptions(
  agentType: NovelAgentType,
  fallback: ChatCompletionOptions,
): Promise<ChatCompletionOptions> {
  const cfg = await getAgentConfig(agentType)
  const minTokens = AGENT_MIN_MAX_TOKENS[agentType]
  const configured = cfg?.maxTokens ?? fallback.maxTokens
  const maxTokens = minTokens != null
    ? Math.max(minTokens, configured ?? minTokens)
    : configured

  return {
    maxTokens,
    temperature: cfg?.temperature ?? fallback.temperature,
  }
}
