import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SALT_LEN = 16
const KEY_LEN = 64

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN)
  const hash = scryptSync(plain, salt, KEY_LEN)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'base64')
    const expected = Buffer.from(parts[2], 'base64')
    const hash = scryptSync(plain, salt, KEY_LEN)
    return hash.length === expected.length && timingSafeEqual(hash, expected)
  } catch {
    return false
  }
}
