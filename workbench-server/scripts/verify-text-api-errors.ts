import {
  formatTextApiError,
  isTextProviderSensitiveError,
} from '../src/common/ai/text-api-errors.js'

const raw = JSON.stringify({
  type: 'error',
  error: {
    type: 'unprocessable_entity_error',
    message: 'output new_sensitive (1027)',
    http_code: '422',
  },
  request_id: 'x',
})
const m = formatTextApiError(raw)
if (!m.includes('1027') || !m.includes('敏感')) throw new Error(m)
if (!isTextProviderSensitiveError(new Error(raw))) throw new Error('detect fail')
console.log('verify-text-api-errors OK')
