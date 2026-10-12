/**
 * 审稿/审校采样可复现：temperature 不被 extraBody 盖掉；json 审校重试不开思考；seed 写入请求体
 * Run: npx tsx scripts/verify-audit-sampling-determinism.ts
 */
import {
  buildChatCompletionRequestBody,
  shouldOpenDeepseekThinkingOnRetry,
  type AIConfig,
} from '../src/services/ai/ai.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
  console.log('ok', msg)
}

const deepseekCfg: AIConfig = {
  provider: 'huohuo',
  baseUrl: 'https://huo.hcpzy.com/v1',
  apiKey: 'x',
  model: 'deepseek-v4-flash-0731',
  settings: JSON.stringify({
    enableThinking: false,
    extraBody: { temperature: 0.9, top_p: 0.8 },
  }),
}

const messages = [{ role: 'user' as const, content: 'ping' }]

const auditBody = buildChatCompletionRequestBody(deepseekCfg, messages, {
  temperature: 0,
  topP: 1,
  seed: 12345,
  enableThinking: false,
  salvageMode: 'json',
  maxTokens: 4096,
})

assert(auditBody.temperature === 0, 'caller temperature=0 beats extraBody 0.9')
assert(auditBody.top_p === 1, 'caller top_p=1 beats extraBody 0.8')
assert(auditBody.seed === 12345, 'seed written to request body')
assert(auditBody.enable_thinking === false, 'enable_thinking false')
assert(
  (auditBody.thinking as { type: string } | undefined)?.type === 'disabled',
  'thinking.type=disabled',
)
assert(
  (auditBody.reasoning as { effort: string } | undefined)?.effort === 'none',
  'reasoning.effort=none',
)

assert(
  shouldOpenDeepseekThinkingOnRetry({
    sensitive: false,
    deepseekV4: true,
    attempt: 1,
    enableThinking: undefined,
    salvageMode: undefined,
  }) === true,
  'writing path may open thinking on deepseek retry',
)

assert(
  shouldOpenDeepseekThinkingOnRetry({
    sensitive: false,
    deepseekV4: true,
    attempt: 1,
    enableThinking: false,
    salvageMode: 'json',
  }) === false,
  'audit json + enableThinking=false must NOT open thinking on retry',
)

assert(
  shouldOpenDeepseekThinkingOnRetry({
    sensitive: false,
    deepseekV4: true,
    attempt: 1,
    salvageMode: 'json',
  }) === false,
  'salvageMode=json alone keeps thinking off on retry',
)

assert(
  shouldOpenDeepseekThinkingOnRetry({
    sensitive: false,
    deepseekV4: true,
    attempt: 1,
    enableThinking: false,
  }) === false,
  'explicit enableThinking=false keeps thinking off on retry',
)

console.log('all audit sampling determinism checks passed')
