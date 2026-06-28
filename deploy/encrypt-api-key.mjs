#!/usr/bin/env node
/**
 * Encrypt / decrypt ai_service_configs.api_key values (enc:v1:…) offline.
 * Algorithm matches workbench-server/src/common/security/secret-cipher.ts.
 *
 * Usage:
 *   node encrypt-api-key.mjs sk-your-plain-api-key
 *   node encrypt-api-key.mjs --env .env sk-your-plain-api-key
 *   node encrypt-api-key.mjs --secret "your-config-encryption-key" sk-...
 *   echo sk-... | node encrypt-api-key.mjs
 *   node encrypt-api-key.mjs --decrypt enc:v1:...
 *   node encrypt-api-key.mjs --sql ai_service_configs 1 sk-...
 *
 * Reads CONFIG_ENCRYPTION_KEY (then SITE_API_TOKEN) from deploy/.env by default.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectDecryptSecrets,
  decryptSecret,
  encryptSecret,
  loadEnvFile,
  resolvePrimarySecret,
} from './lib/secret-cipher.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => { buf += chunk })
    process.stdin.on('end', () => resolve(buf.trim()))
  })
}

function usage() {
  console.error(`Usage:
  node encrypt-api-key.mjs [options] <plaintext-api-key>
  echo <plaintext> | node encrypt-api-key.mjs [options]

Options:
  --env <path>       Load CONFIG_ENCRYPTION_KEY from env file (default: deploy/.env)
  --secret <key>     Override encryption secret (instead of env vars)
  --decrypt          Decrypt enc:v1: value instead of encrypting
  --verify           After encrypt, round-trip decrypt to stdout
  --sql <table> <id> Also print UPDATE statement (table: ai_service_configs | ai_preset_configs)
  -h, --help         Show this help

Examples:
  node encrypt-api-key.mjs sk-abc123
  node encrypt-api-key.mjs --env ../workbench-server/.env sk-abc123
  node encrypt-api-key.mjs --decrypt enc:v1:wrSZ3bsy...
  node encrypt-api-key.mjs --sql ai_service_configs 3 sk-abc123`)
}

async function main() {
  const args = process.argv.slice(2)
  let envPath = path.join(__dirname, '.env')
  let explicitSecret = ''
  let decryptMode = false
  let verifyMode = false
  let sqlTable = ''
  let sqlId = ''
  const positional = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') {
      usage()
      process.exit(0)
    }
    if (arg === '--env') {
      envPath = path.resolve(args[++i] ?? '')
      continue
    }
    if (arg === '--secret') {
      explicitSecret = args[++i] ?? ''
      continue
    }
    if (arg === '--decrypt') {
      decryptMode = true
      continue
    }
    if (arg === '--verify') {
      verifyMode = true
      continue
    }
    if (arg === '--sql') {
      sqlTable = args[++i] ?? ''
      sqlId = args[++i] ?? ''
      continue
    }
    positional.push(arg)
  }

  loadEnvFile(envPath)

  let input = positional.join(' ').trim()
  if (!input) input = await readStdin()
  if (!input) {
    usage()
    process.exit(1)
  }

  const primarySecret = resolvePrimarySecret(explicitSecret)
  const decryptCandidates = collectDecryptSecrets({ explicit: explicitSecret })

  if (decryptMode) {
    const plain = decryptSecret(input, decryptCandidates)
    if (plain == null) {
      console.error('Decrypt failed: wrong secret or corrupted enc:v1: payload')
      process.exit(2)
    }
    console.log(plain)
    return
  }

  const encrypted = encryptSecret(input, primarySecret)
  console.log(encrypted)

  if (verifyMode) {
    const roundtrip = decryptSecret(encrypted, decryptCandidates)
    if (roundtrip !== input) {
      console.error('Verify failed: round-trip decrypt mismatch')
      process.exit(3)
    }
    console.error('verify: ok')
  }

  if (sqlTable && sqlId) {
    const allowed = new Set(['ai_service_configs', 'ai_preset_configs'])
    if (!allowed.has(sqlTable)) {
      console.error(`--sql table must be one of: ${[...allowed].join(', ')}`)
      process.exit(1)
    }
    const escaped = encrypted.replace(/'/g, "''")
    console.error('')
    console.error(`-- SQL (${sqlTable}.id = ${sqlId})`)
    console.error(`UPDATE \`${sqlTable}\` SET api_key = '${escaped}' WHERE id = ${Number(sqlId)};`)
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
