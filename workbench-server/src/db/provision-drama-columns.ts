/**
 * 短剧专用列：重命名 + formatted_script 分列（小说仍用 script_content 作 writing brief）。
 */
import type Database from 'better-sqlite3'
import type { Pool, RowDataPacket } from 'mysql2/promise'

function tableExistsSqlite(sqlite: Database.Database, table: string): boolean {
  const row = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  return Boolean(row)
}

function columnExistsSqlite(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return cols.some(c => c.name === column)
}

function renameColumnSqlite(sqlite: Database.Database, table: string, from: string, to: string) {
  if (!tableExistsSqlite(sqlite, table)) return
  if (!columnExistsSqlite(sqlite, table, from)) return
  if (columnExistsSqlite(sqlite, table, to)) return
  sqlite.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`)
}

function appendColumnSqlite(sqlite: Database.Database, table: string, column: string, definition: string) {
  if (!tableExistsSqlite(sqlite, table)) return
  if (columnExistsSqlite(sqlite, table, column)) return
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function migrateDramaEpisodeTextSplitSqlite(sqlite: Database.Database) {
  if (!tableExistsSqlite(sqlite, 'episodes') || !tableExistsSqlite(sqlite, 'dramas')) return
  if (!columnExistsSqlite(sqlite, 'episodes', 'formatted_script')) return

  sqlite.exec(`
    UPDATE episodes SET formatted_script = script_content, script_content = NULL
    WHERE drama_id IN (SELECT id FROM dramas WHERE project_type = 'drama')
      AND script_content IS NOT NULL AND trim(script_content) != ''
      AND (formatted_script IS NULL OR trim(formatted_script) = '')
  `)

  if (columnExistsSqlite(sqlite, 'episodes', 'formatted_script_blob_path')) {
    sqlite.exec(`
      UPDATE episodes SET formatted_script_blob_path = script_blob_path, script_blob_path = NULL
      WHERE drama_id IN (SELECT id FROM dramas WHERE project_type = 'drama')
        AND script_blob_path IS NOT NULL AND trim(script_blob_path) != ''
        AND (formatted_script_blob_path IS NULL OR trim(formatted_script_blob_path) = '')
    `)
  }
}

export function migrateDramaColumnsSqlite(sqlite: Database.Database): void {
  renameColumnSqlite(sqlite, 'characters', 'voice_style', 'voice_id')
  renameColumnSqlite(sqlite, 'characters', 'voice_sample_url', 'voice_preview_url')
  renameColumnSqlite(sqlite, 'episodes', 'image_config_id', 'drama_image_config_id')
  renameColumnSqlite(sqlite, 'episodes', 'video_config_id', 'drama_video_config_id')
  renameColumnSqlite(sqlite, 'episodes', 'audio_config_id', 'drama_audio_config_id')

  appendColumnSqlite(sqlite, 'episodes', 'formatted_script', 'TEXT')
  appendColumnSqlite(sqlite, 'episodes', 'formatted_script_blob_path', 'TEXT')

  migrateDramaEpisodeTextSplitSqlite(sqlite)
}

async function tableExistsMysql(pool: Pool, table: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

async function columnExistsMysql(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

async function renameColumnMysql(pool: Pool, table: string, from: string, to: string, definition: string) {
  if (!(await tableExistsMysql(pool, table))) return
  if (!(await columnExistsMysql(pool, table, from))) return
  if (await columnExistsMysql(pool, table, to)) return
  await pool.execute(`ALTER TABLE \`${table}\` CHANGE \`${from}\` \`${to}\` ${definition}`)
}

async function appendColumnMysql(pool: Pool, table: string, column: string, definition: string) {
  if (!(await tableExistsMysql(pool, table))) return
  if (await columnExistsMysql(pool, table, column)) return
  await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
}

async function migrateDramaEpisodeTextSplitMysql(pool: Pool) {
  if (!(await tableExistsMysql(pool, 'episodes'))) return
  if (!(await columnExistsMysql(pool, 'episodes', 'formatted_script'))) return

  await pool.execute(`
    UPDATE episodes e
    INNER JOIN dramas d ON d.id = e.drama_id
    SET e.formatted_script = e.script_content, e.script_content = NULL
    WHERE d.project_type = 'drama'
      AND e.script_content IS NOT NULL AND trim(e.script_content) != ''
      AND (e.formatted_script IS NULL OR trim(e.formatted_script) = '')
  `)

  if (await columnExistsMysql(pool, 'episodes', 'formatted_script_blob_path')) {
    await pool.execute(`
      UPDATE episodes e
      INNER JOIN dramas d ON d.id = e.drama_id
      SET e.formatted_script_blob_path = e.script_blob_path, e.script_blob_path = NULL
      WHERE d.project_type = 'drama'
        AND e.script_blob_path IS NOT NULL AND trim(e.script_blob_path) != ''
        AND (e.formatted_script_blob_path IS NULL OR trim(e.formatted_script_blob_path) = '')
    `)
  }
}

export async function migrateDramaColumnsMysql(pool: Pool): Promise<void> {
  await renameColumnMysql(pool, 'characters', 'voice_style', 'voice_id', 'TEXT')
  await renameColumnMysql(pool, 'characters', 'voice_sample_url', 'voice_preview_url', 'TEXT')
  await renameColumnMysql(pool, 'episodes', 'image_config_id', 'drama_image_config_id', 'INT')
  await renameColumnMysql(pool, 'episodes', 'video_config_id', 'drama_video_config_id', 'INT')
  await renameColumnMysql(pool, 'episodes', 'audio_config_id', 'drama_audio_config_id', 'INT')

  await appendColumnMysql(pool, 'episodes', 'formatted_script', 'TEXT')
  await appendColumnMysql(pool, 'episodes', 'formatted_script_blob_path', 'TEXT')

  await migrateDramaEpisodeTextSplitMysql(pool)
}
