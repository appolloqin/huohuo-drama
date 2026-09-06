import {
  buildPerplexityModelCandidates,
  expandPerplexityModelAliases,
  isCompletionsEndpointMissing,
  resolveSharedPerplexitySelection,
  shouldPreferChatLogprobs,
  shouldSkipChatAfterCompletionsFail,
  textConfigCanHostPerplexityModel,
} from '../src/services/ai/ai.js'

if (!textConfigCanHostPerplexityModel({
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  models: ['deepseek-v4-flash'],
  targetModel: 'qwen-plus-2025-04-28',
})) {
  // expected false
} else {
  throw new Error('deepseek must not host qwen-plus')
}

if (!textConfigCanHostPerplexityModel({
  provider: 'ali',
  baseUrl: 'https://dashscope.aliyuncs.com',
  models: ['qwen3.7-max'],
  targetModel: 'qwen-plus-2025-04-28',
})) {
  throw new Error('ali dashscope must host qwen-plus')
}

const aliases = expandPerplexityModelAliases('qwen-plus-2025-04-28')
if (aliases.join(',') !== 'qwen-plus-2025-04-28,qwen-plus') {
  throw new Error(`alias expand failed: ${aliases.join(',')}`)
}

const deepseekCfg = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'x',
  model: 'deepseek-v4-flash',
}
const candidates = buildPerplexityModelCandidates(
  deepseekCfg,
  ['deepseek-v4-flash'],
  { perplexityModel: 'qwen-plus-2025-04-28' },
)
if (candidates[0] !== 'qwen-plus-2025-04-28' || candidates[1] !== 'qwen-plus') {
  throw new Error(`expected snapshot then alias, got ${candidates.join(',')}`)
}
if (candidates.includes('deepseek-v4-flash')) {
  throw new Error('explicit ppl model must not append deepseek-v4-flash')
}

const compatErr = new Error('Unsupported model `qwen-plus-2025-04-28` for OpenAI compatibility mode.')
if (shouldSkipChatAfterCompletionsFail(compatErr)) {
  throw new Error('compat unsupported model must still try chat')
}

const missingCompletions = new Error('{"error":"接口不存在: POST /v1/completions"}')
if (!isCompletionsEndpointMissing(missingCompletions)) {
  throw new Error('must detect missing /completions')
}
if (shouldSkipChatAfterCompletionsFail(missingCompletions)) {
  throw new Error('missing /completions must still try chat')
}

const relayCfg = {
  provider: 'custom',
  baseUrl: 'https://relay.example.com/v1',
  apiKey: 'x',
  model: 'qwen3.8-flash',
}
if (!shouldPreferChatLogprobs(relayCfg, 'qwen3.8-flash')) {
  throw new Error('qwen3.8-flash on relay must prefer chat logprobs')
}

// DeepSeek 写作未填困惑度 → 复用停用阿里云配置里的 qwen-plus
const shared = resolveSharedPerplexitySelection([
  {
    id: 1,
    isActive: 1,
    priority: 100,
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'ds',
    model: JSON.stringify(['deepseek-v4-flash']),
    settings: {},
  },
  {
    id: 2,
    isActive: 0,
    priority: 50,
    provider: 'ali',
    baseUrl: 'https://dashscope.aliyuncs.com',
    apiKey: 'ali',
    model: JSON.stringify(['qwen3.7-max']),
    settings: { perplexityModel: 'qwen-plus' },
  },
])
if (shared.pplModel !== 'qwen-plus' || shared.source !== 'shared-inactive') {
  throw new Error(`shared reuse failed: ${shared.pplModel}/${shared.source}`)
}
if (shared.hostRow.id !== 2) {
  throw new Error(`host should be ali row, got ${shared.hostRow.id}`)
}

console.log('verify-perplexity-host-reroute OK')
