/** 桌面远程模式默认控制台地址（可通过 HUOHUO_CONSOLE_URL 或 settings.remoteUrl 覆盖） */
export const DEFAULT_CONSOLE_URL = 'https://www.seeddrama.com/console/login'

export function resolveRemoteConsoleUrl(preferred) {
  const fromEnv = process.env.HUOHUO_CONSOLE_URL?.trim()
  const candidate = (fromEnv || preferred || DEFAULT_CONSOLE_URL).trim()
  try {
    return new URL(candidate).href
  } catch {
    console.warn('[desktop] Invalid console URL, using default')
    return DEFAULT_CONSOLE_URL
  }
}

/** @deprecated 使用 resolveRemoteConsoleUrl */
export function resolveConsoleUrl() {
  return resolveRemoteConsoleUrl()
}

/** 允许在应用内跳转的 origin（与起始 URL 一致，避免外链在 WebView 内打开） */
export function allowedOriginFor(urlString) {
  try {
    return new URL(urlString).origin
  } catch {
    return new URL(DEFAULT_CONSOLE_URL).origin
  }
}
