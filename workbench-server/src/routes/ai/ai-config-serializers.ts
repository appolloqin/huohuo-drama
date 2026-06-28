/**
 * AI 服务配置 API 序列化
 */
import { toSnakeCase } from '../../common/http/transform.js'
import { parseConfigSettings, resolveThinkingEnabled } from '../../services/credits/credits.js'

export function parseTextBillingPayload(body: Record<string, any>) {
  const unit = Math.max(1, Math.floor(Number(body.credit_token_unit ?? 3000)))
  const cost = Math.max(0, Math.floor(Number(body.credit_token_cost ?? 0)))
  const perplexityModel = typeof body.perplexity_model === 'string' ? body.perplexity_model.trim() : ''
  const enableThinking = body.enable_thinking === true
  const base: Record<string, unknown> = {
    creditTokenUnit: unit,
    creditTokenCost: cost,
    creditCost: 0,
    enableThinking,
  }
  if (perplexityModel) base.perplexityModel = perplexityModel
  return base
}

export function toServiceConfigApiShape(row: any) {
  const settings = parseConfigSettings(row.settings)
  return {
    ...toSnakeCase(row),
    model: row.model ? JSON.parse(row.model) : [],
    credit_cost: Number(settings.creditCost || 0),
    credit_token_unit: Number(settings.creditTokenUnit || 0),
    credit_token_cost: Number(settings.creditTokenCost || 0),
    perplexity_model: typeof settings.perplexityModel === 'string' ? settings.perplexityModel : '',
    enable_thinking: resolveThinkingEnabled(settings),
  }
}
