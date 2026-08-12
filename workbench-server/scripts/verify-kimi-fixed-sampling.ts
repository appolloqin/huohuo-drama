/**
 * Kimi 固定采样参数：请求体须省略 temperature 等
 * Run: npx tsx scripts/verify-kimi-fixed-sampling.ts
 */
import {
  applyKimiFixedSamplingOmit,
  applyKimiK3ThinkingGuard,
  isKimiFixedSamplingModel,
  isKimiK3FamilyModel,
} from '../src/services/ai/kimi-text.js'

if (!isKimiFixedSamplingModel('kimi-k3')) throw new Error('kimi-k3 should be fixed sampling')
if (!isKimiFixedSamplingModel('kimi-k2.5')) throw new Error('kimi-k2.5 should be fixed sampling')
if (isKimiFixedSamplingModel('moonshot-v1-8k')) throw new Error('legacy moonshot should allow custom temp')
if (!isKimiK3FamilyModel('kimi-k3')) throw new Error('k3 family')

const body: Record<string, unknown> = {
  model: 'kimi-k3',
  temperature: 0.84,
  top_p: 0.9,
  n: 2,
  presence_penalty: 0.1,
  frequency_penalty: 0.1,
  max_tokens: 1024,
}
applyKimiFixedSamplingOmit(body, { provider: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3' })
if ('temperature' in body || 'top_p' in body || 'n' in body) {
  throw new Error(`fixed sampling fields must be omitted: ${JSON.stringify(body)}`)
}

const thinkBody: Record<string, unknown> = {
  enable_thinking: false,
  thinking: { type: 'disabled' },
  reasoning: { effort: 'none' },
}
applyKimiK3ThinkingGuard(thinkBody, { provider: 'kimi', baseUrl: '', model: 'kimi-k3' })
if (thinkBody.enable_thinking != null || thinkBody.thinking != null || thinkBody.reasoning != null) {
  throw new Error(`k3 must not keep thinking-disable: ${JSON.stringify(thinkBody)}`)
}

console.log('verify-kimi-fixed-sampling OK')
