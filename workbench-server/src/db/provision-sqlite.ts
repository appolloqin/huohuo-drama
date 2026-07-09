/**
 * SQLite 启动建表、列补丁与种子数据（火火扩展逻辑）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { hashPassword } from '../common/auth/password.js'
import {
  backfillDramasUserIdSqlite,
  backfillAssetsFromGenerationsSqlite,
  backfillGenerationStorageSqlite,
  externalizeLargeTextSqlite,
  migratePlaintextApiKeysSqlite,
  sanitizeLegacyFieldValuesSqlite,
} from './provision-field-constraints.js'
import { sanitizeJsonColumnsSqlite } from './provision-json-columns.js'
import { migrateDramaColumnsSqlite } from './provision-drama-columns.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INDEXES_MARKER = '-- >>> INDEXES'

function readDdlFile(name: string) {
  return fs.readFileSync(path.join(__dirname, 'sql', name), 'utf8')
}

function splitSchemaDdl(name: string): [string, string] {
  const full = readDdlFile(name)
  const idx = full.indexOf(INDEXES_MARKER)
  if (idx < 0) return [full, '']
  return [full.slice(0, idx).trim(), full.slice(idx + INDEXES_MARKER.length).trim()]
}

function appendTableColumnIfAbsent(sqlite: Database.Database, table: string, column: string, definition: string) {
  const tableExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  if (!tableExists) return
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(col => col.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function applyLegacyColumnPatches(sqlite: Database.Database) {
  appendTableColumnIfAbsent(sqlite, 'episodes', 'metadata', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'dramas', 'user_id', 'INTEGER')
  appendTableColumnIfAbsent(sqlite, 'dramas', 'project_type', "TEXT NOT NULL DEFAULT 'drama'")
  appendTableColumnIfAbsent(sqlite, 'dramas', 'is_template', 'INTEGER DEFAULT 0')
  appendTableColumnIfAbsent(sqlite, 'dramas', 'is_template_only', 'INTEGER DEFAULT 0')
  appendTableColumnIfAbsent(sqlite, 'dramas', 'template_summary', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'users', 'credits', 'INTEGER NOT NULL DEFAULT 0')
  appendTableColumnIfAbsent(sqlite, 'users', 'nav_modules_override', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'users', 'wechat_mp_openid', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'users', 'wechat_unionid', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'credit_logs', 'token_count', 'INTEGER')
  appendTableColumnIfAbsent(sqlite, 'credit_logs', 'tokens_estimated', 'INTEGER DEFAULT 0')
  appendTableColumnIfAbsent(sqlite, 'payment_orders', 'paypal_order_id', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'video_merges', 'motion_pipeline', 'TEXT')
  // 「火火一键配置」每张卡片独立 api_key：列已加进 DDL；这里只补老库缺列的情况
  appendTableColumnIfAbsent(sqlite, 'ai_preset_configs', 'api_key', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'image_generations', 'storage_kind', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'image_generations', 'storage_uri', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'video_generations', 'storage_kind', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'video_generations', 'storage_uri', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'episodes', 'content_blob_path', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'episodes', 'script_blob_path', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'storyboards', 'image_prompt_blob_path', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'storyboards', 'video_prompt_blob_path', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'storyboards', 'dialogue_blob_path', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'agent_configs', 'system_prompt_blob_path', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'props', 'character_id', 'INTEGER')
  appendTableColumnIfAbsent(sqlite, 'props', 'character_form_id', 'INTEGER')
  appendTableColumnIfAbsent(sqlite, 'scenes', 'scene_mode', "TEXT DEFAULT 'backdrop'")
  appendTableColumnIfAbsent(sqlite, 'scenes', 'compose_config', 'TEXT')
  appendTableColumnIfAbsent(sqlite, 'image_generations', 'character_form_id', 'INTEGER')
  appendTableColumnIfAbsent(sqlite, 'storyboard_characters', 'character_form_id', 'INTEGER')
  // Backfill motion_pipeline on legacy merge rows: title-tagged frame_slideshow
  // rows get frame_slideshow; everything else (untagged pre-pipeline AI merges)
  // gets ai_video so the two workbenches never share a merge job.
  const vmExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name='video_merges' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (vmExists) {
    sqlite.prepare(`UPDATE video_merges SET motion_pipeline = 'frame_slideshow'
      WHERE motion_pipeline IS NULL AND title LIKE '%[frame_slideshow]%'`).run()
    sqlite.prepare(`UPDATE video_merges SET motion_pipeline = 'ai_video'
      WHERE motion_pipeline IS NULL`).run()
  }
}

function bootstrapAdminUserIfEmpty(sqlite: Database.Database) {
  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? '').trim()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? ''
  if (!username || !password) return
  const overwrite = /^(1|true|yes|on)$/i.test((process.env.BOOTSTRAP_ADMIN_OVERWRITE ?? '').trim())
  const row = sqlite.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined
  const ts = new Date().toISOString()
  const ph = hashPassword(password)
  if (row) {
    if (!overwrite) return
    sqlite.prepare(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?",
    ).run(ph, ts, username)
    return
  }
  sqlite.prepare(
    'INSERT INTO users (username, password_hash, role, credits, created_at, updated_at) VALUES (?,?,?,?,?,?)',
  ).run(username, ph, 'admin', 0, ts, ts)
}

function zeroCreditsWhenNoLedger(sqlite: Database.Database) {
  const hasLogs = sqlite.prepare('SELECT COUNT(1) as cnt FROM credit_logs').get() as { cnt: number }
  if (Number(hasLogs?.cnt || 0) > 0) return
  sqlite.prepare('UPDATE users SET credits = 0').run()
}

function ensurePaymentProviderRows(sqlite: Database.Database) {
  const ts = new Date().toISOString()
  const providers = ['paypal', 'pingpong', 'wechat', 'alipay']
  for (const provider of providers) {
    const row = sqlite.prepare('SELECT id FROM payment_provider_configs WHERE provider = ?').get(provider) as { id: number } | undefined
    if (row) continue
    sqlite.prepare(
      'INSERT INTO payment_provider_configs (provider, enabled, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(provider, 0, null, ts, ts)
  }
}

function bootstrapBuiltinAiProviders(sqlite: Database.Database) {
  const ts = new Date().toISOString()
  const rows: Array<{
    name: string
    displayName: string
    serviceType: string
    provider: string
    defaultUrl: string
    presetModels: string[]
    description: string
  }> = [
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
    const exists = sqlite.prepare(
      'SELECT id FROM ai_service_providers WHERE service_type = ? AND provider = ? LIMIT 1',
    ).get(row.serviceType, row.provider) as { id: number } | undefined
    if (exists) continue
    sqlite.prepare(`
      INSERT INTO ai_service_providers
        (name, display_name, service_type, provider, default_url, preset_models, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      row.name,
      row.displayName,
      row.serviceType,
      row.provider,
      row.defaultUrl,
      JSON.stringify(row.presetModels),
      row.description,
      ts,
      ts,
    )
  }
}

function retagMinimaxHostsFromHuohuo(sqlite: Database.Database) {
  sqlite.prepare(`
    UPDATE ai_service_configs
    SET provider = 'minimax', updated_at = datetime('now')
    WHERE provider = 'huohuo'
      AND (
        lower(base_url) LIKE '%minimaxi.com%'
        OR lower(base_url) LIKE '%minimax.io%'
        OR lower(base_url) LIKE '%/minimax%'
        OR lower(model) LIKE '%minimax%'
      )
  `).run()
}

function assignOrphanDramasToAdmin(sqlite: Database.Database) {
  backfillDramasUserIdSqlite(sqlite)
}

function renameSqliteProviderToHuohuo(sqlite: Database.Database) {
  const targets = [
    'ai_service_configs',
    'ai_service_providers',
    'ai_voices',
    'image_generations',
    'video_generations',
    'video_merges',
  ]
  for (const table of targets) {
    const tableExists = sqlite.prepare(
      `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    ).get(table) as { ok: number } | undefined
    if (!tableExists) continue
    const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some(col => col.name === 'provider')) continue
    sqlite.prepare(`UPDATE ${table} SET provider = ? WHERE provider = ?`).run('huohuo', 'sqlite')
  }
}

function dedupJunctionTables(sqlite: Database.Database) {
  sqlite.exec(`
    DELETE FROM episode_characters
    WHERE id NOT IN (
      SELECT MIN(id) FROM episode_characters GROUP BY episode_id, character_id
    )
  `)
  sqlite.exec(`
    DELETE FROM episode_scenes
    WHERE id NOT IN (
      SELECT MIN(id) FROM episode_scenes GROUP BY episode_id, scene_id
    )
  `)
}

/** 建表 + 补丁 + 种子（由 index.ts 在 DB_AUTO_INIT 时调用） */
export function provisionSqliteCatalog(sqlite: Database.Database) {
  const [tablesPart, indexesPart] = splitSchemaDdl('schema.sqlite.ddl.sql')
  sqlite.exec(tablesPart)
  applyLegacyColumnPatches(sqlite)
  migrateDramaColumnsSqlite(sqlite)
  sanitizeLegacyFieldValuesSqlite(sqlite)
  sanitizeJsonColumnsSqlite(sqlite)
  backfillGenerationStorageSqlite(sqlite)
  externalizeLargeTextSqlite(sqlite)
  backfillAssetsFromGenerationsSqlite(sqlite)
  migratePlaintextApiKeysSqlite(sqlite)
  dedupJunctionTables(sqlite)
  if (indexesPart) sqlite.exec(indexesPart)
  bootstrapAdminUserIfEmpty(sqlite)
  zeroCreditsWhenNoLedger(sqlite)
  ensurePaymentProviderRows(sqlite)
  bootstrapBuiltinAiProviders(sqlite)
  retagMinimaxHostsFromHuohuo(sqlite)
  assignOrphanDramasToAdmin(sqlite)
  renameSqliteProviderToHuohuo(sqlite)
}
