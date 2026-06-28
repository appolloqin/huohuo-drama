/**
 * AI 服务抽象层 — 从数据库配置中获取 provider 和 API key
 */
import * as aiConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import { logTaskProgress, logTaskWarn } from '../../common/task/task-logger.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { joinProviderUrl } from './adapters/url.js'
import { chargeTextUsage, parseConfigSettings, resolveThinkingEnabled, resolveTokenUsage } from '../credits/credits.js'
import { applyMiniMaxTextRequestParams, isMiniMaxTextConfig } from './minimax-text.js'
import { fetchWithRetry, isTransientNetworkError } from '../../common/http/fetch-retry.js'
import { resolveUserServiceConfig } from './user-ai-config-resolve.js'

export type ServiceType = 'text' | 'image' | 'video' | 'audio'

export {
  UserAiConfigError,
  assertEpisodeMediaConfigReady,
  assertHuohuoAgentReady,
  assertHuohuoPresetReady,
  assertUserAiConfigReady,
  assertUserDefaultCatalogReady,
  assertUserServiceConfigReady,
  getUserAiConfigReadiness,
  isHuohuoPresetEffective,
  resolveMediaGenerationConfig,
  resolveUserCatalogModel,
  resolveUserServiceConfig,
  shouldChargeMediaGeneration,
  shouldChargeServiceGeneration,
} from './user-ai-config-resolve.js'
export { resolveServiceConfigById, resolveActiveConfigForUser } from './user-ai-config-resolve.js'

export interface AIConfig {
  id?: number
  serviceType?: ServiceType
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  settings?: string | null
}

export function getTextProviderBaseUrl(config: AIConfig) {
  const provider = config.provider.toLowerCase()

  if (provider === 'openai' || provider === 'openrouter' || provider === 'huohuo' || provider === 'deepseek' || provider === 'minimax') {
    return joinProviderUrl(config.baseUrl, '/v1', '')
  }

  if (provider === 'volcengine') {
    return joinProviderUrl(config.baseUrl, '/api/v3', '')
  }

  if (provider === 'ali') {
    return joinProviderUrl(config.baseUrl, '/compatible-mode/v1', '')
  }

  return config.baseUrl
}

export type ConfigResolveOpts = { userId?: number; role?: string }

export async function getActiveConfig(
  serviceType: ServiceType,
  opts?: ConfigResolveOpts,
): Promise<AIConfig | null> {
  try {
    const { config } = await resolveUserServiceConfig(serviceType, opts)
    return config
  } catch (err) {
    if (opts?.userId && opts.role !== 'admin') throw err
    logTaskWarn('AIConfig', 'active-config-missing', { serviceType, error: (err as Error).message })
    return null
  }
}

export async function getTextConfig(opts?: ConfigResolveOpts): Promise<AIConfig> {
  const { config } = await resolveUserServiceConfig('text', opts)
  return config
}

export async function getTextConfigWithModels(): Promise<{
  cfg: AIConfig
  models: string[]
  settings: Record<string, unknown>
}> {
  const rows = (await aiConfigsRepo.listServiceConfigsByType('text'))
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const active = rows[0]
  if (!active) throw new Error('No active text AI config')
  const models = active.model ? JSON.parse(active.model) : []
  const modelList = Array.isArray(models)
    ? models.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : []
  return {
    cfg: {
      id: active.id,
      serviceType: 'text',
      provider: active.provider || '',
      baseUrl: active.baseUrl,
      apiKey: active.apiKey,
      model: modelList[0] || '',
      settings: active.settings,
    },
    models: modelList,
    settings: parseConfigSettings(active.settings),
  }
}

const ALI_LOGPROBS_MODEL_FALLBACKS = [
  'qwen-plus-2025-04-28',
  'qwen-turbo-2025-04-28',
  'qwen-plus-latest',
  'qwen-turbo-latest',
  'qwen-plus',
  'qwen-turbo',
]

function supportsLogprobsHeuristic(model: string): boolean {
  const m = model.toLowerCase()
  if (/qwen3\.5|qwen3\.7|qwen-max|vl|omni|tts/i.test(m)) return false
  if (/qwen-plus|qwen-turbo|qwen3-(?!5|7)/i.test(m)) return true
  return !/3\.5|thinking/i.test(m)
}

