/**
 * AI 服务抽象层 — 从数据库配置中获取 provider 和 API key
 */
import * as aiConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import { logTaskProgress, logTaskWarn } from '../../common/task/task-logger.js'
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { joinProviderUrl } from './adapters/url.js'
import {
  modelFamily,
  sameFamilyDetect,
} from '../../common/novel/novel-model-family.js'
import { chargeTextUsage, parseConfigSettings, resolveThinkingEnabled, resolveTokenUsage } from '../credits/credits.js'
import { applyMiniMaxTextRequestParams, isMiniMaxTextConfig } from './minimax-text.js'
import {
  applyKimiFixedSamplingOmit,
  applyKimiK3ThinkingGuard,
  isKimiFixedSamplingModel,
  isKimiK3FamilyModel,
} from './kimi-text.js'
import { fetchWithRetry, isTransientNetworkError } from '../../common/http/fetch-retry.js'
import {
  formatTextApiError,
  isTextProviderSensitiveError,
  TEXT_SENSITIVE_RETRY_STEER,
} from '../../common/ai/text-api-errors.js'
import { resolveUserServiceConfig } from './user-ai-config-resolve.js'
import { getUserTextAuditModelSettings, resolveTextAuditAiConfig } from './text-audit-model.js'

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
export {
  getUserTextAuditModelSettings,
  saveUserTextAuditModelSettings,
  isTextAuditModelActive,
} from './text-audit-model.js'
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

/**
 * 审/判用文本配置：启用独立审核模型时，解析到「该型号所属」的文本服务行（正确的 provider/key）；
 * 未启用 / 未配置 / 找不到对应服务 → 回退写作文本配置。
 */
export async function getTextAuditConfig(opts?: ConfigResolveOpts): Promise<AIConfig> {
  const cfg = await getTextConfig(opts)
  if (!opts?.userId) return cfg
  const audit = await getUserTextAuditModelSettings(opts.userId)
  if (!audit.enabled || !audit.model) return cfg

  const resolved = await resolveTextAuditAiConfig(audit.model, cfg.provider)
  if (!resolved) {
    logTaskWarn('AIConfig', 'text-audit-model-unresolved', {
      userId: opts.userId,
      model: audit.model,
      fallback: cfg.model,
    })
    // 找不到对应服务时不要硬套到写作通道（会触发「model not found」）
    return cfg
  }
  return resolved
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
  return rowToTextConfigBundle(active)
}

