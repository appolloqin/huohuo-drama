/**
 * 移动端专用 HTTP 路由 — 前缀 /api/v1/mobile
 * 不修改既有 auth / dramas / batch-jobs 等路由契约。
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import { requireAuth, type AuthUser } from '../../middleware/auth.js'
import { toSnakeCase } from '../../common/http/transform.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import { getMobileHealth, getMobilePublicConfig } from '../../services/mobile/mobile-config-service.js'
import {
  bindWechatMiniProgramCode,
  loginWithWechatMiniProgramCode,
  MobileAuthError,
} from '../../services/mobile/mobile-wechat-auth-service.js'
import {
  executeMobileCommand,
  getMobileCommandPreview,
  MobileCommandError,
} from '../../services/mobile/mobile-command-service.js'
import { getMobileHomeSummary } from '../../services/mobile/mobile-home-service.js'
import {
  createWechatJsapiCheckout,
  listMobileCnyPlans,
  MobilePaymentError,
} from '../../services/mobile/mobile-payment-service.js'
import { parseBatchScopeFromBody } from '../task/batch-jobs.js'

const app = new Hono()

function mapMobileError(c: Context, err: unknown) {
  if (err instanceof MobileAuthError) return badRequest(c, err.message)
  if (err instanceof MobileCommandError) return badRequest(c, err.message)
  if (err instanceof MobilePaymentError) return badRequest(c, err.message)
  throw err
}

function authUser(c: Context) {
  return (c as unknown as Context<{ Variables: { authUser: AuthUser } }>).get('authUser')
}

// GET /mobile/health — 连通性（公开）
app.get('/health', (c) => success(c, getMobileHealth()))

// GET /mobile/config — 客户端能力开关（公开）
app.get('/config', async (c) => success(c, await getMobilePublicConfig()))

// POST /mobile/auth/wechat-login — 小程序 code 换 JWT（公开）
app.post('/auth/wechat-login', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const result = await loginWithWechatMiniProgramCode(String(body.code || ''))
    return success(c, toSnakeCase(result))
  } catch (err) {
    return mapMobileError(c, err)
  }
})

// POST /mobile/auth/wechat-bind — 已有账号绑定微信（需登录）
app.post('/auth/wechat-bind', requireAuth, async (c) => {
  const u = authUser(c)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const result = await bindWechatMiniProgramCode(u.id, String(body.code || ''))
    return success(c, result)
  } catch (err) {
    return mapMobileError(c, err)
  }
})

// GET /mobile/home-summary — 首页聚合
app.get('/home-summary', requireAuth, async (c) => {
  const u = getAuthUser(c)
  const data = await getMobileHomeSummary(u.id, u.username, u.role)
  return success(c, toSnakeCase(data))
})

// GET /mobile/payments/plans — 小程序 CNY 套餐
app.get('/payments/plans', requireAuth, (c) => {
  return success(c, { plans: listMobileCnyPlans() })
})

// POST /mobile/payments/wechat-jsapi — 小程序支付下单
app.post('/payments/wechat-jsapi', requireAuth, async (c) => {
  const u = getAuthUser(c)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const data = await createWechatJsapiCheckout({
      userId: u.id,
      plan_id: body.plan_id != null ? String(body.plan_id) : undefined,
      custom_amount_cny: body.custom_amount_cny != null ? Number(body.custom_amount_cny) : undefined,
      payer_openid: body.payer_openid != null ? String(body.payer_openid) : undefined,
    })
    return success(c, data)
  } catch (err) {
    return mapMobileError(c, err)
  }
})

// POST /mobile/commands/preview — 解析自然语言 / 指令（不执行）
app.post('/commands/preview', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const preview = await getMobileCommandPreview({
      intent: body.intent != null ? String(body.intent) : undefined,
      drama_id: body.drama_id != null ? Number(body.drama_id) : undefined,
      scope: parseBatchScopeFromBody(body.scope),
      text: body.text != null ? String(body.text) : undefined,
      job_id: body.job_id != null ? String(body.job_id) : undefined,
    })
    return success(c, preview)
  } catch (err) {
    return mapMobileError(c, err)
  }
})

// POST /mobile/commands — 执行指令
app.post('/commands', requireAuth, async (c) => {
  const u = getAuthUser(c)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const result = await executeMobileCommand({
      userId: u.id,
      userRole: u.role,
      body: {
        intent: body.intent != null ? String(body.intent) : undefined,
        drama_id: body.drama_id != null ? Number(body.drama_id) : undefined,
        scope: parseBatchScopeFromBody(body.scope),
        text: body.text != null ? String(body.text) : undefined,
        job_id: body.job_id != null ? String(body.job_id) : undefined,
      },
    })
    return success(c, toSnakeCase(result))
  } catch (err) {
    return mapMobileError(c, err)
  }
})

export default app
