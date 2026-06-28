import { Hono } from 'hono'
import type { Context } from 'hono'
import { success, badRequest, created } from '../../common/http/response.js'
import { requireAuth, type AuthUser } from '../../middleware/auth.js'
import {
  getNavModulesConfig,
  listKnownRoles,
  navModuleCatalog,
  saveNavModulesConfig,
  type NavModulesRoleConfig,
} from '../../services/auth/nav-modules.js'
import {
  AuthConflictError,
  AuthValidationError,
  adjustUserCredits,
  changePassword,
  createUserForAdmin,
  deleteUserForAdmin,
  getCurrentUserProfile,
  getUserAccessForAdmin,
  listCreditLogs,
  listUsersForAdmin,
  loginUser,
  registerUser,
  searchUsersForAdmin,
  updateUserAccessForAdmin,
} from '../../services/auth/auth-service.js'

const app = new Hono()

function mapAuthError(c: Context, err: unknown) {
  if (err instanceof AuthValidationError) return badRequest(c, err.message)
  if (err instanceof AuthConflictError) return badRequest(c, err.message)
  throw err
}

// POST /auth/register
app.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  try {
    const result = await registerUser(username, password)
    return created(c, result)
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// POST /auth/login
app.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const password = String(body.password || '')
  try {
    return success(c, await loginUser(username, password))
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// GET /auth/me
app.get('/me', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  return success(c, await getCurrentUserProfile(u.id, u.username, u.role))
})

// POST /auth/password — 修改当前用户密码
app.post('/password', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  const body = await c.req.json().catch(() => ({}))
  try {
    await changePassword(
      u.id,
      String(body.current_password || ''),
      String(body.new_password || ''),
    )
    return success(c)
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// GET /auth/credits/logs
app.get('/credits/logs', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') || 50)))
  return success(c, await listCreditLogs(u.id, limit))
})

// GET /auth/admin/users
app.get('/admin/users', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const keyword = String(c.req.query('q') || c.req.query('keyword') || '').trim()
  if (keyword) {
    const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') || 20)))
    return success(c, await searchUsersForAdmin(keyword, limit))
  }
  return success(c, await listUsersForAdmin())
})

// GET /auth/admin/users/search — 按用户名/ID 搜索，避免一次加载全量用户
app.get('/admin/users/search', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const keyword = String(c.req.query('q') || c.req.query('keyword') || '').trim()
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') || 20)))
  return success(c, await searchUsersForAdmin(keyword, limit))
})

// GET /auth/admin/users/:id/access — 单个用户的权限详情
app.get('/admin/users/:id/access', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const userId = Number(c.req.param('id'))
  try {
    return success(c, await getUserAccessForAdmin(userId))
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// POST /auth/admin/credits
app.post('/admin/credits', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await adjustUserCredits({
      operatorUsername: u.username,
      userId: Number(body.user_id),
      delta: Math.trunc(Number(body.delta || 0)),
      reason: String(body.reason || '').trim() || '管理员调整积分',
    })
    return success(c, result)
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// GET /auth/admin/nav-modules
app.get('/admin/nav-modules', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  return success(c, {
    modules: navModuleCatalog(),
    roles: await listKnownRoles(),
    config: await getNavModulesConfig(),
  })
})

// PATCH /auth/admin/users/:id — 调整用户角色与按人导航权限
app.patch('/admin/users/:id', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const userId = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await updateUserAccessForAdmin({
      userId,
      role: body.role !== undefined ? String(body.role) : undefined,
      navModulesOverride: body.nav_modules_override,
    })
    return success(c, result)
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// POST /auth/admin/users — 创建账号（管理员代建）
app.post('/admin/users', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const body = await c.req.json().catch(() => ({}))
  try {
    const result = await createUserForAdmin({
      username: String(body.username || '').trim(),
      password: body.password ? String(body.password) : undefined,
      role: String(body.role || ''),
      credits: body.credits,
    })
    return created(c, result)
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// DELETE /auth/admin/users/:id — 删除账号（不能删除自己）
app.delete('/admin/users/:id', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const userId = Number(c.req.param('id'))
  try {
    const result = await deleteUserForAdmin({
      operatorId: u.id,
      targetId: userId,
    })
    return success(c, result)
  } catch (err) {
    return mapAuthError(c, err)
  }
})

// PUT /auth/admin/nav-modules
app.put('/admin/nav-modules', requireAuth, async (c) => {
  const u = (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
  if (u.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const config = (body.config || {}) as NavModulesRoleConfig
  const saved = await saveNavModulesConfig(config)
  return success(c, { config: saved })
})

export default app
