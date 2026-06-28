/**
 * Mastra Agent 工厂
 */
import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import { getTextConfig, getTextProviderBaseUrl, type ConfigResolveOpts } from '../services/ai/ai.js'
import { resolveUserAgentModel } from '../services/ai/user-ai-config-resolve.js'
import { fetchWithRetry } from '../common/http/fetch-retry.js'
import { logTaskProgress } from '../common/task/task-logger.js'
import { buildDramaScriptFormatterToolkit } from './tools/drama-script-formatter-tools.js'
import { buildDramaCastSceneExtractToolkit } from './tools/drama-cast-scene-extract-tools.js'
import { buildDramaStoryboardBreakdownToolkit } from './tools/drama-storyboard-breakdown-tools.js'
import { buildDramaVoiceAssignToolkit } from './tools/drama-voice-assign-tools.js'
import { buildDramaImagePromptToolkit } from './tools/drama-image-prompt-tools.js'
import { loadAgentSkills } from './skills.js'
import { getAgentConfig } from '../common/agent/agent-config.js'
import { appendLessonsToPrompt } from '../services/lesson/generation-lessons.js'
import { DRAMA_AGENT_DEFAULTS } from './agent-prompts.js'

const AGENT_TOOLKIT_REGISTRY: Record<string, (episodeId: number, dramaId: number) => Record<string, any>> = {
  drama_script_formatter: (episodeId) => buildDramaScriptFormatterToolkit(episodeId),
  drama_cast_scene_extract: (_episodeId, dramaId) => buildDramaCastSceneExtractToolkit(_episodeId, dramaId),
  drama_storyboard_breakdown: (episodeId, dramaId) => buildDramaStoryboardBreakdownToolkit(episodeId, dramaId),
  drama_voice_assign: (episodeId, dramaId) => buildDramaVoiceAssignToolkit(episodeId, dramaId),
  drama_image_prompt: (episodeId, dramaId) => buildDramaImagePromptToolkit(episodeId, dramaId),
}

export { validAgentTypes } from './agent-prompts.js'

async function resolveAgentChatModel(
  dbConfig: Awaited<ReturnType<typeof getAgentConfig>>,
  configOpts?: ConfigResolveOpts,
) {
  const textConfig = await getTextConfig(configOpts)
  const baseURL = getTextProviderBaseUrl(textConfig)
  const fallbackModel = dbConfig?.model || textConfig.model
  const model = configOpts?.userId
    ? await resolveUserAgentModel(configOpts.userId, configOpts.role, fallbackModel)
    : fallbackModel
  logTaskProgress('AIConfig', 'text-model-endpoint', {
    provider: textConfig.provider,
    baseUrl: baseURL,
    model,
    userId: configOpts?.userId,
  })
  const provider = createOpenAI({
    baseURL,
    apiKey: textConfig.apiKey,
    fetch: fetchWithRetry as typeof fetch,
  } as any)
  return provider.chat(model)
}

async function mergeAgentSystemPrompt(type: string, dbConfig: Awaited<ReturnType<typeof getAgentConfig>>) {
  const defaults = DRAMA_AGENT_DEFAULTS[type]
  const base = dbConfig?.systemPrompt?.trim() || defaults.instructions
  const skills = loadAgentSkills(type)
  const merged = skills ? [base, '', skills].join('\n') : base
  return appendLessonsToPrompt(merged, type)
}

export async function createAgent(
  type: string,
  episodeId: number,
  dramaId: number,
  configOpts?: ConfigResolveOpts,
): Promise<Agent | null> {
  const defaults = DRAMA_AGENT_DEFAULTS[type]
  const buildTools = AGENT_TOOLKIT_REGISTRY[type]
  if (!defaults || !buildTools) return null

  const dbConfig = await getAgentConfig(type)
  return new Agent({
    id: type,
    name: dbConfig?.name || defaults.name,
    instructions: await mergeAgentSystemPrompt(type, dbConfig),
    model: await resolveAgentChatModel(dbConfig, configOpts),
    tools: buildTools(episodeId, dramaId),
  })
}
