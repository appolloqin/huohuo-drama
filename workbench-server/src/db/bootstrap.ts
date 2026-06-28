/**
 * 应用启动时初始化数据库连接（SQLite 或 MySQL）。
 * 须在任意 repository 查询之前 import（index.ts 在 load-env 之后立即加载）。
 */
import '../load-env.js'
import { isMysqlDriver } from './driver.js'
import { initMysql } from './mysql/client.js'
import { initSqlite } from './sqlite/client.js'

let ready = false

export async function ensureDatabaseReady(): Promise<void> {
  if (ready) return
  if (isMysqlDriver()) {
    await initMysql()
  } else {
    initSqlite()
  }
  ready = true
}

await ensureDatabaseReady()
