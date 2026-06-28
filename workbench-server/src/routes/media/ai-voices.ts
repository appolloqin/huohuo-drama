import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import { listVoicesByProvider, syncMiniMaxVoices } from '../../services/media/voice-catalog-service.js'

const app = new Hono()

app.get('/', async (c) => {
  const provider = c.req.query('provider') || 'minimax'
  return success(c, await listVoicesByProvider(provider))
})

app.post('/sync', async (c) => {
  const result = await syncMiniMaxVoices()
  if (!result.ok) return badRequest(c, result.error)
  return success(c, { count: result.count, message: result.message })
})

export default app
