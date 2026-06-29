/** 桌面壳默认打开的线上控制台地址（可通过环境变量 HUOHUO_CONSOLE_URL 覆盖） */
export const DEFAULT_CONSOLE_URL = 'https://www.seeddrama.com/console/login'

export function resolveConsoleUrl() {
  const fromEnv = process.env.HUOHUO_CONSOLE_URL?.trim()
  if (fromEnv) {
    try {
      return new URL(fromEnv).href
    } catch {
      console.warn('[desktop] Invalid HUOHUO_CONSOLE_URL, using default')
    }
  }
  return DEFAULT_CONSOLE_URL
}

/** 允许在应用内跳转的 origin（与起始 URL 一致，避免外链在 WebView 内打开） */
export function allowedOriginFor(urlString) {
  try {
    return new URL(urlString).origin
  } catch {
    return new URL(DEFAULT_CONSOLE_URL).origin
  }
}
