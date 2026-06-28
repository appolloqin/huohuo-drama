import { Hono } from 'hono'
import { success, notFound, created, badRequest } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import { requireAdmin } from '../../middleware/auth.js'
import { runProviderConnectivityProbe } from './ai-config-probe.js'
import { getUserAiConfigReadiness } from '../../services/ai/user-ai-config-resolve.js'
import * as aiConfigService from '../../services/ai/ai-config-service.js'

const serviceConfigRouter = new Hono()

serviceConfigRouter.get('/', async (c) => {
  const items = await aiConfigService.listServiceConfigs(c.req.query('service_type'))
  return success(c, items)
})

serviceConfigRouter.post('/', requireAdmin, async (c) => {
  const body = await c.req.json()
  try {
    return created(c, await aiConfigService.createServiceConfig(body))
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

serviceConfigRouter.post('/huohuo-preset', requireAdmin, async (c) => {
  const body = await c.req.json()
  const apiKey = String(body.api_key || '').trim()
  if (!apiKey) return badRequest(c, 'api_key is required')
  return success(c, await aiConfigService.applyHuohuoPreset(apiKey))
})

serviceConfigRouter.get('/readiness', async (c) => {
  const user = getAuthUser(c)
  const scopeRaw = c.req.query('scope')
  const scope = scopeRaw === 'novel' || scopeRaw === 'drama' || scopeRaw === 'full'
    ? scopeRaw
    : 'full'
  return success(c, await getUserAiConfigReadiness(user.id, user.role, scope))
})

serviceConfigRouter.get('/user-default-models', async (c) => {
  const user = getAuthUser(c)
  return success(c, await aiConfigService.getUserDefaultCatalogModels(user.id))
})

serviceConfigRouter.put('/user-default-models', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({})) as { items?: Array<{ service_type: string; config_id: number }> }
  const items = Array.isArray(body.items) ? body.items : null
  if (!items?.length) return badRequest(c, 'items is required')
  try {
    return success(c, await aiConfigService.saveUserDefaultCatalogModels(user.id, items))
  } catch (err: any) {
    return badRequest(c, err.message || '保存失败')
  }
})

serviceConfigRouter.get('/preset', async (c) => {
  const user = getAuthUser(c)
  if (user.role === 'admin') {
    return success(c, await aiConfigService.listEffectivePresets())
  }
  return success(c, await aiConfigService.listUserEffectivePresets(user.id))
})

serviceConfigRouter.put('/preset', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { items?: Array<Record<string, unknown>> }
  const items = Array.isArray(body.items) ? body.items : null
  if (!items) return badRequest(c, 'items is required')
  try {
    return success(c, await aiConfigService.savePresetOverrides(items))
  } catch (err: any) {
    return badRequest(c, err.message || '保存失败')
  }
})

serviceConfigRouter.put('/preset/policy', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({})) as { credit_billing_enabled?: unknown }
  if (typeof body.credit_billing_enabled !== 'boolean') {
    return badRequest(c, 'credit_billing_enabled must be boolean')
  }
  return success(c, await aiConfigService.saveHuohuoPresetPolicy(body.credit_billing_enabled))
})

serviceConfigRouter.put('/user-preset', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({})) as { items?: Array<Record<string, unknown>> }
  const items = Array.isArray(body.items) ? body.items : null
  if (!items?.length) return badRequest(c, 'items is required')
  try {
    return success(c, await aiConfigService.saveUserPresetOverrides(user.id, items))
  } catch (err: any) {
    return badRequest(c, err.message || '保存失败')
  }
})

serviceConfigRouter.post('/test', async (c) => {
  const body = await c.req.json()
  if (!body.service_type || !body.provider || !body.base_url) {
    return badRequest(c, 'service_type, provider and base_url are required')
  }
  const outcome = await runProviderConnectivityProbe(body)
  return success(c, outcome)
})

serviceConfigRouter.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await aiConfigService.getServiceConfigById(id)
  if (!row) return notFound(c)
  return success(c, row)
})

serviceConfigRouter.put('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  await aiConfigService.updateServiceConfig(id, body)
  return success(c)
})

serviceConfigRouter.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  await aiConfigService.deleteServiceConfig(id)
  return success(c)
})

export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  return success(c, await aiConfigService.listAiServiceProviders())
})

export default serviceConfigRouter