function rowToTextConfigBundle(active: {
  id: number
  provider: string | null
  baseUrl: string
  apiKey: string
  model: string | null
  settings: string | Record<string, unknown> | null
}): {
  cfg: AIConfig
  models: string[]
  settings: Record<string, unknown>
} {
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

/** 某文本服务行是否可能承载指定困惑度型号（按厂商/根地址启发式） */
export function textConfigCanHostPerplexityModel(args: {
  provider: string
  baseUrl: string
  models?: string[]
  targetModel: string
}): boolean {
  const target = (args.targetModel || '').trim()
  if (!target) return false
  if ((args.models || []).some((m) => m.trim() === target)) return true
  const family = modelFamily(target)
  const p = (args.provider || '').toLowerCase()
  const u = (args.baseUrl || '').toLowerCase()
  if (family === 'qwen') return p === 'ali' || /dashscope|aliyun/.test(u)
  if (family === 'deepseek') return p === 'deepseek' || /deepseek/.test(u)
  if (family === 'openai') return p === 'openai' || /openai\.com|azure/.test(u)
  if (family === 'anthropic') return p === 'anthropic' || /anthropic/.test(u)
  if (family === 'zhipu') return p === 'zhipu' || /bigmodel|zhipu/.test(u)
  return false
}

/**
 * 困惑度专用：写作配置可指定异系「困惑度检测模型」，须改走能承载该型号的文本服务
 *（例如 DeepSeek 写作 + qwen-plus 检测 → 使用阿里云 dashscope 配置的 key/根地址）。
 */
export async function getPerplexityConfigWithModels(): Promise<{
  cfg: AIConfig
  models: string[]
  settings: Record<string, unknown>
  writingProvider: string
  perplexityModel: string
}> {
  const rows = (await aiConfigsRepo.listServiceConfigsByType('text'))
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const writingRow = rows[0]
  if (!writingRow) throw new Error('No active text AI config')

  const writingBundle = rowToTextConfigBundle(writingRow)
  const pplModel = typeof writingBundle.settings.perplexityModel === 'string'
    ? writingBundle.settings.perplexityModel.trim()
    : ''

  if (!pplModel) {
    return {
      ...writingBundle,
      writingProvider: writingBundle.cfg.provider,
      perplexityModel: '',
    }
  }

  const hostArgs = (r: typeof writingRow) => {
    const models = r.model ? JSON.parse(r.model) : []
    const modelList = Array.isArray(models)
      ? models.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
      : []
    return {
      provider: r.provider || '',
      baseUrl: r.baseUrl || '',
      models: modelList,
      targetModel: pplModel,
    }
  }

  let hostRow = writingRow
  if (!textConfigCanHostPerplexityModel(hostArgs(writingRow))) {
    const better = rows.find((r) => textConfigCanHostPerplexityModel(hostArgs(r)))
    if (!better) {
      throw new Error(
        `困惑度模型「${pplModel}」无法通过当前文本服务（${writingRow.provider} / ${writingRow.baseUrl}）调用。请启用可承载该型号的文本配置（如阿里云 DashScope），或把困惑度模型改成当前服务商支持的型号。`,
      )
    }
    hostRow = better
    logTaskWarn('AI', 'perplexity-host-reroute', {
      writingProvider: writingRow.provider,
      writingBaseUrl: writingRow.baseUrl,
      hostProvider: better.provider,
      hostBaseUrl: better.baseUrl,
      perplexityModel: pplModel,
    })
  }

  const hostBundle = rowToTextConfigBundle(hostRow)
  // 候选仍以「写作配置里填写的困惑度模型」为准
  return {
    cfg: hostBundle.cfg,
    models: hostBundle.models,
    settings: {
      ...hostBundle.settings,
      perplexityModel: pplModel,
    },
    writingProvider: writingBundle.cfg.provider,
    perplexityModel: pplModel,
  }
}

/** 启发式：哪些型号更可能支持 logprobs（仅作排序参考，不再注入未配置的型号） */
function supportsLogprobsHeuristic(model: string): boolean {
  const m = model.toLowerCase()
  // qwen3.5/3.7/3.8 常不支持 OpenAI compat completions/logprobs
  if (/qwen3\.(5|7|8)|qwen3-[578]|qwen-max|vl|omni|tts/i.test(m)) return false
  // DeepSeek V3/V4 flash 等常不返回 chat logprobs
  if (/deepseek.*flash|deepseek-v[34]|deepseek-reasoner/i.test(m)) return false
  // kimi-k3 / k2.5+ 官方不支持自定义 logprobs
  if (/kimi-k3|kimi-k2\.[567]/.test(m)) return false
  if (/qwen-plus|qwen-turbo|qwen3-(?!5|7|8)/i.test(m)) return true
  return !/3\.[578]|thinking/i.test(m)
}

/**
 * DashScope OpenAI 兼容模式常不认带日期快照 ID（报 Unsupported model … compatibility mode）。
 * 展开为稳定别名：qwen-plus-2025-04-28 → qwen-plus。
 */
export function expandPerplexityModelAliases(model: string): string[] {
  const m = (model || '').trim()
  if (!m) return []
  const out: string[] = [m]
  const snap = m.match(/^(qwen-plus|qwen-turbo|qwen-flash|qwen-max)(?:-\d{4}-\d{2}-\d{2}|-latest)$/i)
  if (snap?.[1] && snap[1].toLowerCase() !== m.toLowerCase()) {
    out.push(snap[1])
  }
  return out
}

/** /completions 失败后是否应直接换下一候选（跳过 chat）。兼容模式「型号不支持」应改试 chat。 */
export function shouldSkipChatAfterCompletionsFail(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '')
  if (/unsupported model[^]*compatibility mode/i.test(msg)) return false
  if (/unsupported model/i.test(msg) && /compatibility mode/i.test(msg)) return false
  return /does not support.*logprobs|logprobs.*not support|not support.*logprobs/i.test(msg)
}

/**
 * 困惑度检测候选模型：只使用设置中的「困惑度检测模型」+ 文本服务已配置的模型列表。
 * 不再硬编码 qwen-plus / qwen-turbo 等回退型号。
 * 若已明确填写困惑度模型，不再追加异系写作主模型（避免 DeepSeek 无 logprobs 盖掉真实错误）。
 */
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
  if (fromSettings.trim()) {
    for (const alias of expandPerplexityModelAliases(fromSettings.trim())) push(alias)
    for (const m of models) {
      if (supportsLogprobsHeuristic(m) && sameFamilyDetect(fromSettings, m)) push(m)
    }
    return ordered
  }

  // 配置列表中更可能支持 logprobs 的优先
  for (const m of models) {
    if (supportsLogprobsHeuristic(m)) push(m)
  }
  if (cfg.model && supportsLogprobsHeuristic(cfg.model)) push(cfg.model)

  // 其余已配置型号（含主模型）作为兜底，仍不引入列表外硬编码名
  for (const m of models) push(m)
  if (cfg.model) push(cfg.model)

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
  /** 覆盖默认写作文本配置（困惑度异系宿主） */
  config?: AIConfig
  /** 显式开启思考；MiniMax 默认强制关闭（避免 reasoning 有、content 空） */
  enableThinking?: boolean
  /**
   * MiniMax reasoning_split；默认 true。
   * 空正文重试时改为 false，使输出进入 content（含 think 标签时再剥离）。
   */
  minimaxReasoningSplit?: boolean
  /**
   * content 空时从 reasoning 抢救的策略：
   * - auto：先 JSON 再叙事（写作）
   * - json：只接受可解析审校/结构化 JSON（审校调用）
   */
  salvageMode?: 'auto' | 'json'
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

