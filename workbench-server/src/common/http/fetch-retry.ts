const TRANSIENT_NETWORK_PATTERN =
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|Cannot connect to API|network error|aborted/i

export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false
  if (typeof err === 'string') return TRANSIENT_NETWORK_PATTERN.test(err)
  const e = err as { message?: string; cause?: { message?: string; code?: string } }
  const parts = [e.message, e.cause?.message, e.cause?.code].filter(Boolean).join(' ')
  return TRANSIENT_NETWORK_PATTERN.test(parts)
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export type FetchRetryOptions = {
  retries?: number
  backoffMs?: number
  timeoutMs?: number
}

/** 对 ECONNRESET 等瞬时网络错误自动重试（供 AI SDK / chat completions 使用） */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 4
  const backoffMs = opts.backoffMs ?? 1500
  const timeoutMs = opts.timeoutMs ?? 600_000
  let lastErr: unknown

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const signal = init?.signal ?? AbortSignal.timeout(timeoutMs)
      return await fetch(input, { ...init, signal })
    } catch (err) {
      lastErr = err
      if (attempt >= retries || !isTransientNetworkError(err)) throw err
      await sleep(backoffMs * attempt)
    }
  }

  throw lastErr
}
