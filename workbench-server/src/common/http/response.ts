import type { Context } from 'hono'
import { isMysqlDriver } from '../../db/driver.js'

/** HTTP status codes we emit as JSON bodies */
type JsonReplyStatus = 200 | 201 | 400 | 404 | 500

/** Uniform API envelope returned to the workbench */
interface JsonReplyEnvelope<T = unknown> {
  code: number
  message: string
  data?: T
}

function formatMysqlDatetimeUtc(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`
}

/** Timestamp for DB writes (ISO-8601 on SQLite, `YYYY-MM-DD HH:MM:SS.mmm` UTC on MySQL DATETIME). */
export function now() {
  const d = new Date()
  return isMysqlDriver() ? formatMysqlDatetimeUtc(d) : d.toISOString()
}

/** Build a typed JSON response with business + HTTP codes */
function emitJsonReply<T>(
  honoCtx: Context,
  httpCode: JsonReplyStatus,
  bizCode: number,
  msg: string,
  body?: T,
) {
  const envelope: JsonReplyEnvelope<T> = body === undefined
    ? { code: bizCode, message: msg }
    : { code: bizCode, data: body, message: msg }
  return honoCtx.json(envelope, httpCode)
}

export function success(c: Context, data: any = null) {
  return emitJsonReply(c, 200, 200, 'success', data)
}

export function created(c: Context, data: any = null) {
  return emitJsonReply(c, 201, 201, 'created', data)
}

export function badRequest(c: Context, message = 'bad request') {
  return emitJsonReply(c, 400, 400, message)
}

export function notFound(c: Context, message = 'not found') {
  return emitJsonReply(c, 404, 404, message)
}

export function serverError(c: Context, message = 'internal error') {
  return emitJsonReply(c, 500, 500, message)
}
