/** 热榜抓取共用 HTTP 工具：限速、UA、超时；只取元数据 */

export const HOT_RANK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export const HOT_RANK_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchText(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ text: string; headers: Headers; status: number }> {
  const timeoutMs = init?.timeoutMs ?? 20_000
  const { timeoutMs: _t, ...rest } = init || {}
  const res = await fetch(url, {
    ...rest,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return { text, headers: res.headers, status: res.status }
}

export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { text } = await fetchText(url, init)
  return JSON.parse(text) as T
}

export function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }
}

export function truncateBlurb(text: string, max = 200): string {
  const t = (text || '').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export function parseHeatNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw ?? '').trim()
  if (!s) return fallback
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([万亿])?/)
  if (!m) return fallback
  let n = Number(m[1])
  if (!Number.isFinite(n)) return fallback
  if (m[2] === '万') n *= 10_000
  if (m[2] === '亿') n *= 100_000_000
  return Math.round(n)
}
