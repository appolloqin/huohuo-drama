import { loadAgentSkills } from '../../agents/skills.js'
import { AI_DEHUMANIZER_AGENT_TYPE, AI_DEHUMANIZER_DEFAULT_PROMPT } from '../../agents/ai-dehumanizer-defaults.js'
import { WEBNOVEL_HUMAN_PROSE_STYLE } from '../../agents/webnovel-prose-style.js'
import { getAgentConfig } from '../../common/agent/agent-config.js'
import { appendLessonsToPrompt } from '../lesson/generation-lessons.js'
import type { ChatCompletionOptions } from './ai.js'

export async function buildDehumanizerSystem(): Promise<string> {
  const cfg = await getAgentConfig(AI_DEHUMANIZER_AGENT_TYPE)
  const base = cfg?.systemPrompt?.trim() || AI_DEHUMANIZER_DEFAULT_PROMPT
  const skills = loadAgentSkills(AI_DEHUMANIZER_AGENT_TYPE)
  const parts = [base]
  if (skills) parts.push('', skills)
  parts.push('', WEBNOVEL_HUMAN_PROSE_STYLE)
  return await appendLessonsToPrompt(parts.join('\n'), AI_DEHUMANIZER_AGENT_TYPE)
}

export async function dehumanizerCompletionOptions(fallback: ChatCompletionOptions = {}): Promise<ChatCompletionOptions> {
  const cfg = await getAgentConfig(AI_DEHUMANIZER_AGENT_TYPE)
  return {
    maxTokens: cfg?.maxTokens ?? fallback.maxTokens ?? 8192,
    // humanize-text 推荐 1.0–1.3 以增加 burstiness；可被设置页覆盖
    temperature: cfg?.temperature ?? fallback.temperature ?? 1.05,
  }
}
