/** HTTP 请求日志着色与格式化 */
import { formatSanitizedLogPreview } from '../common/security/log-redact.js'

export const logPalette = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
}

export function statusTone(status: number): string {
  if (status >= 500) return logPalette.red
  if (status >= 400) return logPalette.yellow
  if (status >= 300) return logPalette.cyan
  return logPalette.green
}

export function timestampLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

export async function previewRequestBody(method: string, raw: Request): Promise<string> {
  if (!['POST', 'PUT', 'PATCH'].includes(method)) return ''
  try {
    const text = await raw.clone().text()
    if (!text) return ''
    let preview: string
    try {
      preview = formatSanitizedLogPreview(JSON.parse(text), 500)
    } catch {
      preview = formatSanitizedLogPreview(text, 500)
    }
    return `\n  ${logPalette.dim}body: ${preview}${logPalette.reset}`
  } catch {
    return ''
  }
}

export function formatIncomingLine(requestId: string, method: string, path: string, bodyPreview: string): string {
  return `${logPalette.dim}${timestampLabel()}${logPalette.reset} ${logPalette.cyan}${method}${logPalette.reset} ${path} ${logPalette.dim}#${requestId.slice(0, 8)}${logPalette.reset}${bodyPreview}`
}

export function formatOutgoingLine(
  requestId: string,
  method: string,
  path: string,
  status: number,
  elapsedMs: number,
): string {
  return `${logPalette.dim}${timestampLabel()}${logPalette.reset} ${logPalette.cyan}${method}${logPalette.reset} ${path} ${statusTone(status)}${status}${logPalette.reset} ${logPalette.dim}${elapsedMs}ms #${requestId.slice(0, 8)}${logPalette.reset}`
}
