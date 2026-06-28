#!/usr/bin/env node
/**
 * Batch re-encrypt api_key rows (ai_service_configs / ai_preset_configs).
 * Decrypt with --from-secret (or env) and encrypt with --to-secret (or CONFIG_ENCRYPTION_KEY).
 *
 * Usage:
 *   node reencrypt-api-keys.mjs --env .env --from-secret test-key-for-smoke --dry-run
 *   node reencrypt-api-keys.mjs --env .env --from-secret test-key-for-smoke --apply
 *   node reencrypt-api-keys.mjs --env ../workbench-server/.env --apply
 *
 * Default is --dry-run (preview only). Pass --apply to write to the database.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  collectDecryptSecrets,
  loadEnvFile,
  reencryptApiKey,
  resolvePrimarySecret,
} from './lib/secret-cipher.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const ROOT = path.resolve(__dirname, '..')
const SERVER_NODE_MODULES = path.join(ROOT, 'workbench-server', 'node_modules')
const TABLES = ['ai_service_configs', 'ai_preset_configs']

async function importFromServer(pkg) {
  const modPath = path.join(SERVER_NODE_MODULES, pkg)
  const tryPaths = [modPath, `${modPath}.js`, path.join(modPath, 'index.js')]
  const hit = tryPaths.find(p => fs.existsSync(p))
  if (!hit) throw new Error(`Missing ${pkg}. Run npm install in workbench-server/ first.`)
  return import(pathToFileURL(hit.replace(/\\/g, '/')).href)
}

function usage() {
  console.error(`Usage:
  node reencrypt-api-keys.mjs [options]

Options:
  --env <path>         Env file (default: deploy/.env)
  --from-secret <key>  Old encryption key (optional; also tries CONFIG_ENCRYPTION_KEY / SITE_API_TOKEN)
  --to-secret <key>    New encryption key (default: CONFIG_ENCRYPTION_KEY from env)
  --dry-run            Preview changes only (default)
  --apply              Write updates to database
  -h, --help           Show help

Examples:
  node reencrypt-api-keys.mjs --env .env --from-secret test-key-for-smoke --dry-run
  node reencrypt-api-keys.mjs --env .env --from-secret test-key-for-smoke --apply
  node reencrypt-api-keys.mjs --env ../workbench-server/.env --apply`)
}

function parseArgs(argv) {
  let envPath = path.join(__dirname, '.env')
  let fromSecret = ''
  let toSecret = ''
  let apply = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      usage()
      process.exit(0)
    }
    if (arg === '--env') {
      envPath = path.resolve(argv[++i] ?? '')
      continue
    }
    if (arg === '--from-secret') {
      fromSecret = argv[++i] ?? ''
      continue
    }
    if (arg === '--to-secret') {
      toSecret = argv[++i] ?? ''
      continue
    }
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--dry-run') {
      apply = false
      continue
    }
    console.error(`Unknown option: ${arg}`)
    usage()
    process.exit(1)
  }

  return { envPath, fromSecret, toSecret, apply }
}

async function loadMysqlRows() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url?.startsWith('mysql://')) {
    throw new Error('DATABASE_URL (mysql://…) is required for MySQL')
  }
  const mysql = await importFromServer('mysql2/promise')
  const pool = mysql.default.createPool(url)
  const rows = []
  try {
    for (const table of TABLES) {
      const [tableRows] = await pool.query(
        `SELECT id, api_key FROM \`${table}\` WHERE api_key IS NOT NULL AND trim(api_key) != ''`,
      )
      for (const row of tableRows) {
        rows.push({ table, id: row.id, apiKey: row.api_key })
      }
    }
  } finally {
    await pool.end()
  }
  return rows
}

function loadSqliteRows() {
  const Database = require(path.join(SERVER_NODE_MODULES, 'better-sqlite3'))
  const dbPath = process.env.DB_PATH?.trim()
    || path.join(ROOT, 'workbench-data', 'huohuo_drama.db')
  if (!fs.existsSync(dbPath)) throw new Error(`SQLite database not found: ${dbPath}`)
  const db = new Database(dbPath, { readonly: true })
  const rows = []
  for (const table of TABLES) {
    const tableRows = db.prepare(
      `SELECT id, api_key AS apiKey FROM ${table} WHERE api_key IS NOT NULL AND trim(api_key) != ''`,
    ).all()
    for (const row of tableRows) rows.push({ table, id: row.id, apiKey: row.apiKey })
  }
  db.close()
  return rows
}

async function loadRows() {
  if (process.env.DB_DRIVER === 'sqlite') return loadSqliteRows()
  return loadMysqlRows()
}

async function applyMysqlUpdates(updates) {
  const url = process.env.DATABASE_URL?.trim()
  const mysql = await importFromServer('mysql2/promise')
  const pool = mysql.default.createPool(url)
  try {
    for (const u of updates) {
      await pool.execute(`UPDATE \`${u.table}\` SET api_key = ? WHERE id = ?`, [u.encrypted, u.id])
    }
  } finally {
    await pool.end()
  }
}

function applySqliteUpdates(updates) {
  const Database = require(path.join(SERVER_NODE_MODULES, 'better-sqlite3'))
  const dbPath = process.env.DB_PATH?.trim()
    || path.join(ROOT, 'workbench-data', 'huohuo_drama.db')
  const db = new Database(dbPath)
  const stmtByTable = Object.fromEntries(
    TABLES.map(t => [t, db.prepare(`UPDATE ${t} SET api_key = ? WHERE id = ?`)]),
  )
  const tx = db.transaction((items) => {
    for (const u of items) stmtByTable[u.table].run(u.encrypted, u.id)
  })
  tx(updates)
  db.close()
}

function printSqlUpdates(updates) {
  for (const u of updates) {
    const escaped = u.encrypted.replace(/'/g, "''")
    console.log(`UPDATE \`${u.table}\` SET api_key = '${escaped}' WHERE id = ${u.id};`)
  }
}

async function main() {
  const { envPath, fromSecret, toSecret, apply } = parseArgs(process.argv.slice(2))
  loadEnvFile(envPath)

  const decryptSecrets = collectDecryptSecrets({ explicit: fromSecret })
  const encryptSecretValue = resolvePrimarySecret(toSecret)
  if (!encryptSecretValue) {
    throw new Error('--to-secret or CONFIG_ENCRYPTION_KEY in env is required')
  }
  if (!decryptSecrets.length) {
    throw new Error('No decrypt secret: set --from-secret or CONFIG_ENCRYPTION_KEY / SITE_API_TOKEN in env')
  }

  const rows = await loadRows()
  if (!rows.length) {
    console.log('No api_key rows found.')
    return
  }

  const planned = []
  let unchanged = 0
  let failed = 0

  for (const row of rows) {
    const result = reencryptApiKey(row.apiKey, decryptSecrets, encryptSecretValue)
    if (!result.ok) {
      failed += 1
      console.error(`FAIL ${row.table}#${row.id}: ${result.reason}`)
      continue
    }
    if (result.reason === 'unchanged') {
      unchanged += 1
      console.log(`SKIP ${row.table}#${row.id}: already encrypted with target key`)
      continue
    }
    planned.push({ table: row.table, id: row.id, encrypted: result.encrypted })
    console.log(`PLAN ${row.table}#${row.id}: re-encrypt`)
  }

  console.error('')
  console.error(`Summary: ${planned.length} to update, ${unchanged} unchanged, ${failed} failed`)

  if (!planned.length) return

  printSqlUpdates(planned)

  if (!apply) {
    console.error('')
    console.error('Dry run only. Re-run with --apply to write to the database.')
    return
  }

  if (process.env.DB_DRIVER === 'sqlite') {
    applySqliteUpdates(planned)
  } else {
    await applyMysqlUpdates(planned)
  }
  console.error(`Applied ${planned.length} update(s).`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
