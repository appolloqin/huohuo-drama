/**
 * MySQL 启动建表、列补丁与种子数据（与 SQLite provision 逻辑对齐）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { hashPassword } from '../common/auth/password.js'
import { now } from '../common/http/response.js'
import { applyMysqlForeignKeys, applyMysqlSchemaUpgrades } from './provision-schema-upgrades.js'
import {
  backfillDramasUserIdMysql,
  backfillAssetsFromGenerationsMysql,
  backfillGenerationStorageMysql,
  enforceDramasUserIdNotNullMysql,
  externalizeLargeTextMysql,
  migratePlaintextApiKeysMysql,
  sanitizeLegacyFieldValuesMysql,
} from './provision-field-constraints.js'
import { sanitizeJsonColumnsMysql } from './provision-json-columns.js'
import { migrateDramaColumnsMysql } from './provision-drama-columns.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INDEXES_MARKER = '-- >>> INDEXES'

function readDdlFile(name: string) {
  return fs.readFileSync(path.join(__dirname, 'sql', 'mysql', name), 'utf8')
}

function splitSchemaDdl(name: string): [string, string] {
  const full = readDdlFile(name)
  const idx = full.indexOf(INDEXES_MARKER)
  if (idx < 0) return [full, '']
  return [full.slice(0, idx).trim(), full.slice(idx + INDEXES_MARKER.length).trim()]
}

async function indexExists(pool: Pool, table: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, indexName],
  )
  return rows.length > 0
}

async function execDdlSql(pool: Pool, sql: string) {
  for (const stmt of splitSqlStatements(sql)) {
    const indexMatch = stmt.match(/CREATE (UNIQUE )?INDEX IF NOT EXISTS\s+(\w+)\s+ON\s+(\w+)/is)
    if (indexMatch) {
      const [, , indexName, tableName] = indexMatch
      if (await indexExists(pool, tableName, indexName)) continue
      await pool.execute(stmt.replace(/IF NOT EXISTS\s+/i, ''))
      continue
    }
    const indexMatchPlain = stmt.match(/^CREATE (UNIQUE )?INDEX\s+(\w+)\s+ON\s+(\w+)/is)
    if (indexMatchPlain) {
      const [, , indexName, tableName] = indexMatchPlain
      if (await indexExists(pool, tableName, indexName)) continue
      try {
        await pool.execute(stmt)
      } catch (err: unknown) {
        const code = (err as { code?: string }).code
        if (code === 'ER_DUP_KEYNAME') continue
        throw err
      }
      continue
    }
    try {
      await pool.execute(stmt)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'ER_DUP_KEYNAME' || code === 'ER_TABLE_EXISTS_ERROR') continue
      throw err
    }
  }
}

/**
 * Split a DDL file into executable statements, ignoring `--` line comments
 * and `/* ... *​/` block comments so a `;` inside a comment never produces a
 * stray statement. The previous `sql.split(';')` happily emitted bare
 * comment-only chunks, which MySQL's prepared-statement protocol rejects
 * with ER_UNSUPPORTED_PS (errno 1295).
 *
 * Quoted string / identifier handling (`'...'`, `"..."`, backtick) is not
 * strictly required for our DDL files (no `;` inside any string literal),
 * but we still keep it simple: scan char-by-char and treat comment delimiters
 * as terminating a `;`-segment only when seen outside a string. Quoted
 * literals can contain `;` (e.g. `INSERT VALUES ('a;b')`); we protect them.
 */
function splitSqlStatements(sql: string): string[] {
  const stmts: string[] = []
  let buf = ''
  let i = 0
  const n = sql.length

  while (i < n) {
    const ch = sql[i]
    const next = i + 1 < n ? sql[i + 1] : ''

    // Line comment `--` (allow trailing newline). Drops until end of line.
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }

    // Block comment `/* ... */`. `/*! ... */` (MySQL conditional comments)
    // is preserved as-is so version-gated SQL keeps running; a plain
    // `/* ... */` is dropped because it would only produce a stray
    // comment-only statement that the prepared-statement protocol rejects.
    if (ch === '/' && next === '*') {
      const isConditional = i + 2 < n && sql[i + 2] === '!'
      if (isConditional) buf += '/*'
      i += 2
      while (i < n) {
        const c = sql[i]
        if (isConditional) buf += c
        if (c === '*' && i + 1 < n && sql[i + 1] === '/') {
          if (isConditional) buf += '/'
          i += 2
          break
        }
        i++
      }
      continue
    }

    // Quoted string literal: copy through, including the closing quote.
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      buf += ch
      i++
      while (i < n) {
        const c = sql[i]
        buf += c
        if (c === '\\' && i + 1 < n) {
          buf += sql[i + 1]
          i += 2
          continue
        }
        if (c === quote) {
          i++
          break
        }
        i++
      }
      continue
    }

    // Statement terminator.
    if (ch === ';') {
      const trimmed = buf.trim()
      if (trimmed) stmts.push(trimmed)
      buf = ''
      i++
      continue
    }

    buf += ch
    i++
  }

  const tail = buf.trim()
  if (tail) stmts.push(tail)
  return stmts
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table],
  )
  return rows.length > 0
}

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  )
  return rows.length > 0
}

