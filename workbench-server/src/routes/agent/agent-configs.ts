import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import {
  getAgentConfigById,
  listAgentConfigs,
  patchAgentConfig,
  serializeAgentConfig,
  serializeAgentConfigList,
  softDeleteAgentConfig,
  upsertAgentConfig,
} from '../../services/agent/agent-config-service.js'

const app = new Hono()

app.get('/', async (c) => success(c, serializeAgentConfigList(await listAgentConfigs())))

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const row = await getAgentConfigById(id)
  if (!row) return badRequest(c, 'Not found')
  return success(c, serializeAgentConfig(row))
})

app.post('/', async (c) => {
  const body = await c.req.json()
  const result = await upsertAgentConfig(body)
  if (!result.ok) return badRequest(c, result.error)
  return success(c, serializeAgentConfig(result.row!))
})

app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const row = await patchAgentConfig(id, body)
  if (!row) return badRequest(c, 'Not found')
  return success(c, serializeAgentConfig(row))
})

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await softDeleteAgentConfig(id)
  return success(c)
})

export default app
