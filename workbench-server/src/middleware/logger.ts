import type { MiddlewareHandler } from 'hono'
import { randomUUID } from 'node:crypto'
import {
  formatIncomingLine,
  formatOutgoingLine,
  logPalette,
  previewRequestBody,
} from './http-log-format.js'

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const requestId = randomUUID()
  c.set('requestId', requestId)

  const method = c.req.method
  const path = c.req.path
  const startedAt = performance.now()
  const bodyPreview = await previewRequestBody(method, c.req.raw)

  console.log(formatIncomingLine(requestId, method, path, bodyPreview))
  await next()
  console.log(formatOutgoingLine(requestId, method, path, c.res.status, Math.round(performance.now() - startedAt)))
}

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next()
  } catch (err: any) {
    const status = err.status || 500
    const requestId = c.get('requestId') || 'unknown'
    console.error(`${logPalette.red}[ERROR]${logPalette.reset} ${c.req.method} ${c.req.path} #${String(requestId).slice(0, 8)}`)
    console.error(err.stack || err.message || err)
    return c.json({ code: status, message: err.message || 'Internal Server Error' }, status)
  }
}
