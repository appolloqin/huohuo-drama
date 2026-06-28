const MAX_BYTES = 512 * 1024
const TIMEOUT_MS = 15000

function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '127.0.0.1' || h.startsWith('127.')) return true
  if (h === '::1') return true
  if (h.startsWith('10.')) return true
  if (h.startsWith('192.168.')) return true
  const m = /^172\.(\d+)\./.exec(h)
  if (m) {
    const n = Number(m[1])
    if (n >= 16 && n <= 31) return true
  }
  if (h.startsWith('169.254.')) return true
  if (h.endsWith('.internal') || h.endsWith('.local')) return true
  return false
}

export async function fetchUrlText(urlRaw: string): Promise<{ title: string; text: string; contentType: string }> {
  let url: URL
  try {
    url = new URL(urlRaw.trim())
  } catch {
    throw new Error('链接格式无效')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http / https 链接')
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error('不支持访问内网或本地地址')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(url.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'HuohuoDrama-TemplateFetcher/1.0',
        Accept: 'text/html,text/plain,application/json,*/*',
      },
      redirect: 'follow',
    })
    if (!resp.ok) throw new Error(`下载失败（HTTP ${resp.status}）`)

    const contentType = resp.headers.get('content-type') || ''
    const reader = resp.body?.getReader()
    if (!reader) throw new Error('无法读取响应内容')

    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.length
      if (total > MAX_BYTES) throw new Error('页面内容过大（超过 512KB）')
      chunks.push(value)
    }

    const buf = Buffer.concat(chunks)
    const text = buf.toString('utf-8')
    return { title: '', text, contentType }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('下载超时')
    throw err
  } finally {
    clearTimeout(timer)
  }
}
