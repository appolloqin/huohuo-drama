import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_DEV_SECRET = 'huohuo-dev-jwt-change-in-production'

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_DEV_SECRET
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4)
  const b64 = (pad === 4 ? s : s + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

export function signJwt(
  payload: { sub: number; username: string; role: string },
  secret: string,
  expiresInSec: number,
): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + expiresInSec }
  const h = b64url(Buffer.from(JSON.stringify(header)))
  const p = b64url(Buffer.from(JSON.stringify(body)))
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest()
  return `${h}.${p}.${b64url(sig)}`
}

export function verifyJwt(
  token: string,
  secret: string,
): { sub: number; username: string; role: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts
  const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest()
  let sig: Buffer
  try {
    sig = b64urlDecode(s)
  } catch {
    return null
  }
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  let body: { sub?: number; username?: string; role?: string; exp?: number }
  try {
    body = JSON.parse(b64urlDecode(p).toString('utf8'))
  } catch {
    return null
  }
  if (typeof body.exp === 'number' && body.exp < Math.floor(Date.now() / 1000)) return null
  if (typeof body.sub !== 'number' || typeof body.username !== 'string') return null
  return {
    sub: body.sub,
    username: body.username,
    role: typeof body.role === 'string' ? body.role : 'user',
  }
}
