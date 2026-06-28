import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import { handleViduWebhook } from '../../services/webhook/vidu-webhook-handler.js'

const app = new Hono()

app.post('/vidu', async (c) => {
  const payload = await c.req.json()
  const result = await handleViduWebhook(payload)

  if (result.status === 400) {
    return badRequest(c, result.body.message)
  }
  return success(c, result.body)
})

export default app
