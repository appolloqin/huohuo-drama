import type { MiddlewareHandler } from 'hono'
import { verifyJwt, getJwtSecret } from '../common/auth/jwt-token.js'

export type AuthUser = { id: number; username: string; role: string }

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ code: 401, message: '未登录或登录已过期' }, 401)
  }
  const token = auth.slice(7).trim()
  const payload = verifyJwt(token, getJwtSecret())
  if (!payload) {
    return c.json({ code: 401, message: '无效或已过期的令牌' }, 401)
  }
  c.set('authUser', { id: payload.sub, username: payload.username, role: payload.role })
  await next()
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('authUser') as AuthUser
  if (user.role !== 'admin') {
    return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  }
  await next()
}