/** 工具/记忆等非正文 XML（常见于网关/RAG 泄漏） */
const TOOL_MEMORY_BLOCK_PATTERNS: RegExp[] = [
  /<memory\b[^>]*>[\s\S]*?<\/memory>/gi,
  /<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi,
  /<tool_result\b[^>]*>[\s\S]*?<\/tool_result>/gi,
  /<function_call\b[^>]*>[\s\S]*?<\/function_call>/gi,
  // 模型幻觉的笔记本/扩展伪标签，如 <jupytext.ext.vars>{...}</jupytext.ext.vars>
  /<jupytext(?:\.[a-z0-9_-]+)+(?:\s[^>]*)?>[\s\S]*?<\/jupytext(?:\.[a-z0-9_-]+)+>/gi,
  /<[a-z][\w-]*\.(?:ext|vars|meta|tool|data)\b[^>]*>[\s\S]*?<\/[a-z][\w.-]*>/gi,
]

const THINKING_OPEN_TAG = /^<(?:redacted_thinking|thinking|think|reasoning)\b[^>]*>/i
const THINKING_CLOSE_TAG = /<\/(?:redacted_thinking|thinking|think|reasoning)>|<\/think>/i
const DS_THINK_OPEN = new RegExp(`^${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i')
const DS_THINK_BLOCK = new RegExp(`${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${DS_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'gi')
const DS_THINK_LEAD = new RegExp(`^[\\s\\S]*?${DS_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n?`, 'i')

/** 去掉以拉丁字母为主的污染块（含中英夹杂时的英文长串） */
function stripLatinHeavyArtifacts(text: string): string {
  const parts = text.split(/(\n+)/)
  const cleaned = parts.map((part) => {
    if (!part || /^\n+$/.test(part)) return part
    const latin = (part.match(/[A-Za-z]/g) || []).length
    const cjk = (part.match(/[\u4e00-\u9fff]/g) || []).length
    if (latin >= 40 && cjk < 8) return ''
    if (latin >= 80 && latin > cjk * 2) return ''
    if (cjk >= 8 && latin >= 60) {
      // 句中突然出现大段英文/JSON：从首个长拉丁串截断
      return part.replace(/[A-Za-z][A-Za-z0-9_{}\[\]"':,\s.\\\/|<>/=-]{50,}/g, '')
    }
    return part
  }).join('')
  return cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 剥离模型混入正文的思考链（MiniMax、DeepSeek-R1、Qwen thinking、网关转译等） */
export function stripThinkingArtifactsFromText(text: string): string {
  let result = text.replace(/\r\n/g, '\n')
  for (const pattern of THINKING_BLOCK_PATTERNS) {
    result = result.replace(pattern, '')
  }
  for (const pattern of TOOL_MEMORY_BLOCK_PATTERNS) {
    result = result.replace(pattern, '')
  }
  // 未闭合的 memory / tool / jupytext 伪标签：从开标签起丢弃到文末
  result = result.replace(/<(?:memory|tool_call|tool_result|function_call)\b[^>]*>[\s\S]*$/gi, '')
  result = result.replace(/<jupytext(?:\.[a-z0-9_-]+)+(?:\s[^>]*)?>[\s\S]*$/gi, '')
  result = result.replace(/<[a-z][\w-]*\.(?:ext|vars|meta|tool|data)\b[^>]*>[\s\S]*$/gi, '')
  // 残留的成对/自闭合点号标签（正文不应出现）
  result = result.replace(/<\/?jupytext(?:\.[a-z0-9_-]+)+(?:\s[^>]*)?\/?>/gi, '')
  result = result.replace(/<\/?[a-z][\w-]*\.(?:ext|vars|meta|tool|data)\b[^>]*\/?>/gi, '')
  result = result.replace(DS_THINK_BLOCK, '')
  // DeepSeek / 部分网关：正文前的  块（含未闭合）
  result = result.replace(DS_THINK_LEAD, '')
  if (THINKING_OPEN_TAG.test(result.trim())) {
    result = result.replace(/^<(?:redacted_thinking|thinking|think|reasoning)\b[^>]*>[\s\S]*/i, '')
  }
  if (DS_THINK_OPEN.test(result.trim())) {
    result = result.replace(new RegExp(`^${DS_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*`, 'i'), '')
  }
  return stripLatinHeavyArtifacts(result)
}

const THINKING_LEAK_ENGLISH = /\b(?:The user wants me to|Let me (?:analyze|re-read|think)|Critical conflicts|I need to resolve|Wait, this is Chapter)\b/i
const THINKING_LEAK_CN_META = /^(?:【任务理解】|让我仔细分析|以下是(?:思考|分析))/m

/** 判定文本是否仍为模型思考链/英文任务分析（剥离标签后仍可能残留） */
export function looksLikeModelThinkingLeak(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (THINKING_OPEN_TAG.test(t) || DS_THINK_OPEN.test(t)) return true
  if (/<(?:memory|tool_call|tool_result|function_call)\b/i.test(t)) return true
  if (/<jupytext(?:\.[a-z0-9_-]+)+/i.test(t)) return true
  if (/<[a-z][\w-]*\.(?:ext|vars|meta|tool|data)\b/i.test(t)) return true
  if (THINKING_LEAK_ENGLISH.test(t)) return true
  if (THINKING_LEAK_CN_META.test(t)) return true
  const latin = (t.match(/[A-Za-z]/g) || []).length
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length
  if (latin >= 120 && cjk < 40) return true
  if (latin > 0 && cjk === 0 && latin >= 60) return true
  // 中文正文里夹大段英文（污染未剥净）
  if (cjk >= 40 && latin >= 100 && latin > cjk * 0.35) return true
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

/**
 * MiniMax 偶发把正文误放入 reasoning_content：仅当其像中文小说正文时才抢救。
 * 不含英文任务分析 / 润色计划。
 */
function extractCjkNarrativeFromMixed(text: string): string {
  const stripped = stripThinkingArtifactsFromText(text)
  const lines = stripped.split(/\n/)
  const keep: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) {
      if (keep.length && keep[keep.length - 1] !== '') keep.push('')
      continue
    }
    if (THINKING_LEAK_ENGLISH.test(t) || THINKING_LEAK_CN_META.test(t)) continue
    if (/^(?:任务理解|润色原则|输出前自检|我需要|首先分析|用户要求)/.test(t)) continue
    const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length
    const latin = (t.match(/[A-Za-z]/g) || []).length
    if (cjk < 6) continue
    if (latin > cjk * 0.5) continue
    keep.push(t)
  }
  return keep.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 从文本中按括号平衡抽出候选 JSON 对象（避免「第一个 { 到最后一个 }」截错） */
export function extractBalancedJsonObjectSlices(text: string, max = 12): string[] {
  if (!text?.trim()) return []
  const out: string[] = []
  const s = text
  for (let i = 0; i < s.length && out.length < max; i++) {
    if (s[i] !== '{') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < s.length; j++) {
      const ch = s[j]!
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') {
        inStr = true
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          out.push(s.slice(i, j + 1))
          i = j
          break
        }
      }
    }
  }
  return out
}

const AUDIT_JSON_KEY_RE = /"(?:score|passed|dimensions|conflicts|functions_hit|summary|reason)"\s*:/

/**
 * 抽出审校约定 JSON（含 score/passed/dimensions 等）。
 * 优先：可 JSON.parse 且带关键键；次选：带键的最大平衡对象（交给下游再修）。
 */
export function extractAuditJsonFromText(text: string): string {
  if (!text?.trim()) return ''
  const fenced = text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? text).trim()
  const slices = extractBalancedJsonObjectSlices(body)
  let bestLoose = ''
  for (const slice of slices) {
    if (!AUDIT_JSON_KEY_RE.test(slice)) continue
    try {
      const obj = JSON.parse(slice) as Record<string, unknown>
      if (obj && typeof obj === 'object' && ('score' in obj || 'passed' in obj || 'dimensions' in obj)) {
        return slice
      }
    } catch {
      if (slice.length > bestLoose.length) bestLoose = slice
    }
  }
  if (bestLoose) return bestLoose
  // 回退：旧逻辑（可能截错，仅当整体像审校 JSON）
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const slice = body.slice(start, end + 1)
    if (AUDIT_JSON_KEY_RE.test(slice)) return slice
  }
  return ''
}