export function buildPerplexityModelCandidates(
  cfg: AIConfig,
  models: string[],
  settings: Record<string, unknown>,
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  const push = (m: string) => {
    const v = m.trim()
    if (!v || seen.has(v)) return
    seen.add(v)
    ordered.push(v)
  }

  const fromSettings = typeof settings.perplexityModel === 'string' ? settings.perplexityModel : ''
  if (fromSettings.trim()) push(fromSettings.trim())

  if (cfg.provider.toLowerCase() === 'ali') {
    for (const m of models) if (supportsLogprobsHeuristic(m)) push(m)
    for (const m of ALI_LOGPROBS_MODEL_FALLBACKS) push(m)
    for (const m of models) push(m)
    if (cfg.model) push(cfg.model)
    return ordered
  }

  if (cfg.model) push(cfg.model)
  for (const m of models) push(m)
  return ordered
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * 调用当前启用的文本服务（OpenAI 兼容 /chat/completions），用于一次性补全。
 */
export type TextBillingContext = {
  userId: number
  role?: string
  reason: string
  resourceType?: string
  resourceId?: number
}

export type ChatCompletionOptions = {
  maxTokens?: number
  temperature?: number
  billing?: TextBillingContext
  /** 困惑度检测可指定模型（如 qwen-plus 快照，qwen3.5-plus 不支持 logprobs） */
  model?: string
}

async function maybeChargeText(cfg: AIConfig, messages: ChatMessage[], output: string, usage: any, billing?: TextBillingContext) {
  if (!billing) return
  const { totalTokens, estimated } = resolveTokenUsage(usage, messages, output)
  await chargeTextUsage({
    userId: billing.userId,
    role: billing.role,
    config: cfg,
    totalTokens,
    tokensEstimated: estimated,
    reason: billing.reason,
    resourceType: billing.resourceType,
    resourceId: billing.resourceId,
  })
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 常见思考链标签（各厂商 / 网关格式不一，统一在此剥离） */
const DS_TAG = 'think'
const DS_OPEN = `<${DS_TAG}>`
const DS_CLOSE = `</${DS_TAG}>`

const THINKING_BLOCK_PATTERNS: RegExp[] = [
  /<think>[\s\S]*?<\/redacted_thinking>/gi,
  /<thinking>[\s\S]*?<\/thinking>/gi,
  /<reasoning>[\s\S]*?<\/reasoning>/gi,
  new RegExp(`${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${DS_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'gi'),
]

const THINKING_OPEN_TAG = /^<(?:redacted_thinking|thinking|think|reasoning)\b[^>]*>/i
const THINKING_CLOSE_TAG = /<\/(?:redacted_thinking|thinking|think|reasoning)>|<\/think>/i
const DS_THINK_OPEN = new RegExp(`^${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
const DS_THINK_BLOCK = new RegExp(`${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${DS_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'gi')
const DS_THINK_LEAD = new RegExp(`^[\\s\\S]*?${DS_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`, 'i')

/** 剥离模型混入正文的思考链（MiniMax、DeepSeek-R1、Qwen thinking、网关转译等） */
export function stripThinkingArtifactsFromText(text: string): string {
  let result = text.replace(/\r\n/g, '\n')
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    result = result.replace(pattern, '')
  }
  result = result.replace(DS_THINK_BLOCK, '')
  // DeepSeek / 部分网关：正文前的  块（含未闭合）
  result = result.replace(DS_THINK_LEAD, '')
  if (THINKING_OPEN_TAG.test(result.trim())) {
    result = result.replace(/^<(?:redacted_thinking|thinking|think|reasoning)\b[^>]*>[\s\S]*/i, '')
  }
  if (DS_THINK_OPEN.test(result.trim())) {
    result = result.replace(new RegExp(`^${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*`, 'i'), '')
  }
  return result.trim()
}

const THINKING_LEAK_ENGLISH = /\b(?:The user wants me to|Let me (?:analyze|re-read|think)|Critical conflicts|I need to resolve|Wait, this is Chapter)\b/i
const THINKING_LEAK_CN_META = /^(?:【任务理解】|让我仔细分析|以下是(?:思考|分析))/m

/** 判定文本是否仍为模型思考链/英文任务分析（剥离标签后仍可能残留） */
export function looksLikeModelThinkingLeak(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (THINKING_OPEN_TAG.test(t) || DS_THINK_OPEN.test(t)) return true
  if (THINKING_LEAK_ENGLISH.test(t)) return true
  if (THINKING_LEAK_CN_META.test(t)) return true
  const latin = (t.match(/[A-Za-z]/g) || []).length
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length
  if (latin >= 120 && cjk < 40) return true
  if (latin > 0 && cjk === 0 && latin >= 60) return true
  return false
}

/** 剥离思考链并丢弃仍为思考/英文分析的片段 */
export function sanitizeModelCreativeOutput(text: string): string {
  const stripped = stripThinkingArtifactsFromText(text)
  if (!stripped || looksLikeModelThinkingLeak(stripped)) return ''
  return stripped
}

function rawMessageContentString(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  const content = msg.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>
        if (typeof p.text === 'string') return p.text
        if (typeof p.content === 'string') return p.content
      }
      return ''
    }).join('')
  }
  return ''
}

/** 流式输出：跳过思考块，仅向下游 yield 正文增量 */
export function createThinkingStreamFilter() {
  let pending = ''
  let insideThinking = false

  const tryCloseThinking = (): boolean => {
    const close = pending.match(THINKING_CLOSE_TAG)
    if (!close || close.index == null) return false
    pending = pending.slice(close.index + close[0].length)
    insideThinking = false
    return true
  }

  return {
    push(raw: string): string {
      if (!raw) return ''
      pending += raw
      let emit = ''

      while (pending.length > 0) {
        if (insideThinking) {
          if (!tryCloseThinking()) break
          continue
        }

        const trimmed = pending.replace(/^\s+/, '')
        const lead = pending.length - trimmed.length

        if (THINKING_OPEN_TAG.test(trimmed)) {
          const tagEnd = trimmed.indexOf('>')
          if (tagEnd === -1) break
          pending = pending.slice(lead + tagEnd + 1)
          insideThinking = true
          continue
        }

        if (DS_THINK_OPEN.test(trimmed)) {
          insideThinking = true
          pending = pending.slice(lead + DS_OPEN.length)
          continue
        }

        const nextOpen = pending.search(/<(?:redacted_thinking|thinking|think|reasoning)\b/i)
        if (nextOpen > 0) {
          emit += pending.slice(0, nextOpen)
          pending = pending.slice(nextOpen)
          continue
        }

        emit += pending
        pending = ''
        break
      }

      return emit
    },
    flush(): string {
      if (insideThinking) {
        pending = ''
        insideThinking = false
        return ''
      }
      const out = stripThinkingArtifactsFromText(pending)
      pending = ''
      return out
    },
  }
}

/** 兼容 OpenAI / 阿里 / 部分网关的多段 content 结构 */
export function extractChatCompletionText(data: any): string {
  const tryMessage = (message: unknown): string => {
    if (!message || typeof message !== 'object') return ''
    const msg = message as Record<string, unknown>
    const content = msg.content
    if (typeof content === 'string') return stripThinkingArtifactsFromText(content)
    if (Array.isArray(content)) {
      const joined = content.map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') {
          const p = part as Record<string, unknown>
          const type = String(p.type || '').toLowerCase()
          if (type === 'thinking' || type === 'reasoning' || type === 'reasoning_content') return ''
          if (typeof p.text === 'string') return p.text
          if (typeof p.content === 'string') return p.content
        }
        return ''
      }).join('').trim()
      return stripThinkingArtifactsFromText(joined)
    }
    if (typeof msg.text === 'string') return stripThinkingArtifactsFromText(msg.text)
    return ''
  }

  const choice = data?.choices?.[0]
  const fromChoice = tryMessage(choice?.message)
  if (fromChoice) return fromChoice
  if (typeof choice?.text === 'string' && choice.text.trim()) {
    return stripThinkingArtifactsFromText(choice.text)
  }

  const fromAli = tryMessage(data?.output?.choices?.[0]?.message)
  if (fromAli) return fromAli
  if (typeof data?.output?.text === 'string' && data.output.text.trim()) {
    return stripThinkingArtifactsFromText(data.output.text)
  }

  return ''
}

function messageHasReasoningOnly(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false
  const msg = message as Record<string, unknown>
  const reasoning = msg.reasoning_content ?? msg.reasoning
  const rawContent = rawMessageContentString(message)
  const sanitized = sanitizeModelCreativeOutput(rawContent)
  const hasUsableContent = sanitized.length > 0
  if (hasUsableContent) return false
  if (typeof reasoning === 'string' && reasoning.length > 20) return true
  if (rawContent.trim().length > 20 && THINKING_OPEN_TAG.test(rawContent.trim())) return true
  if (rawContent.trim().length > 20 && looksLikeModelThinkingLeak(rawContent)) return true
  return false
}

function describeEmptyCompletion(data: any, model: string, requestedMaxTokens?: number, cfg?: AIConfig): string {
  const choice = data?.choices?.[0]
  const finish = choice?.finish_reason || choice?.finishReason || 'unknown'
  const usage = data?.usage
  const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens
  const completionTokens = usage?.completion_tokens ?? usage?.output_tokens

  const stats: string[] = []
  if (promptTokens != null) stats.push(`prompt≈${promptTokens}`)
  if (completionTokens != null) stats.push(`completion=${completionTokens}`)
  if (requestedMaxTokens != null) stats.push(`max_tokens=${requestedMaxTokens}`)

  const statHint = stats.length ? `（${stats.join('，')}）` : ''
  const prefix = `模型 ${model} 未返回正文${statHint}`

  if (messageHasReasoningOnly(choice?.message)) {
    if (cfg && isMiniMaxTextConfig(cfg)) {
      return `${prefix}：MiniMax 思考过程占满输出配额（已请求 reasoning_split + thinking.type=disabled）。请提高 max_completion_tokens（建议 8192+）`
    }
    return `${prefix}：输出 token 被推理/思考过程占满，正文 content 为空。请提高 max_tokens（建议 16384+）`
  }

  if (finish === 'length') {
    const hitOutputCap = requestedMaxTokens != null
      && completionTokens != null
      && completionTokens >= requestedMaxTokens - 8
    if (hitOutputCap) {
      return `${prefix}：已达输出上限 max_tokens=${requestedMaxTokens}，与输入 prompt 大小无关。小说单章建议 8192～16384`
    }
    if (promptTokens != null && promptTokens > 120_000) {
      return `${prefix}：输入 prompt 过长导致截断（finish_reason=length）`
    }
    return `${prefix}：生成在 length 处结束，请提高 max_tokens 或检查网关是否截断输出`
  }

  if (finish === 'content_filter') {
    return `${prefix}：内容被安全策略过滤`
  }
  return `${prefix}，请稍后重试或更换模型`
}

/** 长文创作：默认关闭 thinking；开启后交给模型/网关默认行为 */
function buildChatCompletionExtraBody(cfg: AIConfig): Record<string, unknown> {
  const provider = cfg.provider.toLowerCase()
  const model = cfg.model.toLowerCase()
  const settings = parseConfigSettings(cfg.settings)
  const extra: Record<string, unknown> = {}

  // 用户自定义 extraBody 先合并；关思考时在后面强制覆盖，避免 extraBody 误开 enable_thinking
  if (settings.extraBody && typeof settings.extraBody === 'object' && !Array.isArray(settings.extraBody)) {
    Object.assign(extra, settings.extraBody as Record<string, unknown>)
  }

  const thinkingEnabled = resolveThinkingEnabled(settings)

  if (!thinkingEnabled) {
    if (!isMiniMaxTextConfig(cfg)) {
      extra.enable_thinking = false
    }

    if (provider === 'ali') {
      extra.enable_thinking = false
    }

    const reasoningLike = /reasoner|thinking|deepseek-v[34]|deepseek-r1|r1-|o[134]-|gpt-5|gemini.*thinking/i.test(model)
    if (reasoningLike && !isMiniMaxTextConfig(cfg)) {
      extra.enable_thinking = false
      extra.thinking = { type: 'disabled' }
    }
  }

  return extra
}

function buildChatCompletionRequestBody(
  cfg: AIConfig,
  messages: ChatMessage[],
  options: ChatCompletionOptions,
): Record<string, unknown> {
  const settings = parseConfigSettings(cfg.settings)
  const thinkingEnabled = resolveThinkingEnabled(settings)
  const maxTokens = options.maxTokens ?? 8192
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: options.temperature ?? 0.75,
    max_tokens: maxTokens,
    ...buildChatCompletionExtraBody(cfg),
  }
  applyMiniMaxTextRequestParams(body, cfg, thinkingEnabled)
  return body
}

async function chatCompletionTextOnce(
  messages: ChatMessage[],
  options: ChatCompletionOptions,
  cfg: AIConfig,
): Promise<{ text: string; data: any }> {
  const base = getTextProviderBaseUrl(cfg).replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const maxTokens = options.maxTokens ?? 8192
  const requestBody = buildChatCompletionRequestBody(cfg, messages, options)
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })
  const raw = await res.text()
  let data: any
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(raw.slice(0, 200) || `AI 响应无效 (${res.status})`)
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 300) || `AI 请求失败 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  const text = sanitizeModelCreativeOutput(extractChatCompletionText(data))
  if (!text) {
    logTaskWarn('AI', 'chat-completion-empty', {
      model: cfg.model,
      finish: data?.choices?.[0]?.finish_reason,
      maxTokens,
      promptTokens: data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.completion_tokens,
      hasReasoning: messageHasReasoningOnly(data?.choices?.[0]?.message),
    })
    throw new Error(describeEmptyCompletion(data, cfg.model, maxTokens, cfg))
  }
  return { text: text.trim(), data }
}

export async function chatCompletionText(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const cfg = await getTextConfig(options.billing ? {
    userId: options.billing.userId,
    role: options.billing.role,
  } : undefined)
  const maxAttempts = 2
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { text, data } = await chatCompletionTextOnce(messages, options, cfg)
      await maybeChargeText(cfg, messages, text, data?.usage, options.billing)
      return text
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err?.message || err))
      const retriable = lastErr.message.includes('未返回正文')
        || lastErr.message.includes('思考链')
        || lastErr.message.includes('英文分析')
        || isTransientNetworkError(lastErr)
      if (retriable && attempt < maxAttempts) {
        logTaskWarn('AI', 'chat-completion-retry', {
          attempt,
          model: cfg.model,
          error: lastErr.message,
        })
        await sleep(1000 * attempt)
        continue
      }
      throw lastErr
    }
  }
  throw lastErr || new Error('模型未返回正文，请稍后重试')
}

/** OpenAI 兼容 /completions：echo + logprobs，用于困惑度检测 */
export async function completionPromptLogprobs(
  prompt: string,
  options: ChatCompletionOptions = {},
): Promise<{ perplexity: number; tokenCount: number; meanLogprob: number }> {
  const cfg = await getTextConfig(options.billing ? {
    userId: options.billing.userId,
    role: options.billing.role,
  } : undefined)
  const model = options.model || cfg.model
  const base = getTextProviderBaseUrl(cfg).replace(/\/+$/, '')
  const url = `${base}/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      max_tokens: 0,
      echo: true,
      logprobs: 1,
      temperature: 0,
    }),
  })
  const raw = await res.text()
  let data: any
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(raw.slice(0, 200) || `AI 响应无效 (${res.status})`)
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 300) || `AI 请求失败 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  const tokenLogprobs = data?.choices?.[0]?.logprobs?.token_logprobs as (number | null)[] | undefined
  if (!Array.isArray(tokenLogprobs)) {
    throw new Error('当前文本模型未返回 logprobs，无法计算困惑度')
  }
  const valid = tokenLogprobs.filter((x): x is number => x !== null && Number.isFinite(x))
  if (valid.length < 8) {
    throw new Error('logprobs 样本过少，无法计算困惑度')
  }
  const meanLogprob = valid.reduce((a, b) => a + b, 0) / valid.length
  const perplexity = Math.exp(-meanLogprob)

  await maybeChargeText(cfg, [{ role: 'user', content: prompt }], '', data?.usage, options.billing)

  return { perplexity, tokenCount: valid.length, meanLogprob }
}

function logprobExtraBody(cfg: AIConfig): Record<string, unknown> {
  if (cfg.provider.toLowerCase() === 'ali') {
    return { enable_thinking: false }
  }
  return {}
}

function extractChatContentLogprobs(data: any): number[] {
  const choice = data?.choices?.[0]
  if (!choice) return []

  const content = choice?.logprobs?.content
  if (Array.isArray(content)) {
    const fromContent = content
      .map((item: { logprob?: number }) => item?.logprob)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    if (fromContent.length > 0) return fromContent
  }

  const tokenLogprobs = choice?.logprobs?.token_logprobs
  if (Array.isArray(tokenLogprobs)) {
    return tokenLogprobs.filter((x): x is number => x !== null && Number.isFinite(x))
  }

  return []
}

function splitForContinuationScoring(text: string, targetSegments = 5): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parts = trimmed.split(/(?<=[。！？…])/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= targetSegments) {
    const bucketSize = Math.ceil(parts.length / targetSegments)
    const segments: string[] = []
    for (let i = 0; i < parts.length; i += bucketSize) {
      segments.push(parts.slice(i, i + bucketSize).join(''))
    }
    return segments.filter(s => countNovelChars(s) >= 8)
  }
  const chars = [...trimmed]
  const segLen = Math.max(80, Math.ceil(chars.length / targetSegments))
  const segments: string[] = []
  for (let i = 0; i < chars.length; i += segLen) {
    segments.push(chars.slice(i, i + segLen).join(''))
  }
  return segments.filter(s => countNovelChars(s) >= 8)
}

function perplexityFromLogprobs(logprobs: number[]): { perplexity: number; tokenCount: number; meanLogprob: number } {
  if (logprobs.length < 8) {
    throw new Error('logprobs 样本过少，无法计算困惑度')
  }
  const meanLogprob = logprobs.reduce((a, b) => a + b, 0) / logprobs.length
  return { perplexity: Math.exp(-meanLogprob), tokenCount: logprobs.length, meanLogprob }
}

async function fetchChatContinuationLogprobs(
  cfg: AIConfig,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<{ logprobs: number[]; output: string; usage: any }> {
  const base = getTextProviderBaseUrl(cfg).replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0,
      logprobs: true,
      top_logprobs: 1,
      ...logprobExtraBody(cfg),
    }),
  })
  const raw = await res.text()
  let data: any
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(raw.slice(0, 200) || `AI 响应无效 (${res.status})`)
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 300) || `AI 请求失败 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  const logprobs = extractChatContentLogprobs(data)
  if (logprobs.length === 0) {
    throw new Error(`模型 ${model} 未返回 logprobs`)
  }
  const output = extractChatCompletionText(data)
  return { logprobs, output, usage: data?.usage }
}

/** Chat 模型：分段续写并收集生成 token 的 logprobs（适配 Qwen 等仅支持 chat 的接口） */
export async function chatContinuationLogprobs(
  text: string,
  options: ChatCompletionOptions = {},
): Promise<{ perplexity: number; tokenCount: number; meanLogprob: number }> {
  const cfg = await getTextConfig(options.billing ? {
    userId: options.billing.userId,
    role: options.billing.role,
  } : undefined)
  const model = options.model || cfg.model
  const segments = splitForContinuationScoring(text, 4)
  if (segments.length < 2) {
    throw new Error('正文过短，无法进行困惑度续写分析')
  }

  const allLogprobs: number[] = []
  let prefix = segments[0]

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]
    const segChars = countNovelChars(segment)
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: '你是小说续写助手。紧接上文续写正文，不要解释、不要标题、不要列表。',
      },
      {
        role: 'user',
        content: `请紧接以下小说正文续写（保持风格与人称一致）：\n\n${prefix}`,
      },
    ]
    const maxTokens = Math.min(512, Math.max(48, Math.round(segChars * 2)))
    const { logprobs, output, usage } = await fetchChatContinuationLogprobs(cfg, model, messages, maxTokens)
    allLogprobs.push(...logprobs)
    await maybeChargeText(cfg, messages, output, usage, options.billing)
    prefix += segment
  }

  return perplexityFromLogprobs(allLogprobs)
}

/** 优先 completions echo；Chat-only 模型自动改用续写 logprobs；多模型依次尝试 */
export async function promptLogprobs(
  text: string,
  options: ChatCompletionOptions = {},
): Promise<{ perplexity: number; tokenCount: number; meanLogprob: number; model: string }> {
  const { cfg, models, settings } = await getTextConfigWithModels()
  const candidates = buildPerplexityModelCandidates(cfg, models, settings)
  if (candidates.length === 0) throw new Error('未配置可用于困惑度检测的文本模型')

  let lastErr: Error | null = null
  for (const model of candidates) {
    const modelOptions = { ...options, model }
    try {
      try {
        const result = await completionPromptLogprobs(text, modelOptions)
        return { ...result, model }
      } catch (completionsErr: any) {
        logTaskWarn('AI', 'perplexity-chat-fallback', { model, error: completionsErr?.message })
        const result = await chatContinuationLogprobs(text, modelOptions)
        return { ...result, model }
      }
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err?.message || err))
      logTaskWarn('AI', 'perplexity-model-failed', { model, error: lastErr.message })
    }
  }

  throw new Error(
    lastErr?.message
      || '困惑度检测失败：请在文本服务配置中指定支持 logprobs 的模型（如 qwen-plus-2025-04-28），qwen3.5-plus 不支持',
  )
}

/** OpenAI 兼容 SSE 流式补全，逐段 yield 文本增量（已过滤 reasoning / thinking） */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): AsyncGenerator<string> {
  const cfg = await getTextConfig(options.billing ? {
    userId: options.billing.userId,
    role: options.billing.role,
  } : undefined)
  const base = getTextProviderBaseUrl(cfg).replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const body = buildChatCompletionRequestBody(cfg, messages, options)
  body.stream = true
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const raw = await res.text()
    let data: any
    try { data = raw ? JSON.parse(raw) : {} } catch { data = {} }
    const msg = data?.error?.message || data?.message || raw.slice(0, 300) || `AI 请求失败 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('模型未返回流式响应')

  const decoder = new TextDecoder()
  let buffer = ''
  const thinkFilter = createThinkingStreamFilter()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const choice = json?.choices?.[0]
        const delta = choice?.delta
        // 忽略 reasoning 字段（MiniMax reasoning_split、DeepSeek-R1、Qwen 等）
        if (delta?.reasoning_content || delta?.reasoning || delta?.reasoning_details) continue
        const pieces = [
          delta?.content,
          delta?.text,
          choice?.message?.content,
          choice?.text,
        ].filter((p): p is string => typeof p === 'string' && p.length > 0)
        for (const piece of pieces) {
          const cleaned = thinkFilter.push(piece)
          if (cleaned) yield cleaned
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }
  const tail = sanitizeModelCreativeOutput(thinkFilter.flush())
  if (tail) yield tail
}

export async function getAudioConfig(opts?: ConfigResolveOpts): Promise<AIConfig> {
  const { config } = await resolveUserServiceConfig('audio', opts)
  return config
}

export async function getAudioConfigById(id?: number | null, opts?: ConfigResolveOpts): Promise<AIConfig> {
  const { config } = await resolveUserServiceConfig('audio', { ...opts, configId: id ?? null })
  return config
}

export async function getConfigById(id: number): Promise<AIConfig | null> {
  const row = await aiConfigsRepo.findServiceConfigById(id)
  if (!row || !row.isActive) {
    logTaskWarn('AIConfig', 'config-by-id-missing', { configId: id })
    return null
  }
  const models = row.model ? JSON.parse(row.model) : []
  logTaskProgress('AIConfig', 'config-by-id-selected', {
    configId: id,
    provider: row.provider,
    model: models[0] || '',
    serviceType: row.serviceType,
  })
  return {
    id: row.id,
    serviceType: row.serviceType as ServiceType,
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: models[0] || '',
    settings: row.settings,
  }
}
