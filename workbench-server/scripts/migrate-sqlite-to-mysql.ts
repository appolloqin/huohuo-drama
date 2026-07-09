/**
 * SQLite → MySQL 数据迁移
 *
 * 用法：
 *   cd workbench-server
 *   npm run migrate:sqlite-to-mysql
 *   npm run migrate:sqlite-to-mysql -- --truncate          # 清空 MySQL 目标表后导入
 *   npm run migrate:sqlite-to-mysql -- --dry-run           # 仅统计行数
 *   npm run migrate:sqlite-to-mysql -- --sqlite=../workbench-data/huohuo_drama.db
 *
 * 环境变量（workbench-server/.env）：
 *   DB_PATH 或 --sqlite     源 SQLite 文件（默认 ../workbench-data/huohuo_drama.db）
 *   DATABASE_URL / MYSQL_*  目标 MySQL 连接
 *
 * 说明：
 * - 会先对 MySQL 执行 provision（建表、补列），可用 --skip-provision 跳过
 * - 使用 REPLACE INTO 保留原 id；media 文件需自行复制 workbench-data/static/
 * - 迁移期间请停止 workbench-server，避免双写
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import mysql from 'mysql2/promise'
import '../src/load-env.js'
import { resolveMysqlUrl } from '../src/db/driver.js'
import { provisionMysqlCatalog } from '../src/db/provision-mysql.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SQLITE = path.resolve(__dirname, '../../workbench-data/huohuo_drama.db')

/** 按外键依赖排序；未列出的表排在末尾 */
const TABLE_ORDER = [
  'users',
  'app_settings',
  'payment_provider_configs',
  'ai_service_providers',
  'ai_service_configs',
  'agent_configs',
  'ai_voices',
  'dramas',
  'episodes',
  'characters',
  'character_forms',
  'scenes',
  'props',
  'assets',
  'storyboards',
  'episode_characters',
  'episode_scenes',
  'episode_props',
  'storyboard_characters',
  'storyboard_props',
  'image_generations',
  'video_generations',
  'video_merges',
  'credit_logs',
  'payment_orders',
  'generation_lessons',
  'batch_jobs',
]

const TABLE_NAME_RE = /^[a-z][a-z0-9_]*$/

type CliOptions = {
  sqlitePath: string
  dryRun: boolean
  truncate: boolean
  skipProvision: boolean
  batchSize: number
}

function scriptArgs(): string[] {
  return process.argv.filter(arg => arg.startsWith('--') || arg === '-h')
}

function parseArgs(argv: string[]): CliOptions {
  let sqlitePath = process.env.DB_PATH || DEFAULT_SQLITE
  let dryRun = process.env.MIGRATE_DRY_RUN === '1' || process.env.MIGRATE_DRY_RUN === 'true'
  let truncate = process.env.MIGRATE_TRUNCATE === '1' || process.env.MIGRATE_TRUNCATE === 'true'
  let skipProvision = false
  let batchSize = 200

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--truncate') truncate = true
    else if (arg === '--skip-provision') skipProvision = true
    else if (arg.startsWith('--sqlite=')) sqlitePath = path.resolve(arg.slice('--sqlite='.length))
    else if (arg.startsWith('--batch=')) {
      const n = Number(arg.slice('--batch='.length))
      if (Number.isFinite(n) && n > 0) batchSize = Math.min(1000, Math.trunc(n))
    } else if (arg === '--help' || arg === '-h') {
      console.log(`用法: npm run migrate:sqlite-to-mysql -- [选项]

选项:
  --sqlite=<path>    源 SQLite 文件（默认 DB_PATH 或 workbench-data/huohuo_drama.db）
  --truncate         导入前清空 MySQL 中对应表（保留表结构）
  --dry-run          只统计，不写入 MySQL
  --skip-provision   跳过 MySQL 建表/补列
  --batch=<n>        批量写入大小（默认 200）
  -h, --help         显示帮助`)
      process.exit(0)
    }
  }

  return { sqlitePath, dryRun, truncate, skipProvision, batchSize }
}

function assertSafeTableName(name: string) {
  if (!TABLE_NAME_RE.test(name)) {
    throw new Error(`非法表名: ${name}`)
  }
}

function sortTables(names: string[]): string[] {
  const rank = new Map(TABLE_ORDER.map((t, i) => [t, i]))
  return [...names].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : 10_000
    const rb = rank.has(b) ? rank.get(b)! : 10_000
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
}

function listSqliteTables(sqlite: Database.Database): string[] {
  const rows = sqlite.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>
  return rows.map(r => r.name).filter(name => TABLE_NAME_RE.test(name))
}

function listSqliteColumns(sqlite: Database.Database, table: string): string[] {
  assertSafeTableName(table)
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.map(r => r.name)
}

async function listMysqlTables(pool: mysql.Pool): Promise<Set<string>> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
  )
  return new Set(rows.map(r => String(r.name)))
}

function normalizeCell(value: unknown): unknown {
  if (value === undefined) return null
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isSafeInteger(n) ? n : String(value)
  }
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  return value
}

function rowValues(columns: string[], row: Record<string, unknown>): unknown[] {
  return columns.map(col => normalizeCell(row[col]))
}

