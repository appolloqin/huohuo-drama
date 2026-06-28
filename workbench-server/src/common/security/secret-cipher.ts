import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'
const SALT = 'huohuo-config-v1'

/** Primary secret for new encryptions: CONFIG_ENCRYPTION_KEY, else SITE_API_TOKEN. */
function primaryEncryptionSecret(): string {
  return (process.env.CONFIG_ENCRYPTION_KEY ?? process.env.SITE_API_TOKEN ?? '').trim()
}

/** All secrets to try when decrypting (handles key rotation / stale shell env). */
function encryptionSecretCandidates(): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [process.env.CONFIG_ENCRYPTION_KEY, process.env.SITE_API_TOKEN]) {
    const secret = (raw ?? '').trim()
    if (!secret || seen.has(secret)) continue
    seen.add(secret)
    out.push(secret)
  }
  return out
}

function deriveKeyFromSecret(secret: string): Buffer {
  return scryptSync(secret, SALT, 32)
}

function derivePrimaryKey(): Buffer | null {
  const secret = primaryEncryptionSecret()
  if (!secret) return null
  return deriveKeyFromSecret(secret)
}

function tryDecryptWithSecret(stored: string, secret: string): string | null {
  try {
    const key = deriveKeyFromSecret(secret)
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url')
    if (raw.length < 29) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const enc = raw.subarray(28)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function isSecretEncryptionEnabled(): boolean {
  return derivePrimaryKey() !== null
}

export function isEncryptedSecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX)
}

/** Encrypt when CONFIG_ENCRYPTION_KEY (or SITE_API_TOKEN fallback) is set; else passthrough. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return plaintext ?? null
  if (isEncryptedSecret(plaintext)) return plaintext
  const key = derivePrimaryKey()
  if (!key) return plaintext

  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url')
}

/** Decrypt enc:v1: values; legacy plaintext passes through unchanged. Never throws. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return stored ?? null
  if (!isEncryptedSecret(stored)) return stored

  for (const secret of encryptionSecretCandidates()) {
    const plain = tryDecryptWithSecret(stored, secret)
    if (plain != null) return plain
  }

  console.warn('[secret-cipher] api_key decrypt failed (wrong CONFIG_ENCRYPTION_KEY or corrupted data)')
  return null
}
