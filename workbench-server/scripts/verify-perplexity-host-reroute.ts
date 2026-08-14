import {
  buildPerplexityModelCandidates,
  expandPerplexityModelAliases,
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

console.log('verify-perplexity-host-reroute OK')