/** 从混杂 reasoning 中抽出可解析 / 像审校结果的 JSON */
export function extractJsonBlobFromText(text: string): string {
  const audit = extractAuditJsonFromText(text)
  if (audit) {
    try {
      JSON.parse(audit)
      return audit
    } catch {
      if (AUDIT_JSON_KEY_RE.test(audit) && audit.length >= 40) return audit
    }
  }
  if (!text?.trim()) return ''
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return ''
  const slice = text.slice(start, end + 1).trim()
  try {
    JSON.parse(slice)
    return slice
  } catch {
    if (/"score"\s*:|"functions_hit"\s*:|"passed"\s*:|"conflicts"\s*:/.test(slice) && slice.length >= 40) {
      return slice
    }
    return ''
  }
}

export function salvageProseFromReasoningMessage(
  message: unknown,
  mode: 'auto' | 'json' = 'auto',
): string {
  if (!message || typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  const candidates: string[] = []
  for (const key of ['reasoning_content', 'reasoning'] as const) {
    const v = msg[key]
    if (typeof v === 'string' && v.trim()) candidates.push(v)
  }
  const details = msg.reasoning_details
  if (Array.isArray(details)) {
    for (const d of details) {
      if (typeof d === 'string') candidates.push(d)
      else if (d && typeof d === 'object' && typeof (d as { text?: string }).text === 'string') {
        candidates.push((d as { text: string }).text)
      }
    }
  }
  for (const raw of candidates) {
    // 优先：reasoning 末尾夹带的 JSON（关思考后 deepseek-v4 仍常把审校结果塞进 reasoning）
    const jsonBlob = mode === 'json' ? extractAuditJsonFromText(raw) : extractJsonBlobFromText(raw)
    if (jsonBlob) return jsonBlob
    if (mode === 'json') continue

    const cleaned = sanitizeModelCreativeOutput(raw)
    if (cleaned && cleaned.length >= 80) {
      const cjk = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length
      const punct = (cleaned.match(/[。！？「」]/g) || []).length
      if (cjk >= 60 && punct >= 2) return cleaned
    }
    // 审校/结构化：JSON 或短评常被塞进 reasoning
    if (cleaned && cleaned.length >= 40) {
      const looksJson = /^\s*[\{\[]/.test(cleaned) || /"[a-z_]+"\s*:/.test(cleaned)
      const cjk = (cleaned.match(/[\u4e00-\u9fff]/g) || []).length
      if (looksJson && (cjk >= 8 || cleaned.length >= 60)) return cleaned
    }
    // sanitize 过严时：从混杂 reasoning 里抽中文叙事块
    const narrative = extractCjkNarrativeFromMixed(raw)
    if (narrative.length >= 80) {
      const cjk = (narrative.match(/[\u4e00-\u9fff]/g) || []).length
      const punct = (narrative.match(/[。！？「」]/g) || []).length
      if (cjk >= 40 && punct >= 1 && !looksLikeModelThinkingLeak(narrative)) return narrative
    }
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
  if (Array.isArray(msg.reasoning_details) && msg.reasoning_details.length > 0) return true
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
    const underCap = requestedMaxTokens != null
      && completionTokens != null
      && completionTokens < requestedMaxTokens * 0.5
    if (cfg && isMiniMaxTextConfig(cfg)) {
      if (underCap) {
        return `${prefix}：MiniMax 只返回了 reasoning、content 为空（finish=${finish}）。将自动关闭 reasoning_split 重试；若仍失败请换非推理模型或检查网关是否忽略 thinking.disabled`
      }
      return `${prefix}：MiniMax 思考输出挤占正文（已请求 thinking.type=disabled）。请提高 max_completion_tokens 或换模型`
    }
    if (cfg && isDeepSeekV4FamilyModel(cfg.model)) {
      if (underCap) {
        return `${prefix}：已请求 thinking.disabled，但网关仍只返回 reasoning_content、content 为空（finish=${finish}）。属模型/代理未遵守关思考，非设置未关；将抢救 reasoning 或重试`
      }
      return `${prefix}：已请求 thinking.disabled，仍被 reasoning 占满。请换官方 DeepSeek 端点、换非 V4-flash，或提高 max_tokens`
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

function resolveRequestMaxTokens(cfg: AIConfig, options: ChatCompletionOptions): number {
  const raw = Number(options.maxTokens)
  let maxTokens = Number.isFinite(raw) && raw > 0 ? raw : 8192
  // MiniMax 偶发把少量 token 打进 reasoning：略留余量，但不再强制抬到 8192（会冲掉章节字数预算）
  if (isMiniMaxTextConfig(cfg) && maxTokens >= 1024) {
    maxTokens = Math.min(32768, Math.max(maxTokens, Math.round(maxTokens * 1.15) + 384))
  }
  // DeepSeek V4：关思考仍可能漏 reasoning；短调用 4096 不够稳，抬到至少 8192
  if (isDeepSeekV4FamilyModel(cfg.model) && maxTokens >= 512 && maxTokens < 8192) {
    maxTokens = Math.min(16384, Math.max(8192, maxTokens * 2))
  }
  return Math.min(32768, maxTokens)
}

function resolveThinkingForRequest(cfg: AIConfig, options: ChatCompletionOptions): boolean {
  // 显式开启才开；MiniMax 默认强制关（设置页误开 enableThinking 时也会被关掉）
  if (options.enableThinking === true) return true
  if (isMiniMaxTextConfig(cfg)) return false
  return resolveThinkingEnabled(parseConfigSettings(cfg.settings))
}

function buildChatCompletionRequestBody(
  cfg: AIConfig,
  messages: ChatMessage[],
  options: ChatCompletionOptions,
): Record<string, unknown> {
  const thinkingEnabled = resolveThinkingForRequest(cfg, options)
  const maxTokens = resolveRequestMaxTokens(cfg, options)
  const extra = buildChatCompletionExtraBody(cfg)
  // 禁止 extraBody 覆盖调用方的输出上限 / 思考开关（稍后按 thinkingEnabled 统一写回）
  delete extra.max_tokens
  delete extra.max_completion_tokens
  delete extra.thinking
  delete extra.enable_thinking
  delete extra.reasoning_split
  delete extra.reasoning_effort
  delete extra.thinking_budget
  const omitSampling = isKimiFixedSamplingModel(cfg.model)
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    ...(omitSampling ? {} : { temperature: options.temperature ?? 0.75 }),
    ...extra,
    max_tokens: maxTokens,
  }
  // extraBody 可能又塞回 temperature；固定采样型号必须再剥一次
  applyKimiFixedSamplingOmit(body, cfg)
  applyMiniMaxTextRequestParams(body, cfg, thinkingEnabled, {
    // 关思考时默认 false：部分网关仍产出 reasoning 且 content 空；开思考才默认拆分
    reasoningSplit: options.minimaxReasoningSplit != null
      ? options.minimaxReasoningSplit
      : thinkingEnabled,
  })
  // MiniMax 已在 applyMiniMax 写 thinking；DeepSeek/Ali/网关推理模型须在此补回，否则删 extra 后等于未关思考
  // kimi-k3 始终开思考，不可写 disabled
  if (!thinkingEnabled && !isMiniMaxTextConfig(cfg) && !isKimiK3FamilyModel(cfg.model)) {
    applyNonMiniMaxThinkingDisable(body, cfg)
  }
  applyKimiK3ThinkingGuard(body, cfg)
  return body
}

/** DeepSeek V4：默认开思考；关思考后部分网关仍把正文塞进 reasoning_content */
export function isDeepSeekV4FamilyModel(model: string): boolean {
  return /deepseek-v[34]|deepseek-chat|deepseek-reasoner/i.test(model || '')
}

/** DeepSeek-V4 / reasoner / 阿里等：把关思考写进最终请求体 */
export function applyNonMiniMaxThinkingDisable(body: Record<string, unknown>, cfg: AIConfig): void {
  const provider = cfg.provider.toLowerCase()
  const model = cfg.model.toLowerCase()
  // 避免 extraBody / 兼容字段把思考又打开
  delete body.reasoning_effort
  delete body.thinking_budget
  body.enable_thinking = false
  const reasoningLike = /reasoner|thinking|deepseek-v[34]|deepseek-r1|r1-|o[134]-|gpt-5|gemini.*thinking/i.test(model)
  const deepseekFamily = provider === 'deepseek' || isDeepSeekV4FamilyModel(model)
  if (reasoningLike || provider === 'ali' || deepseekFamily) {
    // Chat Completions 官方：thinking.type=disabled
    body.thinking = { type: 'disabled' }
  }
  if (deepseekFamily) {
    // Responses / 部分兼容网关：reasoning.effort=none 才真正关思考
    body.reasoning = { effort: 'none' }
  } else {
    delete body.reasoning
  }
}

/** 从流式 delta 取出应展示的正文片段（reasoning 仅累计，不挡 content） */
export function extractStreamContentPieces(delta: Record<string, unknown> | null | undefined): string[] {
  if (!delta || typeof delta !== 'object') return []
  return [delta.content, delta.text]
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
}

export function appendStreamReasoning(acc: string, delta: Record<string, unknown> | null | undefined): string {
  if (!delta || typeof delta !== 'object') return acc
  let next = acc
  for (const key of ['reasoning_content', 'reasoning'] as const) {
    const v = delta[key]
    if (typeof v === 'string' && v) next += v
  }
  const details = delta.reasoning_details
  if (Array.isArray(details)) {
    for (const d of details) {
      if (typeof d === 'string') next += d
      else if (d && typeof d === 'object' && typeof (d as { text?: string }).text === 'string') {
        next += (d as { text: string }).text
      }
    }
  }
  return next
}

async function chatCompletionTextOnce(
  messages: ChatMessage[],
  options: ChatCompletionOptions,
  cfg: AIConfig,
): Promise<{ text: string; data: any }> {
  const base = getTextProviderBaseUrl(cfg).replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const maxTokens = resolveRequestMaxTokens(cfg, options)
  const requestBody = buildChatCompletionRequestBody(cfg, messages, { ...options, maxTokens })
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
    throw new Error(formatTextApiError(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
  let text = sanitizeModelCreativeOutput(extractChatCompletionText(data))
  const salvageMode = options.salvageMode === 'json' ? 'json' : 'auto'
  if (!text || (salvageMode === 'json' && !extractAuditJsonFromText(text))) {
    // 审校：content 若只是思考散文，仍须从 reasoning / content 抽 JSON
    const fromContent = salvageMode === 'json' ? extractAuditJsonFromText(extractChatCompletionText(data) || text) : ''
    const salvaged = fromContent
      || salvageProseFromReasoningMessage(data?.choices?.[0]?.message, salvageMode)
    if (salvaged) {
      logTaskWarn('AI', 'chat-completion-salvaged-reasoning', {
        model: cfg.model,
        chars: salvaged.length,
        salvageMode,
        from: fromContent ? 'content' : 'reasoning',
      })
      text = salvaged
    } else if (salvageMode === 'json') {
      text = ''
    }
  }
  if (!text) {
    logTaskWarn('AI', 'chat-completion-empty', {
      model: cfg.model,
      finish: data?.choices?.[0]?.finish_reason,
      maxTokens,
      promptTokens: data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.completion_tokens,
      hasReasoning: messageHasReasoningOnly(data?.choices?.[0]?.message),
      thinking: (requestBody as { thinking?: unknown }).thinking,
      reasoningSplit: (requestBody as { reasoning_split?: unknown }).reasoning_split,
    })
    throw new Error(describeEmptyCompletion(data, cfg.model, maxTokens, cfg))
  }
  return { text: text.trim(), data }
}

async function chatCompletionWithConfig(
  messages: ChatMessage[],
  options: ChatCompletionOptions,
  cfg: AIConfig,
): Promise<string> {
  const deepseekV4 = isDeepSeekV4FamilyModel(cfg.model)
  const maxAttempts = isMiniMaxTextConfig(cfg) || deepseekV4 ? 3 : 2
  let lastErr: Error | null = null
  let attemptOptions: ChatCompletionOptions = { ...options }
  let attemptMessages = messages

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { text, data } = await chatCompletionTextOnce(attemptMessages, attemptOptions, cfg)
      await maybeChargeText(cfg, attemptMessages, text, data?.usage, options.billing)
      return text
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err?.message || err))
      const sensitive = isTextProviderSensitiveError(lastErr)
      const retriable = lastErr.message.includes('未返回正文')
        || lastErr.message.includes('思考链')
        || lastErr.message.includes('英文分析')
        || isTransientNetworkError(lastErr)
        || sensitive
      if (retriable && attempt < maxAttempts) {
        const prev = resolveRequestMaxTokens(cfg, attemptOptions)
        // DeepSeek V4：空正文时直接抬到 ≥8192，并追加纠偏；避免 2048→3584 仍被 reasoning 占满
        const bumped = sensitive
          ? prev
          : deepseekV4
            ? Math.min(32768, Math.max(16384, prev * 2, prev + 4096))
            : Math.min(16384, Math.max(prev + 1536, Math.round(prev * 1.35)))
        // 关思考仍只吐 reasoning 时：后续轮次改为开思考，让最终 JSON/正文进 content
        const openThinking = !sensitive && deepseekV4 && attempt >= 1
        attemptOptions = {
          ...attemptOptions,
          maxTokens: bumped,
          enableThinking: openThinking ? true : false,
          minimaxReasoningSplit: false,
        }
        if (sensitive) {
          attemptMessages = [
            ...messages,
            { role: 'user', content: TEXT_SENSITIVE_RETRY_STEER },
          ]
        } else if ((isMiniMaxTextConfig(cfg) || deepseekV4) && attempt === 1) {
          attemptMessages = [
            ...messages,
            {
              role: 'user',
              content: deepseekV4
                ? (openThinking
                  ? '【系统纠偏】上一次 content 为空、仅有 reasoning。请保留简短思考，但必须在 content 中输出最终可用的简体中文正文或完整 JSON（含 score/passed/dimensions），禁止只写思考。'
                  : '【系统纠偏】上一次只输出了思考（reasoning），content 为空。请关闭思考，直接输出最终可用的简体中文正文或 JSON，不要思考过程、不要英文分析、不要 XML 标签。')
                : '【系统纠偏】上一次只输出了思考未输出正文。请直接输出最终可用的简体中文正文，不要思考过程、不要英文、不要 XML 标签。',
            },
          ]
        }
        logTaskWarn('AI', 'chat-completion-retry', {
          attempt,
          model: cfg.model,
          serviceType: cfg.serviceType || 'text',
          maxTokens: bumped,
          enableThinking: openThinking,
          reasoningSplit: false,
          sensitive,
          error: lastErr.message,
        })
        await sleep(800 * attempt)
        continue
      }
      throw new Error(formatTextApiError(lastErr.message))
    }
  }
  throw lastErr || new Error('模型未返回正文，请稍后重试')
}

export async function chatCompletionText(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const cfg = await getTextConfig(options.billing ? {
    userId: options.billing.userId,
    role: options.billing.role,
  } : undefined)
  return chatCompletionWithConfig(messages, options, cfg)
}

/** 审/判类调用：启用 text_audit 时用审校模型，否则回退写作模型 */
export async function chatCompletionTextAudit(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const cfg = await getTextAuditConfig(options.billing ? {
    userId: options.billing.userId,
    role: options.billing.role,
  } : undefined)
  // 审校只要约定 JSON：禁止把 reasoning 叙事散文当「成功正文」交给下游
  return chatCompletionWithConfig(messages, { ...options, salvageMode: 'json' }, cfg)
}

/** OpenAI 兼容 /completions：echo + logprobs，用于困惑度检测 */
export async function completionPromptLogprobs(
  prompt: string,
  options: ChatCompletionOptions = {},
): Promise<{ perplexity: number; tokenCount: number; meanLogprob: number }> {
  const cfg = options.config || await getTextConfig(options.billing ? {
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
  const cfg = options.config || await getTextConfig(options.billing ? {
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
  const { cfg, models, settings, perplexityModel } = await getPerplexityConfigWithModels()
  const candidates = buildPerplexityModelCandidates(cfg, models, settings)
  if (candidates.length === 0) {
    throw new Error(
      '未配置可用于困惑度检测的模型：请在文本服务设置中填写「困惑度检测模型」（须支持 logprobs，如 qwen-plus）',
    )
  }

  const preferChatFirst = cfg.provider.toLowerCase() === 'ali' || /dashscope|aliyun/i.test(cfg.baseUrl || '')

  let lastErr: Error | null = null
  for (const model of candidates) {
    const modelOptions = { ...options, model, config: cfg }
    try {
      if (preferChatFirst) {
        const result = await chatContinuationLogprobs(text, modelOptions)
        return { ...result, model }
      }
      try {
        const result = await completionPromptLogprobs(text, modelOptions)
        return { ...result, model }
      } catch (completionsErr: any) {
        logTaskWarn('AI', 'perplexity-chat-fallback', { model, error: completionsErr?.message })
        // 明确不支持 logprobs：换下一候选；「兼容模式不支持该型号」仍应改试 chat
        if (shouldSkipChatAfterCompletionsFail(completionsErr)) {
          throw completionsErr instanceof Error ? completionsErr : new Error(String(completionsErr?.message || completionsErr))
        }
        const result = await chatContinuationLogprobs(text, modelOptions)
        return { ...result, model }
      }
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err?.message || err))
      logTaskWarn('AI', 'perplexity-model-failed', {
        model,
        host: cfg.provider,
        baseUrl: cfg.baseUrl,
        configuredPerplexityModel: perplexityModel || undefined,
        error: lastErr.message,
      })
    }
  }

  throw new Error(
    lastErr?.message
      || '困惑度检测失败：请在文本服务设置中填写「困惑度检测模型」（须支持 logprobs，如 qwen-plus）；qwen3.5 / qwen3.7 通常不支持。DashScope 兼容模式请优先填 qwen-plus 而非带日期快照名。',
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
    throw new Error(formatTextApiError(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('模型未返回流式响应')

  const decoder = new TextDecoder()
  let buffer = ''
  const thinkFilter = createThinkingStreamFilter()
  let reasoningAcc = ''
  let yieldedChars = 0
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
        const delta = (choice?.delta && typeof choice.delta === 'object')
          ? choice.delta as Record<string, unknown>
          : null
        // 累计 reasoning 供末尾抢救；切勿因有 reasoning 就跳过整段（DeepSeek 常同包带 content）
        reasoningAcc = appendStreamReasoning(reasoningAcc, delta)
        const pieces = [
          ...extractStreamContentPieces(delta),
          ...(typeof choice?.message?.content === 'string' && choice.message.content
            ? [choice.message.content as string]
            : []),
          ...(typeof choice?.text === 'string' && choice.text ? [choice.text as string] : []),
        ]
        for (const piece of pieces) {
          const cleaned = thinkFilter.push(piece)
          if (cleaned) {
            yieldedChars += cleaned.length
            yield cleaned
          }
        }
      } catch {
        // 忽略无法解析的行
      }
    }
  }
  const tail = sanitizeModelCreativeOutput(thinkFilter.flush())
  if (tail) {
    yieldedChars += tail.length
    yield tail
  }
  if (yieldedChars < 80 && reasoningAcc.trim()) {
    const salvaged = salvageProseFromReasoningMessage({ reasoning_content: reasoningAcc })
    if (salvaged) {
      logTaskWarn('AI', 'chat-completion-stream-salvaged-reasoning', {
        model: cfg.model,
        chars: salvaged.length,
        yieldedChars,
      })
      yield salvaged
    }
  }
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
