import { drizzle } from 'drizzle-orm/mysql2'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { resolveMysqlUrl } from '../driver.js'
import * as schema from '../schema-mysql.js'
import { provisionMysqlCatalog } from '../provision-mysql.js'

let pool: mysql.Pool | undefined
let db: MySql2Database<typeof schema> | undefined

export async function initMysql(): Promise<void> {
  pool = mysql.createPool({
    uri: resolveMysqlUrl(),
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    waitForConnections: true,
  })

  if (process.env.DB_AUTO_INIT === 'false') {
    console.log('ℹ️ DB auto initialization disabled (DB_AUTO_INIT=false)')
  } else {
    await provisionMysqlCatalog(pool)
  }

  db = drizzle(pool, { schema, mode: 'default' })
  console.log('✅ MySQL database connected')
}

export function getMysqlDb(): MySql2Database<typeof schema> {
  if (!db) throw new Error('MySQL client not initialized')
  return db
}

export { schema }
