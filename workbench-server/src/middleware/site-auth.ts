import type { MiddlewareHandler } from 'hono'
import { timingSafeEqual } from 'node:crypto'

/** 营销站构建 / SSR / Nginx 反代使用；生产请用 SITE_API_TOKEN 覆盖 */
export const DEFAULT_DEV_SITE_TOKEN = 'huohuo-dev-site-token-change-in-production'

export function getSiteApiToken(): string {
  return process.env.SITE_API_TOKEN || DEFAULT_DEV_SITE_TOKEN
}

function safeEqualToken(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** 站点服务凭证（Bearer），与用户 JWT 无关 */
export const requireSiteAuth: MiddlewareHandler = async (c, next) => {
  const expected = getSiteApiToken()
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ code: 401, message: '缺少站点凭证' }, 401)
  }
  const token = auth.slice(7).trim()
  if (!token || !safeEqualToken(token, expected)) {
    return c.json({ code: 401, message: '无效的站点凭证' }, 401)
  }
  await next()
}
