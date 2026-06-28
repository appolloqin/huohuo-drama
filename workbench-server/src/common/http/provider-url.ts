/**
 * 厂商 API 地址拼接工具
 */

function withLeadingSlash(segment: string): string {
  if (!segment) return ''
  return segment.startsWith('/') ? segment : `/${segment}`
}

function joinUrlPathSegments(basePath: string, prefix: string, suffix: string): string {
  const joined = [basePath, prefix, suffix]
    .map(part => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
  return `/${joined}`
}

export function joinProviderUrl(baseUrl: string, requiredPrefix: string, path: string) {
  const prefix = withLeadingSlash(requiredPrefix)
  const suffix = withLeadingSlash(path)
  const trimmedBase = (baseUrl || '').replace(/\/+$/, '')

  if (!trimmedBase) {
    return `${prefix}${suffix}`
  }

  try {
    const parsed = new URL(trimmedBase)
    const current = parsed.pathname.replace(/\/+$/, '')
    const withPrefix = current.endsWith(prefix)
      ? current
      : `${current}${prefix}`
    parsed.pathname = joinUrlPathSegments(withPrefix, '', suffix)
    return parsed.toString()
  } catch {
    const fallbackBase = trimmedBase.endsWith(prefix)
      ? trimmedBase
      : `${trimmedBase}${prefix}`
    return `${fallbackBase}${suffix}`
  }
}
