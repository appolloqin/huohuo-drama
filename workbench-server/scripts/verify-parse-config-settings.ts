/**
 * parseConfigSettings：兼容 MySQL JSON 列已解析为 object、SQLite 字符串
 * npx tsx scripts/verify-parse-config-settings.ts
 */
import { parseConfigSettings } from '../src/services/credits/credits.js'
import { toServiceConfigApiShape } from '../src/routes/ai/ai-config-serializers.js'

const fromObject = parseConfigSettings({
  creditTokenUnit: 3000,
  creditTokenCost: 10,
  perplexityModel: 'qwen-plus-2025-04-28',
  enableThinking: false,
})
if (fromObject.perplexityModel !== 'qwen-plus-2025-04-28') {
  throw new Error('object settings must keep perplexityModel')
}

const fromString = parseConfigSettings(JSON.stringify({
  perplexityModel: 'qwen-plus-2025-04-28',
}))
if (fromString.perplexityModel !== 'qwen-plus-2025-04-28') {
  throw new Error('string settings must parse perplexityModel')
}

if (Object.keys(parseConfigSettings(null)).length !== 0) throw new Error('null → {}')
if (Object.keys(parseConfigSettings('[1,2]')).length !== 0) throw new Error('array JSON → {}')

const api = toServiceConfigApiShape({
  id: 1,
  serviceType: 'text',
  provider: 'ali',
  name: 't',
  baseUrl: '',
  apiKey: '',
  model: '[]',
  priority: 0,
  settings: {
    creditCost: 0,
    creditTokenUnit: 3000,
    creditTokenCost: 0,
    perplexityModel: 'qwen-plus-2025-04-28',
    enableThinking: false,
  },
  isActive: true,
  createdAt: '',
  updatedAt: '',
})
if (api.perplexity_model !== 'qwen-plus-2025-04-28') {
  throw new Error(`API shape lost perplexity_model: ${JSON.stringify(api.perplexity_model)}`)
}

console.log('verify-parse-config-settings OK')
