/**
 * Shared offline crypto — matches workbench-server/src/common/security/secret-cipher.ts
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import fs from 'node:fs'

export const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'
const SALT = 'huohuo-config-v1'

export function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

export function resolvePrimarySecret(explicitSecret) {
  if (explicitSecret?.trim()) return explicitSecret.trim()
  const fromConfig = (process.env.CONFIG_ENCRYPTION_KEY ?? '').trim()
  if (fromConfig) return fromConfig
  const fromSite = (process.env.SITE_API_TOKEN ?? '').trim()
  if (fromSite) return fromSite
  return ''
}

export function collectDecryptSecrets({ explicit, extra = [] } = {}) {
  const seen = new Set()
  const out = []
  for (const raw of [explicit, process.env.CONFIG_ENCRYPTION_KEY, process.env.SITE_API_TOKEN, ...extra]) {
    const secret = (raw ?? '').trim()
    if (!secret || seen.has(secret)) continue
    seen.add(secret)
    out.push(secret)
  }
  return out
}

function deriveKeyFromSecret(secret) {
  return scryptSync(secret, SALT, 32)
}

export function isEncryptedSecret(stored) {
  return !!stored && stored.startsWith(PREFIX)
}

export function encryptSecret(plaintext, secret) {
  if (plaintext == null || plaintext === '') return plaintext ?? null
  if (isEncryptedSecret(plaintext)) return plaintext
  if (!secret) throw new Error('encryption secret is required')
  const key = deriveKeyFromSecret(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decryptSecret(stored, secrets) {
  if (stored == null || stored === '') return stored ?? null
  if (!isEncryptedSecret(stored)) return stored
  const list = Array.isArray(secrets) ? secrets : [secrets]
  for (const secret of list) {
    if (!secret) continue
    try {
      const key = deriveKeyFromSecret(secret)
      const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url')
      if (raw.length < 29) continue
      const iv = raw.subarray(0, 12)
      const tag = raw.subarray(12, 28)
      const enc = raw.subarray(28)
      const decipher = createDecipheriv(ALGO, key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    } catch {
      // try next
    }
  }
  return null
}

/** Normalize stored value to plaintext (decrypt enc:v1: or pass through plaintext). */
export function toPlaintextApiKey(stored, decryptSecrets) {
  if (stored == null || stored === '') return null
  if (!isEncryptedSecret(stored)) return stored
  return decryptSecret(stored, decryptSecrets)
}

export function reencryptApiKey(stored, decryptSecrets, encryptSecretValue) {
  const plain = toPlaintextApiKey(stored, decryptSecrets)
  if (plain == null) return { ok: false, reason: 'decrypt_failed', plain: null, encrypted: null }
  const encrypted = encryptSecret(plain, encryptSecretValue)
  if (!encrypted) return { ok: false, reason: 'empty', plain, encrypted: null }
  if (encrypted === stored) return { ok: true, reason: 'unchanged', plain, encrypted }
  return { ok: true, reason: 'updated', plain, encrypted }
}
