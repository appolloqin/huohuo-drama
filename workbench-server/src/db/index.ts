import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import './bootstrap.js'
import { isMysqlDriver } from './driver.js'
import { getSqliteDb, schema as sqliteSchema } from './sqlite/client.js'

export { isMysqlDriver, resolveDbDriver, resolveMysqlUrl } from './driver.js'
export type { DbDriver } from './driver.js'

function sqliteScriptDb(): BetterSQLite3Database<typeof sqliteSchema> {
  if (isMysqlDriver()) {
    throw new Error(
      '[DB] 直接 import { db, schema } 仅支持 DB_DRIVER=sqlite。MySQL 请使用 db/repositories。',
    )
  }
  return getSqliteDb()
}

export const db = new Proxy({} as BetterSQLite3Database<typeof sqliteSchema>, {
  get(_target, prop) {
    return Reflect.get(sqliteScriptDb() as object, prop)
  },
})

export const schema = sqliteSchema
export type DB = BetterSQLite3Database<typeof sqliteSchema>
