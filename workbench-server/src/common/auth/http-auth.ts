import type { Context } from 'hono'
import type { AuthUser } from '../../middleware/auth.js'

export function getAuthUser(c: Context): AuthUser {
  return c.get('authUser') as AuthUser
}