async function widenMysqlTextColumns(pool: mysql.Pool) {
  const alters: Array<{ table: string; column: string }> = [
    { table: 'dramas', column: 'metadata' },
    { table: 'dramas', column: 'description' },
    { table: 'dramas', column: 'template_summary' },
    { table: 'episodes', column: 'metadata' },
    { table: 'episodes', column: 'content' },
    { table: 'episodes', column: 'script_content' },
    { table: 'episodes', column: 'formatted_script' },
    { table: 'storyboards', column: 'description' },
    { table: 'storyboards', column: 'video_prompt' },
    { table: 'storyboards', column: 'image_prompt' },
    { table: 'storyboards', column: 'dialogue' },
    { table: 'generation_lessons', column: 'content' },
    { table: 'batch_jobs', column: 'payload' },
  ]

  const mysqlTables = await listMysqlTables(pool)
  for (const { table, column } of alters) {
    if (!mysqlTables.has(table)) continue
    assertSafeTableName(table)
    if (!/^[a-z][a-z0-9_]*$/.test(column)) continue
    try {
      await pool.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` LONGTEXT`)
      console.log(`[schema] ${table}.${column} → LONGTEXT`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[warn] 无法扩展 ${table}.${column}: ${msg}`)
    }
  }
}

async function truncateMysqlTables(pool: mysql.Pool, tables: string[]) {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of [...tables].reverse()) {
    assertSafeTableName(table)
    await pool.query(`TRUNCATE TABLE \`${table}\``)
    console.log(`[truncate] ${table}`)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')
}

async function importTable(
  pool: mysql.Pool,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  batchSize: number,
) {
  if (!rows.length) return

  const colList = columns.map(c => `\`${c}\``).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const sql = `REPLACE INTO \`${table}\` (${colList}) VALUES (${placeholders})`

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (let i = 0; i < chunk.length; i++) {
        try {
          await conn.execute(sql, rowValues(columns, chunk[i]))
        } catch (err) {
          const rowNo = offset + i + 1
          const id = chunk[i]?.id
          const message = err instanceof Error ? err.message : String(err)
          throw new Error(`${table} 第 ${rowNo} 行${id != null ? ` (id=${id})` : ''} 写入失败: ${message}`)
        }
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  }
}

async function main() {
  const opts = parseArgs(scriptArgs())

  if (!fs.existsSync(opts.sqlitePath)) {
    console.error(`[error] SQLite 文件不存在: ${opts.sqlitePath}`)
    process.exit(1)
  }

  const mysqlUrl = resolveMysqlUrl()
  const maskedUrl = mysqlUrl.replace(/:([^:@/]+)@/, ':***@')
  console.log(`[migrate] source sqlite: ${opts.sqlitePath}`)
  console.log(`[migrate] target mysql:  ${maskedUrl}`)

  const sqlite = new Database(opts.sqlitePath, { readonly: true, fileMustExist: true })
  const pool = mysql.createPool({
    uri: mysqlUrl,
    connectionLimit: 4,
    waitForConnections: true,
    multipleStatements: true,
  })

  try {
    if (!opts.skipProvision) {
      console.log('[migrate] provisioning MySQL schema…')
      await provisionMysqlCatalog(pool)
    }

    const sqliteTables = listSqliteTables(sqlite)
    const mysqlTables = await listMysqlTables(pool)
    const shared = sortTables(sqliteTables.filter(t => mysqlTables.has(t)))
    const sqliteOnly = sqliteTables.filter(t => !mysqlTables.has(t))
    const mysqlOnly = [...mysqlTables].filter(t => !sqliteTables.includes(t)).sort()

    if (sqliteOnly.length) {
      console.warn(`[warn] SQLite 独有表（跳过）: ${sqliteOnly.join(', ')}`)
    }
    if (mysqlOnly.length) {
      console.warn(`[warn] MySQL 独有表（保持原样）: ${mysqlOnly.join(', ')}`)
    }

    if (!shared.length) {
      console.error('[error] 没有可迁移的共有表')
      process.exit(1)
    }

    if (opts.truncate && !opts.dryRun) {
      console.log('[migrate] truncating target tables…')
      await truncateMysqlTables(pool, shared)
    }

    if (!opts.dryRun) {
      console.log('[migrate] widening large TEXT columns…')
      await widenMysqlTextColumns(pool)
    }

    let totalRows = 0
    for (const table of shared) {
      const columns = listSqliteColumns(sqlite, table)
      const rows = sqlite.prepare(`SELECT * FROM \`${table}\``).all() as Record<string, unknown>[]
      totalRows += rows.length
      console.log(`[table] ${table}: ${rows.length} row(s)`)

      if (opts.dryRun || !rows.length) continue
      await importTable(pool, table, columns, rows, opts.batchSize)
    }

    if (opts.dryRun) {
      console.log(`[dry-run] 共 ${shared.length} 张表、${totalRows} 行，未写入 MySQL`)
    } else {
      console.log(`[done] 已迁移 ${shared.length} 张表、${totalRows} 行`)
      console.log('[hint] 请确认 workbench-data/static/ 已复制到目标环境，并将 workbench-server/.env 设为 DB_DRIVER=mysql')
    }
  } finally {
    sqlite.close()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('[error]', err instanceof Error ? err.message : err)
  process.exit(1)
})