async function appendTableColumnIfAbsent(pool: Pool, table: string, column: string, definition: string) {
  if (!(await tableExists(pool, table))) return
  if (await columnExists(pool, table, column)) return
  await pool.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
}

async function applyLegacyColumnPatches(pool: Pool) {
  await appendTableColumnIfAbsent(pool, 'episodes', 'metadata', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'dramas', 'user_id', 'INT')
  await appendTableColumnIfAbsent(pool, 'dramas', 'project_type', "VARCHAR(32) NOT NULL DEFAULT 'drama'")
  await appendTableColumnIfAbsent(pool, 'dramas', 'is_template', 'INT DEFAULT 0')
  await appendTableColumnIfAbsent(pool, 'dramas', 'is_template_only', 'INT DEFAULT 0')
  await appendTableColumnIfAbsent(pool, 'dramas', 'template_summary', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'users', 'credits', 'INT NOT NULL DEFAULT 0')
  await appendTableColumnIfAbsent(pool, 'users', 'nav_modules_override', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'users', 'wechat_mp_openid', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'users', 'wechat_unionid', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'credit_logs', 'token_count', 'INT')
  await appendTableColumnIfAbsent(pool, 'credit_logs', 'tokens_estimated', 'INT DEFAULT 0')
  await appendTableColumnIfAbsent(pool, 'payment_orders', 'paypal_order_id', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'video_merges', 'motion_pipeline', 'TEXT')
  // 「火火一键配置」每张卡片独立 api_key：列已加进 DDL；这里只补老库缺列的情况
  await appendTableColumnIfAbsent(pool, 'ai_preset_configs', 'api_key', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'image_generations', 'storage_kind', 'VARCHAR(16)')
  await appendTableColumnIfAbsent(pool, 'image_generations', 'storage_uri', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'video_generations', 'storage_kind', 'VARCHAR(16)')
  await appendTableColumnIfAbsent(pool, 'video_generations', 'storage_uri', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'episodes', 'content_blob_path', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'episodes', 'script_blob_path', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'storyboards', 'image_prompt_blob_path', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'storyboards', 'video_prompt_blob_path', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'storyboards', 'dialogue_blob_path', 'TEXT')
  await appendTableColumnIfAbsent(pool, 'agent_configs', 'system_prompt_blob_path', 'TEXT')
  if (await tableExists(pool, 'video_merges')) {
    await pool.execute(
      `UPDATE video_merges SET motion_pipeline = 'frame_slideshow'
       WHERE motion_pipeline IS NULL AND title LIKE '%[frame_slideshow]%'`,
    )
    await pool.execute(
      `UPDATE video_merges SET motion_pipeline = 'ai_video' WHERE motion_pipeline IS NULL`,
    )
  }
}

async function bootstrapAdminUserIfEmpty(pool: Pool) {
  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? '').trim()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? ''
  if (!username || !password) return
  const overwrite = /^(1|true|yes|on)$/i.test((process.env.BOOTSTRAP_ADMIN_OVERWRITE ?? '').trim())
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE username = ? LIMIT 1', [username])
  const ts = now()
  const ph = hashPassword(password)
  if (rows.length > 0) {
    if (!overwrite) return
    await pool.execute(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?',
      [ph, ts, username],
    )
    return
  }
  await pool.execute(
    'INSERT INTO users (username, password_hash, role, credits, created_at, updated_at) VALUES (?,?,?,?,?,?)',
    [username, ph, 'admin', 0, ts, ts],
  )
}

async function zeroCreditsWhenNoLedger(pool: Pool) {
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT COUNT(1) AS cnt FROM credit_logs')
  const cnt = Number((rows[0] as { cnt: number })?.cnt || 0)
  if (cnt > 0) return
  await pool.execute('UPDATE users SET credits = 0')
}

async function ensurePaymentProviderRows(pool: Pool) {
  const ts = now()
  const providers = ['paypal', 'pingpong', 'wechat', 'alipay']
  for (const provider of providers) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM payment_provider_configs WHERE provider = ? LIMIT 1',
      [provider],
    )
    if (rows.length > 0) continue
    await pool.execute(
      'INSERT INTO payment_provider_configs (provider, enabled, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [provider, 0, null, ts, ts],
    )
  }
}

