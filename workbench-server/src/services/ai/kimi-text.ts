/**
 * Kimi / Moonshot Chat Completions 参数约束
 *
 * 官方（kimi-k3 / k2.7-code / k2.5·k2.6）：
 * - temperature / top_p / n / presence_penalty / frequency_penalty 为固定值，
 *   显式传入其它值会 400（如 invalid temperature: only 1 is allowed）
 * - 正确做法：请求体中省略这些字段，由服务端用默认固定值
 * - kimi-k3 始终开启 thinking，勿传 thinking.type=disabled
 */

export type KimiTextConfig = {
  provider: string
  baseUrl: string
  model: string
}

/** 采样参数被官方锁死、不可自定义的型号 */
export function isKimiFixedSamplingModel(model: string): boolean {
  const m = (model || '').toLowerCase()
  return /kimi-k3/.test(m)
    || /kimi-k2\.7/.test(m)
    || /kimi-k2\.[56]/.test(m)
}

export function isKimiK3FamilyModel(model: string): boolean {
  return /kimi-k3/i.test(model || '')
}

export function isKimiTextConfig(cfg: KimiTextConfig): boolean {
  const provider = (cfg.provider || '').toLowerCase()
  const base = (cfg.baseUrl || '').toLowerCase()
  const model = (cfg.model || '').toLowerCase()
  return provider === 'moonshot'
    || provider === 'kimi'
    || /moonshot|kimi\.ai/.test(base)
    || /kimi-k|moonshot/.test(model)
}

/** 从最终请求体去掉 Kimi 固定采样字段（须在 merge extraBody 之后调用） */
export function applyKimiFixedSamplingOmit(
  body: Record<string, unknown>,
  cfg: KimiTextConfig,
): void {
  if (!isKimiFixedSamplingModel(cfg.model)) return

  delete body.temperature
  delete body.top_p
  delete body.n
  delete body.presence_penalty
  delete body.frequency_penalty
}

/** kimi-k3：撤销「关思考」写入，避免与始终开思考冲突 */
export function applyKimiK3ThinkingGuard(
  body: Record<string, unknown>,
  cfg: KimiTextConfig,
): void {
  if (!isKimiK3FamilyModel(cfg.model)) return
  delete body.enable_thinking
  delete body.thinking
  // 部分关思考路径会写 reasoning.effort=none；K3 用 reasoning_effort 档位，勿强关
  if (body.reasoning && typeof body.reasoning === 'object') {
    const r = body.reasoning as Record<string, unknown>
    if (r.effort === 'none') delete body.reasoning
  }
}
