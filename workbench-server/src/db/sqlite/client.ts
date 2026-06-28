import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as schema from '../schema-sqlite.js'
import { provisionSqliteCatalog } from '../provision-sqlite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let db: BetterSQLite3Database<typeof schema> | undefined

export function initSqlite(): void {
  const sqliteFile = process.env.DB_PATH || path.resolve(__dirname, '../../../../workbench-data/huohuo_drama.db')
  fs.mkdirSync(path.dirname(sqliteFile), { recursive: true })

  const sqlite = new Database(sqliteFile, { timeout: 30000 })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 30000')
  sqlite.pragma('foreign_keys = ON')

  if (process.env.DB_AUTO_INIT === 'false') {
    console.log('ℹ️ DB auto initialization disabled (DB_AUTO_INIT=false)')
  } else {
    provisionSqliteCatalog(sqlite)
  }

  db = drizzle(sqlite, { schema })
  console.log('✅ SQLite database connected')
}

export function getSqliteDb(): BetterSQLite3Database<typeof schema> {
  if (!db) throw new Error('SQLite client not initialized')
  return db
}

export { schema }