async function bootstrapBuiltinAiProviders(pool: Pool) {
  const ts = now()
  const rows = [
    {
      name: 'minimax-text',
      displayName: 'MiniMax 文本',
      serviceType: 'text',
      provider: 'minimax',
      defaultUrl: 'https://api.minimaxi.com',
      presetModels: ['MiniMax-M3', 'MiniMax-M2.5'],
      description: 'OpenAI 兼容 /v1/chat/completions；M3 支持 thinking.type=disabled',
    },
    {
      name: 'minimax-image',
      displayName: 'MiniMax 图片',
      serviceType: 'image',
      provider: 'minimax',
      defaultUrl: 'https://api.minimaxi.com',
      presetModels: ['image-01'],
      description: 'OpenAI 兼容 /v1/image_generation',
    },
    {
      name: 'minimax-video',
      displayName: 'MiniMax 视频',
      serviceType: 'video',
      provider: 'minimax',
      defaultUrl: 'https://api.minimaxi.com',
      presetModels: ['MiniMax-Hailuo-2.3'],
      description: 'OpenAI 兼容 /v1/video_generation',
    },
    {
      name: 'minimax-audio',
      displayName: 'MiniMax 音频',
      serviceType: 'audio',
      provider: 'minimax',
      defaultUrl: 'https://api.minimaxi.com',
      presetModels: ['speech-2.8-hd'],
      description: 'TTS /v1/t2a_v2',
    },
  ]
  for (const row of rows) {
    const [exists] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM ai_service_providers WHERE service_type = ? AND provider = ? LIMIT 1',
      [row.serviceType, row.provider],
    )
    if (exists.length > 0) continue
    await pool.execute(
      `INSERT INTO ai_service_providers
        (name, display_name, service_type, provider, default_url, preset_models, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        row.name,
        row.displayName,
        row.serviceType,
        row.provider,
        row.defaultUrl,
        JSON.stringify(row.presetModels),
        row.description,
        ts,
        ts,
      ],
    )
  }
}

async function retagMinimaxHostsFromHuohuo(pool: Pool) {
  const ts = now()
  await pool.execute(
    `UPDATE ai_service_configs
     SET provider = 'minimax', updated_at = ?
     WHERE provider = 'huohuo'
       AND (
         LOWER(base_url) LIKE '%minimaxi.com%'
         OR LOWER(base_url) LIKE '%minimax.io%'
         OR LOWER(base_url) LIKE '%/minimax%'
         OR LOWER(model) LIKE '%minimax%'
       )`,
    [ts],
  )
}

async function assignOrphanDramasToAdmin(pool: Pool) {
  await backfillDramasUserIdMysql(pool)
}

async function renameSqliteProviderToHuohuo(pool: Pool) {
  const targets = [
    'ai_service_configs',
    'ai_service_providers',
    'ai_voices',
    'image_generations',
    'video_generations',
    'video_merges',
  ]
  for (const table of targets) {
    if (!(await tableExists(pool, table))) continue
    if (!(await columnExists(pool, table, 'provider'))) continue
    await pool.execute(`UPDATE \`${table}\` SET provider = ? WHERE provider = ?`, ['huohuo','sqlite'])
  }
}

async function dedupJunctionTables(pool: Pool) {
  await pool.execute(`
    DELETE ec FROM episode_characters ec
    INNER JOIN episode_characters newer
      ON ec.episode_id = newer.episode_id
     AND ec.character_id = newer.character_id
     AND ec.id > newer.id
  `)
  await pool.execute(`
    DELETE es FROM episode_scenes es
    INNER JOIN episode_scenes newer
      ON es.episode_id = newer.episode_id
     AND es.scene_id = newer.scene_id
     AND es.id > newer.id
  `)
}

/** 建表 + 补丁 + 种子（由 index.ts 在 DB_AUTO_INIT 时调用） */
export async function provisionMysqlCatalog(pool: Pool) {
  const [tablesPart, indexesPart] = splitSchemaDdl('schema.mysql.ddl.sql')
  await execDdlSql(pool, tablesPart)
  await applyLegacyColumnPatches(pool)
  await migrateDramaColumnsMysql(pool)
  await applyMysqlSchemaUpgrades(pool)
  await sanitizeLegacyFieldValuesMysql(pool)
  await sanitizeJsonColumnsMysql(pool)
  await backfillGenerationStorageMysql(pool)
  await externalizeLargeTextMysql(pool)
  await backfillAssetsFromGenerationsMysql(pool)
  await migratePlaintextApiKeysMysql(pool)
  await dedupJunctionTables(pool)
  if (indexesPart) await execDdlSql(pool, indexesPart)
  await bootstrapAdminUserIfEmpty(pool)
  await zeroCreditsWhenNoLedger(pool)
  await ensurePaymentProviderRows(pool)
  await bootstrapBuiltinAiProviders(pool)
  await retagMinimaxHostsFromHuohuo(pool)
  await assignOrphanDramasToAdmin(pool)
  await renameSqliteProviderToHuohuo(pool)
  await enforceDramasUserIdNotNullMysql(pool)
  await applyMysqlForeignKeys(pool)
}
