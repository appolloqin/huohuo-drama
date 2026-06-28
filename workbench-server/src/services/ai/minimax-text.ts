/**
 * MiniMax 文本 Chat Completions 专用参数（OpenAI 兼容 /v1/chat/completions）
 *
 * 官方要点（MiniMax-M3）：
 * - 用 thinking.type = disabled | adaptive，勿用阿里/DeepSeek 的 enable_thinking
 * - reasoning_split=true 时思考进 reasoning_content / reasoning_details，content 仅正文
 * - reasoning_split=false 时思考以 <think> 混入 content（须后端剥离）
 * - 新接入建议 max_completion_tokens，而非仅 max_tokens
 */
export type MiniMaxTextConfig = {
  provider: string
  baseUrl: string
  model: string
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

/**
 * 在最终请求体上写入 MiniMax 原生参数（须于 merge 完成后最后调用）
 */
export function applyMiniMaxTextRequestParams(
  body: Record<string, unknown>,
  cfg: MiniMaxTextConfig,
  thinkingEnabled: boolean,
): void {
  if (!isMiniMaxTextConfig(cfg)) return

  delete body.enable_thinking
  body.reasoning_split = true

  if (isMiniMaxM3Model(cfg.model)) {
    body.thinking = { type: thinkingEnabled ? 'adaptive' : 'disabled' }
  } else if (isMiniMaxM2Family(cfg.model)) {
    if (!thinkingEnabled) delete body.thinking
  }

  const maxTokens = Number(body.max_tokens ?? body.max_completion_tokens)
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_completion_tokens = maxTokens
  }
}
