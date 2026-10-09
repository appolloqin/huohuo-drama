/**
 * MiniMax 文本 Chat Completions 专用参数（OpenAI 兼容 /v1/chat/completions）
 *
 * 官方要点（MiniMax-M3）：
 * - 用 thinking.type = disabled | adaptive，勿用阿里/DeepSeek 的 enable_thinking
 * - reasoning_split=true 时思考进 reasoning_content / reasoning_details，content 仅正文
 * - reasoning_split=false 时思考以 <think> 混入 content（须后端剥离）
 * - 是否拆分由服务配置开关 minimaxReasoningSplit 控制（非型号写死）
 * - 新接入建议 max_completion_tokens，而非仅 max_tokens
 */
import { parseConfigSettings } from '../credits/credits.js'

export type MiniMaxTextConfig = {
  provider: string
  baseUrl: string
  model: string
  settings?: string | Record<string, unknown> | null
}

export function isMiniMaxTextConfig(cfg: MiniMaxTextConfig): boolean {
  const provider = (cfg.provider || '').toLowerCase()
  const base = (cfg.baseUrl || '').toLowerCase()
  const model = (cfg.model || '').toLowerCase()
  return provider === 'minimax'
    || /minimaxi?\.(com|io)/.test(base)
    || /minimax|abab/.test(model)
    || /^m2[\-.]|^m3[\-.]|minimax-m\d/i.test(model)
}

export function isMiniMaxM3Model(model: string): boolean {
  return /minimax-m3/i.test(model || '')
}

/** 是否为 M2.x（官方：无法关闭 thinking，只能靠 reasoning_split + 后端剥离） */
export function isMiniMaxM2Family(model: string): boolean {
  return /minimax-m2|abab/i.test(model || '') && !isMiniMaxM3Model(model)
}

/** M3.1-Flash：支持 reasoning_effort；省略时官方默认 max，长请求易拖过网关超时 */
export function isMiniMaxM31FlashModel(model: string): boolean {
  return /minimax-m3\.1.*flash|m3\.1-flash-preview/i.test(model || '')
}

export type MiniMaxReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const REASONING_EFFORT_SET = new Set<string>(['low', 'medium', 'high', 'xhigh', 'max'])

export function normalizeMiniMaxReasoningEffort(
  raw: unknown,
): MiniMaxReasoningEffort | undefined {
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  return REASONING_EFFORT_SET.has(v) ? (v as MiniMaxReasoningEffort) : undefined
}

/**
 * 解析配置中的 reasoning_split 开关。
 * - 显式 true/false：按配置
 * - 未配置：默认 true（M3.1-Flash-Preview 等要求 true；设置页可关）
 */
export function resolveMiniMaxReasoningSplit(
  settings: string | Record<string, unknown> | null | undefined,
  _thinkingEnabled?: boolean,
): boolean {
  const parsed = parseConfigSettings(settings)
  if (typeof parsed.minimaxReasoningSplit === 'boolean') {
    return parsed.minimaxReasoningSplit
  }
  return true
}

/**
 * 在最终请求体上写入 MiniMax 原生参数（须于 merge 完成后最后调用）
 */
export function applyMiniMaxTextRequestParams(
  body: Record<string, unknown>,
  cfg: MiniMaxTextConfig,
  thinkingEnabled: boolean,
  opts?: { reasoningSplit?: boolean; reasoningEffort?: MiniMaxReasoningEffort },
): void {
  if (!isMiniMaxTextConfig(cfg)) return

  delete body.enable_thinking
  // 网关/extraBody 可能误开 thinking，此处最终覆盖
  const reasoningSplit = opts?.reasoningSplit != null
    ? opts.reasoningSplit
    : resolveMiniMaxReasoningSplit(cfg.settings, thinkingEnabled)
  body.reasoning_split = reasoningSplit

  if (isMiniMaxM3Model(cfg.model) || isMiniMaxM2Family(cfg.model)) {
    // MiniMax-M3.1-Flash-Preview 禁止 thinking.type=disabled；思考与正文用 reasoning_split 分离。
    body.thinking = { type: 'adaptive' }
  }

  // M3.1-Flash：显式档位；默认 medium（官方省略= max，大纲/长章易 120s 超时）
  if (isMiniMaxM31FlashModel(cfg.model)) {
    const effort = normalizeMiniMaxReasoningEffort(opts?.reasoningEffort) || 'medium'
    body.reasoning_effort = effort
  } else {
    delete body.reasoning_effort
  }

  const maxTokens = Number(body.max_tokens ?? body.max_completion_tokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_completion_tokens = maxTokens
    // 部分网关只认 max_completion_tokens；保留 max_tokens 兼容
  }
}
