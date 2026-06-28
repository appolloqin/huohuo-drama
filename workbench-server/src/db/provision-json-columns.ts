/**
 * F2: normalize JSON-shaped TEXT/JSON columns on legacy databases.
 * New SQLite installs use JSON type + json_valid() in schema.sqlite.ddl.sql.
 */
import type Database from 'better-sqlite3'
import type { Pool, RowDataPacket } from 'mysql2/promise'

type JsonColumn = { table: string; column: string; fallback: string }

const JSON_COLUMNS: JsonColumn[] = [
  { table: 'dramas', column: 'tags', fallback: '[]' },
  { table: 'dramas', column: 'metadata', fallback: '{}' },
  { table: 'episodes', column: 'metadata', fallback: '{}' },
  { table: 'characters', column: 'reference_images', fallback: '[]' },
  { table: 'storyboards', column: 'reference_images', fallback: '[]' },
  { table: 'props', column: 'reference_images', fallback: '[]' },
  { table: 'image_generations', column: 'reference_images', fallback: '[]' },
  { table: 'video_generations', column: 'reference_image_urls', fallback: '[]' },
  { table: 'users', column: 'nav_modules_override', fallback: '[]' },
  { table: 'ai_service_configs', column: 'settings', fallback: '{}' },
  { table: 'ai_service_providers', column: 'preset_models', fallback: '[]' },
  { table: 'payment_provider_configs', column: 'settings', fallback: '{}' },
  { table: 'payment_orders', column: 'raw_payload', fallback: '{}' },
  { table: 'video_merges', column: 'scenes', fallback: '[]' },
  { table: 'batch_jobs', column: 'payload', fallback: '{}' },
  { table: 'batch_jobs', column: 'progress', fallback: '{}' },
  { table: 'generation_lessons', column: 'tags', fallback: '[]' },
]

function isValidJson(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function tableExistsSqlite(sqlite: Database.Database, table: string): boolean {
  const row = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  return !!row
}

function columnExistsSqlite(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some(c => c.name === column)
}

export function sanitizeJsonColumnsSqlite(sqlite: Database.Database): void {
  for (const { table, column, fallback } of JSON_COLUMNS) {
    if (!tableExistsSqlite(sqlite, table) || !columnExistsSqlite(sqlite, table, column)) continue
    const rows = sqlite.prepare(
      `SELECT id, ${column} AS val FROM ${table} WHERE ${column} IS NOT NULL AND trim(${column}) != ''`,
    ).all() as Array<{ id: number; val: string }>
    const stmt = sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`)
    for (const row of rows) {
      if (!isValidJson(row.val)) stmt.run(fallback, row.id)
    }
  }
}

export async function sanitizeJsonColumnsMysql(pool: Pool): Promise<void> {
  for (const { table, column, fallback } of JSON_COLUMNS) {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id, \`${column}\` AS val FROM \`${table}\`
         WHERE \`${column}\` IS NOT NULL AND trim(\`${column}\`) != ''`,
      )
      for (const row of rows as Array<{ id: number; val: string }>) {
        if (typeof row.val === 'string' && !isValidJson(row.val)) {
          await pool.execute(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ?`, [fallback, row.id])
        }
      }
    } catch {
      // table/column may not exist on partial legacy installs
    }
  }
}
