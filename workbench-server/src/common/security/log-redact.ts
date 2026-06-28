/** 日志输出脱敏：密码、API Key、支付密钥等不得明文打印 */

export const REDACTED = '***'

const SENSITIVE_EXACT = new Set([
  'authorization',
  'api_key',
  'apikey',
  'x_goog_api_key',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'current_password',
  'new_password',
  'old_password',
  'client_secret',
  'app_secret',
  'private_key',
  'privatekey',
  'secret',
  'signing_key',
  'sign_key',
  'webhook_secret',
  'encryption_key',
  'config_encryption_key',
  'api_v3_key',
  'mch_secret',
  'merchant_secret',
  'merchant_key',
  'salt',
  'pingpong_salt',
  'pingpong_key',
])

/** 含 token 但非密钥的字段（如 max_tokens） */
const TOKEN_KEY_ALLOWLIST = new Set([
  'max_tokens',
  'token_count',
  'total_tokens',
  'prompt_tokens',
  'completion_tokens',
  'input_tokens',
  'output_tokens',
  'analyzed_tokens',
])

export function isSensitiveLogKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/-/g, '_')
  if (SENSITIVE_EXACT.has(lower)) return true
  if (TOKEN_KEY_ALLOWLIST.has(lower)) return false
  if (lower.includes('password')) return true
  if (lower.includes('authorization')) return true
  if (lower.includes('api_key') || lower.includes('apikey')) return true
  if (lower.endsWith('_secret') || lower === 'secret') return true
  if (lower.includes('private_key') || lower.includes('privatekey')) return true
  if (lower.includes('client_secret')) return true
  if (lower.includes('access_token') || lower.includes('refresh_token')) return true
  if (lower.includes('token') && !lower.includes('max_token')) return true
  if (lower.includes('merchant') && (lower.includes('key') || lower.includes('secret'))) return true
  if (lower.includes('sign') && (lower.includes('key') || lower.includes('secret'))) return true
  return false
}

export function redactUrl(rawUrl: string): string {
  const urlSensitiveQueryKeys = new Set(['key', 'password', 'api_key', 'apikey', 'token', 'access_token', 'secret'])
  try {
    const url = new URL(rawUrl)
    for (const key of url.searchParams.keys()) {
      const lower = key.toLowerCase()
      if (urlSensitiveQueryKeys.has(lower) || isSensitiveLogKey(key)) {
        url.searchParams.set(key, REDACTED)
      }
    }
    return url.toString()
  } catch {
    return rawUrl.replace(
      /([?&](?:password|api_key|apikey|token|access_token|secret|key)=)[^&]+/gi,
      `$1${REDACTED}`,
    )
  }
}

function redactFormLikeString(text: string): string {
  return text.replace(
    /([?&]|^)(password|api_key|apikey|token|access_token|secret|client_secret|private_key|current_password|new_password|authorization)=([^&]*)/gi,
    `$1$2=${REDACTED}`,
  )
}

const MAX_SANITIZE_DEPTH = 12

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value == null) return value
  if (depth > MAX_SANITIZE_DEPTH) return REDACTED

  if (typeof value === 'string') {
    if (/^Bearer\s+\S+/i.test(value)) return `Bearer ${REDACTED}`
    if (/^Token\s+\S+/i.test(value)) return `Token ${REDACTED}`
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value

  if (Array.isArray(value)) {
    return value.map(item => sanitizeForLog(item, depth + 1))
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveLogKey(key)) {
        output[key] = REDACTED
        continue
      }

      if (typeof raw === 'string' && (key.toLowerCase() === 'url' || key.toLowerCase().endsWith('_url'))) {
        output[key] = redactUrl(raw)
        continue
      }

      output[key] = sanitizeForLog(raw, depth + 1)
    }
    return output
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

export function formatSanitizedLogPreview(value: unknown, maxLen = 500): string {
  let text: string
  if (typeof value === 'string') {
    text = redactFormLikeString(value)
  } else {
    const sanitized = sanitizeForLog(value)
    try {
      text = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized)
    } catch {
      text = String(sanitized)
    }
  }
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen)}...`
}
