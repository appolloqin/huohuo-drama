import type { MiddlewareHandler } from 'hono'

/** API 与 Webhook 不应被搜索引擎收录 */
export const apiRobotsNoIndex: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive')
}
