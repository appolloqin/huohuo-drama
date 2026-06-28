/**
 * F1 field-level constraints: backfill + MySQL column enforcement for legacy DBs.
 * New installs get CHECK/NOT NULL from schema.*.ddl.sql CREATE TABLE.
 */
import type Database from 'better-sqlite3'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  isSecretEncryptionEnabled,
} from '../common/security/secret-cipher.js'
import {
  persistInlineOrBlob,
  resolveInlineOrBlob,
  TEXT_BLOB_THRESHOLD,
} from '../common/storage/text-blob-storage.js'
import {
  novelChapterContentRelativePath,
  persistNovelChapterContentToDisk,
} from '../common/novel/novel-chapter-content-storage.js'
import { countNovelChars } from '../common/novel/novel-char-limit.js'
import { mergeEpisodeMetadata } from '../common/drama/episode-meta.js'
import { parseJsonColumnObject } from '../common/db/parse-json-column.js'
import { now } from '../common/http/response.js'

function resolveDramaOwnerIdSqlite(sqlite: Database.Database): number | null {
  const admin = sqlite.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').get('admin') as { id: number } | undefined
  if (admin?.id) return admin.id
  const any = sqlite.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined
  return any?.id ?? null
}

async function resolveDramaOwnerIdMysql(pool: Pool): Promise<number | null> {
  const [adminRows] = await pool.execute<RowDataPacket[]>('SELECT id FROM users WHERE username = ? LIMIT 1', ['admin'])
  const adminId = (adminRows[0] as { id?: number } | undefined)?.id
  if (adminId) return adminId
  const [rows] = await pool.execute<RowDataPacket[]>('SELECT id FROM users ORDER BY id ASC LIMIT 1')
  return (rows[0] as { id?: number } | undefined)?.id ?? null
}

/** Assign NULL dramas.user_id to admin, or the first user if admin does not exist. */
export function backfillDramasUserIdSqlite(sqlite: Database.Database): void {
  const ownerId = resolveDramaOwnerIdSqlite(sqlite)
  if (!ownerId) return
  sqlite.prepare('UPDATE dramas SET user_id = ? WHERE user_id IS NULL').run(ownerId)
}

export async function backfillDramasUserIdMysql(pool: Pool): Promise<void> {
  const ownerId = await resolveDramaOwnerIdMysql(pool)
  if (!ownerId) return
  await pool.execute('UPDATE dramas SET user_id = ? WHERE user_id IS NULL', [ownerId])
}

async function dramasUserIdNullableMysql(pool: Pool): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT IS_NULLABLE AS nullable FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'dramas' AND column_name = 'user_id' LIMIT 1`,
  )
  return (rows[0] as { nullable?: string } | undefined)?.nullable === 'YES'
}

/** After backfill, enforce NOT NULL on MySQL dramas.user_id (legacy TEXT/INT nullable columns). */
export async function enforceDramasUserIdNotNullMysql(pool: Pool): Promise<void> {
  if (!(await dramasUserIdNullableMysql(pool))) return
  await backfillDramasUserIdMysql(pool)
  await pool.execute('ALTER TABLE `dramas` MODIFY COLUMN `user_id` INT NOT NULL')
}

/** Clamp invalid booleans and negative payment amounts on legacy rows before CHECK migration. */
export function sanitizeLegacyFieldValuesSqlite(sqlite: Database.Database): void {
  const boolTables: Array<[string, string]> = [
    ['dramas', 'is_template'],
    ['dramas', 'is_template_only'],
    ['payment_provider_configs', 'enabled'],
    ['batch_jobs', 'cancel_requested'],
    ['credit_logs', 'tokens_estimated'],
  ]
  for (const [table, col] of boolTables) {
    sqlite.prepare(`UPDATE ${table} SET ${col} = 0 WHERE ${col} IS NULL OR ${col} NOT IN (0, 1)`).run()
  }
  sqlite.prepare('UPDATE users SET credits = 0 WHERE credits IS NULL OR credits < 0').run()
  sqlite.prepare('UPDATE payment_orders SET amount = 0 WHERE amount IS NULL OR amount < 0').run()
  sqlite.prepare('UPDATE payment_orders SET credits = 0 WHERE credits IS NULL OR credits < 0').run()
  sqlite.prepare(`UPDATE dramas SET project_type = 'drama' WHERE project_type IS NULL OR project_type NOT IN ('drama', 'novel')`).run()
  sqlite.prepare(`UPDATE users SET role = 'user' WHERE role IS NULL OR role NOT IN ('user', 'admin')`).run()
}

export async function sanitizeLegacyFieldValuesMysql(pool: Pool): Promise<void> {
  const statements = [
    'UPDATE `dramas` SET `is_template` = 0 WHERE `is_template` IS NULL OR `is_template` NOT IN (0, 1)',
    'UPDATE `dramas` SET `is_template_only` = 0 WHERE `is_template_only` IS NULL OR `is_template_only` NOT IN (0, 1)',
    'UPDATE `payment_provider_configs` SET `enabled` = 0 WHERE `enabled` IS NULL OR `enabled` NOT IN (0, 1)',
    'UPDATE `batch_jobs` SET `cancel_requested` = 0 WHERE `cancel_requested` IS NULL OR `cancel_requested` NOT IN (0, 1)',
    'UPDATE `credit_logs` SET `tokens_estimated` = 0 WHERE `tokens_estimated` IS NULL OR `tokens_estimated` NOT IN (0, 1)',
    'UPDATE `users` SET `credits` = 0 WHERE `credits` IS NULL OR `credits` < 0',
    'UPDATE `payment_orders` SET `amount` = 0 WHERE `amount` IS NULL OR `amount` < 0',
    'UPDATE `payment_orders` SET `credits` = 0 WHERE `credits` IS NULL OR `credits` < 0',
    "UPDATE `dramas` SET `project_type` = 'drama' WHERE `project_type` IS NULL OR `project_type` NOT IN ('drama', 'novel')",
    "UPDATE `users` SET `role` = 'user' WHERE `role` IS NULL OR `role` NOT IN ('user', 'admin')",
    "UPDATE `image_generations` SET `status` = 'pending' WHERE `status` IS NULL OR `status` NOT IN ('pending', 'processing', 'completed', 'failed')",
    "UPDATE `video_generations` SET `status` = 'pending' WHERE `status` IS NULL OR `status` NOT IN ('pending', 'processing', 'completed', 'failed')",
    "UPDATE `batch_jobs` SET `status` = 'failed' WHERE `status` IS NULL OR `status` NOT IN ('pending', 'running', 'completed', 'failed', 'stopped', 'cancelled')",
    "UPDATE `payment_orders` SET `status` = 'pending' WHERE `status` IS NULL OR `status` NOT IN ('pending', 'paid', 'failed', 'cancelled')",
  ]
  for (const sql of statements) {
    try {
      await pool.execute(sql)
    } catch {
      // table/column may not exist on partial legacy installs
    }
  }
}

const IMAGE_STORAGE_BACKFILL = `
  UPDATE image_generations SET
    storage_kind = CASE
      WHEN trim(coalesce(local_path, '')) != '' THEN 'local'
      WHEN trim(coalesce(minio_url, '')) != '' THEN 'object'
      WHEN trim(coalesce(image_url, '')) != '' THEN 'remote'
      ELSE NULL END,
    storage_uri = CASE
      WHEN trim(coalesce(local_path, '')) != '' THEN trim(local_path)
      WHEN trim(coalesce(minio_url, '')) != '' THEN trim(minio_url)
      WHEN trim(coalesce(image_url, '')) != '' THEN trim(image_url)
      ELSE NULL END
  WHERE storage_kind IS NULL OR storage_uri IS NULL
`

const VIDEO_STORAGE_BACKFILL = `
  UPDATE video_generations SET
    storage_kind = CASE
      WHEN trim(coalesce(local_path, '')) != '' THEN 'local'
      WHEN trim(coalesce(minio_url, '')) != '' THEN 'object'
      WHEN trim(coalesce(video_url, '')) != '' THEN 'remote'
      ELSE NULL END,
    storage_uri = CASE
      WHEN trim(coalesce(local_path, '')) != '' THEN trim(local_path)
      WHEN trim(coalesce(minio_url, '')) != '' THEN trim(minio_url)
      WHEN trim(coalesce(video_url, '')) != '' THEN trim(video_url)
      ELSE NULL END
  WHERE storage_kind IS NULL OR storage_uri IS NULL
`

/** F3: populate storage_kind/storage_uri from legacy URL columns. */
export function backfillGenerationStorageSqlite(sqlite: Database.Database): void {
  for (const sql of [IMAGE_STORAGE_BACKFILL, VIDEO_STORAGE_BACKFILL]) {
    try {
      sqlite.exec(sql)
    } catch {
      // table/column may not exist on partial legacy installs
    }
  }
}

export async function backfillGenerationStorageMysql(pool: Pool): Promise<void> {
  const statements = [
    IMAGE_STORAGE_BACKFILL.replace(/local_path/g, '`local_path`')
      .replace(/minio_url/g, '`minio_url`')
      .replace(/image_url/g, '`image_url`')
      .replace(/storage_kind/g, '`storage_kind`')
      .replace(/storage_uri/g, '`storage_uri`'),
    VIDEO_STORAGE_BACKFILL.replace(/local_path/g, '`local_path`')
      .replace(/minio_url/g, '`minio_url`')
      .replace(/video_url/g, '`video_url`')
      .replace(/storage_kind/g, '`storage_kind`')
      .replace(/storage_uri/g, '`storage_uri`'),
  ]
  for (const sql of statements) {
    try {
      await pool.execute(sql)
    } catch {
      // table/column may not exist on partial legacy installs
    }
  }
}

function migratePlaintextApiKeysTableSqlite(sqlite: Database.Database, table: string): void {
  const tableExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  if (!tableExists) return
  const rows = sqlite.prepare(`SELECT id, api_key FROM ${table} WHERE api_key IS NOT NULL AND trim(api_key) != ''`).all() as Array<{ id: number; api_key: string }>
  const stmt = sqlite.prepare(`UPDATE ${table} SET api_key = ? WHERE id = ?`)
  for (const row of rows) {
    if (!isEncryptedSecret(row.api_key)) {
      const enc = encryptSecret(row.api_key)
      if (enc && enc !== row.api_key) stmt.run(enc, row.id)
    }
  }
}

/** Encrypt existing plaintext api_key rows when CONFIG_ENCRYPTION_KEY is set. */
export function migratePlaintextApiKeysSqlite(sqlite: Database.Database): void {
  if (!isSecretEncryptionEnabled()) return
  migratePlaintextApiKeysTableSqlite(sqlite, 'ai_service_configs')
  migratePlaintextApiKeysTableSqlite(sqlite, 'ai_preset_configs')
  migratePlaintextApiKeysTableSqlite(sqlite, 'user_ai_preset_configs')
  normalizeEncryptedApiKeysTableSqlite(sqlite, 'ai_service_configs')
  normalizeEncryptedApiKeysTableSqlite(sqlite, 'ai_preset_configs')
}

async function migratePlaintextApiKeysTableMysql(pool: Pool, table: string): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, api_key FROM \`${table}\` WHERE api_key IS NOT NULL AND trim(api_key) != ''`,
  )
  for (const row of rows as Array<{ id: number; api_key: string }>) {
    if (!isEncryptedSecret(row.api_key)) {
      const enc = encryptSecret(row.api_key)
      if (enc && enc !== row.api_key) {
        await pool.execute(`UPDATE \`${table}\` SET api_key = ? WHERE id = ?`, [enc, row.id])
      }
    }
  }
}

/** Re-encrypt rows decrypted with a fallback key so primary CONFIG_ENCRYPTION_KEY is canonical. */
async function normalizeEncryptedApiKeysTableMysql(pool: Pool, table: string): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, api_key FROM \`${table}\` WHERE api_key LIKE 'enc:v1:%'`,
  )
  for (const row of rows as Array<{ id: number; api_key: string }>) {
    const plain = decryptSecret(row.api_key)
    if (!plain) continue
    const enc = encryptSecret(plain)
    if (enc && enc !== row.api_key) {
      await pool.execute(`UPDATE \`${table}\` SET api_key = ? WHERE id = ?`, [enc, row.id])
    }
  }
}

function normalizeEncryptedApiKeysTableSqlite(sqlite: Database.Database, table: string): void {
  const tableExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  if (!tableExists) return
  const rows = sqlite.prepare(
    `SELECT id, api_key FROM ${table} WHERE api_key LIKE 'enc:v1:%'`,
  ).all() as Array<{ id: number; api_key: string }>
  const stmt = sqlite.prepare(`UPDATE ${table} SET api_key = ? WHERE id = ?`)
  for (const row of rows) {
    const plain = decryptSecret(row.api_key)
    if (!plain) continue
    const enc = encryptSecret(plain)
    if (enc && enc !== row.api_key) stmt.run(enc, row.id)
  }
}

export async function migratePlaintextApiKeysMysql(pool: Pool): Promise<void> {
  if (!isSecretEncryptionEnabled()) return
  try {
    await migratePlaintextApiKeysTableMysql(pool, 'ai_service_configs')
    await migratePlaintextApiKeysTableMysql(pool, 'ai_preset_configs')
    await migratePlaintextApiKeysTableMysql(pool, 'user_ai_preset_configs')
    await normalizeEncryptedApiKeysTableMysql(pool, 'ai_service_configs')
    await normalizeEncryptedApiKeysTableMysql(pool, 'ai_preset_configs')
  } catch {
    // table may not exist on partial legacy installs
  }
}

/** F4: move oversized inline text into workbench-data/storage/text/… */
export function externalizeLargeTextSqlite(sqlite: Database.Database): void {
  externalizeEpisodeTextSqlite(sqlite)
  externalizeStoryboardTextSqlite(sqlite)
  externalizeAgentPromptTextSqlite(sqlite)
  externalizeNovelEpisodeContentSqlite(sqlite)
  backfillNovelProseCharCountSqlite(sqlite)
}

/** 正文落盘后补写 metadata.prose_char_count，供列表字数统计 */
export function backfillNovelProseCharCountSqlite(sqlite: Database.Database): void {
  const dramasTable = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='dramas' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (!dramasTable) return

  const rows = sqlite.prepare(`
    SELECT e.id, e.content, e.content_blob_path, e.metadata
    FROM episodes e
    INNER JOIN dramas d ON d.id = e.drama_id
    WHERE d.project_type = 'novel'
      AND (
        trim(coalesce(e.content, '')) != ''
        OR trim(coalesce(e.content_blob_path, '')) != ''
      )
  `).all() as Array<{
    id: number
    content: string | null
    content_blob_path: string | null
    metadata: string | null
  }>

  const stmt = sqlite.prepare('UPDATE episodes SET metadata = ? WHERE id = ?')
  for (const row of rows) {
    const parsed = parseJsonColumnObject(row.metadata)
    const cached = Number(parsed.prose_char_count)
    if (Number.isFinite(cached) && cached > 0 && !row.content?.trim()) continue

    const text = resolveInlineOrBlob(row.content, row.content_blob_path)
    if (!text?.trim()) continue

    const metadata = mergeEpisodeMetadata(row.metadata, { prose_char_count: countNovelChars(text) })
    stmt.run(metadata, row.id)
  }
}

/** 小说正文统一落盘 storage/novels/…，DB 只保留 content_blob_path */
export function externalizeNovelEpisodeContentSqlite(sqlite: Database.Database): void {
  const dramasTable = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='dramas' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (!dramasTable) return

  const rows = sqlite.prepare(`
    SELECT e.id, e.drama_id, e.content, e.content_blob_path, e.metadata
    FROM episodes e
    INNER JOIN dramas d ON d.id = e.drama_id
    WHERE d.project_type = 'novel'
      AND (
        (e.content IS NOT NULL AND trim(e.content) != '')
        OR (e.content_blob_path IS NOT NULL AND trim(e.content_blob_path) != '')
      )
  `).all() as Array<{
    id: number
    drama_id: number
    content: string | null
    content_blob_path: string | null
    metadata: string | null
  }>

  const stmt = sqlite.prepare('UPDATE episodes SET content = ?, content_blob_path = ?, metadata = ? WHERE id = ?')
  for (const row of rows) {
    const canonical = novelChapterContentRelativePath(row.drama_id, row.id)
    if (!row.content?.trim() && row.content_blob_path?.trim() === canonical) continue

    const text = resolveInlineOrBlob(row.content, row.content_blob_path)
    if (!text?.trim()) continue

    const p = persistNovelChapterContentToDisk(row.drama_id, row.id, text)
    const metadata = mergeEpisodeMetadata(row.metadata, { prose_char_count: countNovelChars(text) })
    stmt.run(p.inline, p.blobPath, metadata, row.id)
  }
}

function externalizeEpisodeTextSqlite(sqlite: Database.Database): void {
  const tableExists = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='episodes' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (!tableExists) return

  const rows = sqlite.prepare(`
    SELECT id, content, script_content, formatted_script,
           content_blob_path, script_blob_path, formatted_script_blob_path FROM episodes
    WHERE (content IS NOT NULL AND length(content) > ? AND (content_blob_path IS NULL OR trim(content_blob_path) = ''))
       OR (script_content IS NOT NULL AND length(script_content) > ? AND (script_blob_path IS NULL OR trim(script_blob_path) = ''))
       OR (formatted_script IS NOT NULL AND length(formatted_script) > ? AND (formatted_script_blob_path IS NULL OR trim(formatted_script_blob_path) = ''))
  `).all(TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD) as Array<{
    id: number
    content: string | null
    script_content: string | null
    formatted_script: string | null
    content_blob_path: string | null
    script_blob_path: string | null
    formatted_script_blob_path: string | null
  }>

  const stmt = sqlite.prepare(
    'UPDATE episodes SET content = ?, content_blob_path = ?, script_content = ?, script_blob_path = ?, formatted_script = ?, formatted_script_blob_path = ? WHERE id = ?',
  )
  for (const row of rows) {
    let content = row.content
    let contentBlobPath = row.content_blob_path
    let scriptContent = row.script_content
    let scriptBlobPath = row.script_blob_path
    let formattedScript = row.formatted_script
    let formattedScriptBlobPath = row.formatted_script_blob_path
    if (content && content.length > TEXT_BLOB_THRESHOLD && !contentBlobPath) {
      const p = persistInlineOrBlob('episodes', row.id, 'content', content)
      content = p.inline
      contentBlobPath = p.blobPath
    }
    if (scriptContent && scriptContent.length > TEXT_BLOB_THRESHOLD && !scriptBlobPath) {
      const p = persistInlineOrBlob('episodes', row.id, 'script_content', scriptContent)
      scriptContent = p.inline
      scriptBlobPath = p.blobPath
    }
    if (formattedScript && formattedScript.length > TEXT_BLOB_THRESHOLD && !formattedScriptBlobPath) {
      const p = persistInlineOrBlob('episodes', row.id, 'formatted_script', formattedScript)
      formattedScript = p.inline
      formattedScriptBlobPath = p.blobPath
    }
    stmt.run(content, contentBlobPath, scriptContent, scriptBlobPath, formattedScript, formattedScriptBlobPath, row.id)
  }
}

function externalizeStoryboardTextSqlite(sqlite: Database.Database): void {
  const tableExists = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='storyboards' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (!tableExists) return

  const rows = sqlite.prepare(`
    SELECT id, image_prompt, video_prompt, dialogue,
           image_prompt_blob_path, video_prompt_blob_path, dialogue_blob_path
    FROM storyboards
    WHERE (image_prompt IS NOT NULL AND length(image_prompt) > ? AND (image_prompt_blob_path IS NULL OR trim(image_prompt_blob_path) = ''))
       OR (video_prompt IS NOT NULL AND length(video_prompt) > ? AND (video_prompt_blob_path IS NULL OR trim(video_prompt_blob_path) = ''))
       OR (dialogue IS NOT NULL AND length(dialogue) > ? AND (dialogue_blob_path IS NULL OR trim(dialogue_blob_path) = ''))
  `).all(TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD) as Array<Record<string, string | number | null>>

  const stmt = sqlite.prepare(`
    UPDATE storyboards SET image_prompt = ?, image_prompt_blob_path = ?,
      video_prompt = ?, video_prompt_blob_path = ?, dialogue = ?, dialogue_blob_path = ?
    WHERE id = ?
  `)
  for (const row of rows) {
    let imagePrompt = row.image_prompt as string | null
    let imagePromptBlobPath = row.image_prompt_blob_path as string | null
    let videoPrompt = row.video_prompt as string | null
    let videoPromptBlobPath = row.video_prompt_blob_path as string | null
    let dialogue = row.dialogue as string | null
    let dialogueBlobPath = row.dialogue_blob_path as string | null
    if (imagePrompt && imagePrompt.length > TEXT_BLOB_THRESHOLD && !imagePromptBlobPath) {
      const p = persistInlineOrBlob('storyboards', row.id as number, 'image_prompt', imagePrompt)
      imagePrompt = p.inline
      imagePromptBlobPath = p.blobPath
    }
    if (videoPrompt && videoPrompt.length > TEXT_BLOB_THRESHOLD && !videoPromptBlobPath) {
      const p = persistInlineOrBlob('storyboards', row.id as number, 'video_prompt', videoPrompt)
      videoPrompt = p.inline
      videoPromptBlobPath = p.blobPath
    }
    if (dialogue && dialogue.length > TEXT_BLOB_THRESHOLD && !dialogueBlobPath) {
      const p = persistInlineOrBlob('storyboards', row.id as number, 'dialogue', dialogue)
      dialogue = p.inline
      dialogueBlobPath = p.blobPath
    }
    stmt.run(imagePrompt, imagePromptBlobPath, videoPrompt, videoPromptBlobPath, dialogue, dialogueBlobPath, row.id)
  }
}

function externalizeAgentPromptTextSqlite(sqlite: Database.Database): void {
  const tableExists = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='agent_configs' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (!tableExists) return

  const rows = sqlite.prepare(`
    SELECT id, system_prompt, system_prompt_blob_path FROM agent_configs
    WHERE system_prompt IS NOT NULL AND length(system_prompt) > ?
      AND (system_prompt_blob_path IS NULL OR trim(system_prompt_blob_path) = '')
  `).all(TEXT_BLOB_THRESHOLD) as Array<{ id: number; system_prompt: string; system_prompt_blob_path: string | null }>

  const stmt = sqlite.prepare('UPDATE agent_configs SET system_prompt = ?, system_prompt_blob_path = ? WHERE id = ?')
  for (const row of rows) {
    const p = persistInlineOrBlob('agent_configs', row.id, 'system_prompt', row.system_prompt)
    stmt.run(p.inline, p.blobPath, row.id)
  }
}

export async function externalizeLargeTextMysql(pool: Pool): Promise<void> {
  try {
    await externalizeEpisodeTextMysql(pool)
    await externalizeStoryboardTextMysql(pool)
    await externalizeAgentPromptTextMysql(pool)
    await externalizeNovelEpisodeContentMysql(pool)
    await backfillNovelProseCharCountMysql(pool)
  } catch {
    // partial legacy installs
  }
}

export async function externalizeNovelEpisodeContentMysql(pool: Pool): Promise<void> {
  const [tableRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'dramas' LIMIT 1`,
  )
  if (!(tableRows as RowDataPacket[]).length) return

  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT e.id, e.drama_id, e.content, e.content_blob_path, e.metadata
    FROM episodes e
    INNER JOIN dramas d ON d.id = e.drama_id
    WHERE d.project_type = 'novel'
      AND (
        (e.content IS NOT NULL AND trim(e.content) != '')
        OR (e.content_blob_path IS NOT NULL AND trim(e.content_blob_path) != '')
      )
  `)

  for (const row of rows as Array<Record<string, string | number | null>>) {
    const id = row.id as number
    const dramaId = row.drama_id as number
    const canonical = novelChapterContentRelativePath(dramaId, id)
    const inline = row.content as string | null
    const blobPath = row.content_blob_path as string | null
    const metadataRaw = row.metadata
    if (!inline?.trim() && blobPath?.trim() === canonical) continue

    const text = resolveInlineOrBlob(inline, blobPath)
    if (!text?.trim()) continue

    const p = persistNovelChapterContentToDisk(dramaId, id, text)
    const metadata = mergeEpisodeMetadata(
      typeof metadataRaw === 'string' ? metadataRaw : (metadataRaw as Record<string, unknown> | null),
      { prose_char_count: countNovelChars(text) },
    )
    await pool.execute(
      'UPDATE `episodes` SET `content` = ?, `content_blob_path` = ?, `metadata` = ? WHERE `id` = ?',
      [p.inline, p.blobPath, metadata, id],
    )
  }
}

export async function backfillNovelProseCharCountMysql(pool: Pool): Promise<void> {
  const [tableRows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'dramas' LIMIT 1`,
  )
  if (!(tableRows as RowDataPacket[]).length) return

  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT e.id, e.content, e.content_blob_path, e.metadata
    FROM episodes e
    INNER JOIN dramas d ON d.id = e.drama_id
    WHERE d.project_type = 'novel'
      AND (
        (e.content IS NOT NULL AND trim(e.content) != '')
        OR (e.content_blob_path IS NOT NULL AND trim(e.content_blob_path) != '')
      )
  `)

  for (const row of rows as Array<Record<string, string | number | null>>) {
    const id = row.id as number
    const inline = row.content as string | null
    const blobPath = row.content_blob_path as string | null
    const metadataRaw = row.metadata
    const parsed = parseJsonColumnObject(
      typeof metadataRaw === 'string' ? metadataRaw : (metadataRaw as Record<string, unknown> | null),
    )
    const cached = Number(parsed.prose_char_count)
    if (Number.isFinite(cached) && cached > 0 && !inline?.trim()) continue

    const text = resolveInlineOrBlob(inline, blobPath)
    if (!text?.trim()) continue

    const metadata = mergeEpisodeMetadata(
      typeof metadataRaw === 'string' ? metadataRaw : (metadataRaw as Record<string, unknown> | null),
      { prose_char_count: countNovelChars(text) },
    )
    await pool.execute('UPDATE `episodes` SET `metadata` = ? WHERE `id` = ?', [metadata, id])
  }
}

async function externalizeEpisodeTextMysql(pool: Pool): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT id, content, script_content, formatted_script,
           content_blob_path, script_blob_path, formatted_script_blob_path FROM episodes
    WHERE (content IS NOT NULL AND char_length(content) > ? AND (content_blob_path IS NULL OR trim(content_blob_path) = ''))
       OR (script_content IS NOT NULL AND char_length(script_content) > ? AND (script_blob_path IS NULL OR trim(script_blob_path) = ''))
       OR (formatted_script IS NOT NULL AND char_length(formatted_script) > ? AND (formatted_script_blob_path IS NULL OR trim(formatted_script_blob_path) = ''))
  `, [TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD])

  for (const row of rows as Array<Record<string, string | number | null>>) {
    let content = row.content as string | null
    let contentBlobPath = row.content_blob_path as string | null
    let scriptContent = row.script_content as string | null
    let scriptBlobPath = row.script_blob_path as string | null
    let formattedScript = row.formatted_script as string | null
    let formattedScriptBlobPath = row.formatted_script_blob_path as string | null
    const id = row.id as number
    if (content && content.length > TEXT_BLOB_THRESHOLD && !contentBlobPath) {
      const p = persistInlineOrBlob('episodes', id, 'content', content)
      content = p.inline
      contentBlobPath = p.blobPath
    }
    if (scriptContent && scriptContent.length > TEXT_BLOB_THRESHOLD && !scriptBlobPath) {
      const p = persistInlineOrBlob('episodes', id, 'script_content', scriptContent)
      scriptContent = p.inline
      scriptBlobPath = p.blobPath
    }
    if (formattedScript && formattedScript.length > TEXT_BLOB_THRESHOLD && !formattedScriptBlobPath) {
      const p = persistInlineOrBlob('episodes', id, 'formatted_script', formattedScript)
      formattedScript = p.inline
      formattedScriptBlobPath = p.blobPath
    }
    await pool.execute(
      'UPDATE `episodes` SET `content` = ?, `content_blob_path` = ?, `script_content` = ?, `script_blob_path` = ?, `formatted_script` = ?, `formatted_script_blob_path` = ? WHERE `id` = ?',
      [content, contentBlobPath, scriptContent, scriptBlobPath, formattedScript, formattedScriptBlobPath, id],
    )
  }
}

async function externalizeStoryboardTextMysql(pool: Pool): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT id, image_prompt, video_prompt, dialogue,
           image_prompt_blob_path, video_prompt_blob_path, dialogue_blob_path
    FROM storyboards
    WHERE (image_prompt IS NOT NULL AND char_length(image_prompt) > ? AND (image_prompt_blob_path IS NULL OR trim(image_prompt_blob_path) = ''))
       OR (video_prompt IS NOT NULL AND char_length(video_prompt) > ? AND (video_prompt_blob_path IS NULL OR trim(video_prompt_blob_path) = ''))
       OR (dialogue IS NOT NULL AND char_length(dialogue) > ? AND (dialogue_blob_path IS NULL OR trim(dialogue_blob_path) = ''))
  `, [TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD, TEXT_BLOB_THRESHOLD])

  for (const row of rows as Array<Record<string, string | number | null>>) {
    const id = row.id as number
    let imagePrompt = row.image_prompt as string | null
    let imagePromptBlobPath = row.image_prompt_blob_path as string | null
    let videoPrompt = row.video_prompt as string | null
    let videoPromptBlobPath = row.video_prompt_blob_path as string | null
    let dialogue = row.dialogue as string | null
    let dialogueBlobPath = row.dialogue_blob_path as string | null
    if (imagePrompt && imagePrompt.length > TEXT_BLOB_THRESHOLD && !imagePromptBlobPath) {
      const p = persistInlineOrBlob('storyboards', id, 'image_prompt', imagePrompt)
      imagePrompt = p.inline
      imagePromptBlobPath = p.blobPath
    }
    if (videoPrompt && videoPrompt.length > TEXT_BLOB_THRESHOLD && !videoPromptBlobPath) {
      const p = persistInlineOrBlob('storyboards', id, 'video_prompt', videoPrompt)
      videoPrompt = p.inline
      videoPromptBlobPath = p.blobPath
    }
    if (dialogue && dialogue.length > TEXT_BLOB_THRESHOLD && !dialogueBlobPath) {
      const p = persistInlineOrBlob('storyboards', id, 'dialogue', dialogue)
      dialogue = p.inline
      dialogueBlobPath = p.blobPath
    }
    await pool.execute(`
      UPDATE storyboards SET image_prompt = ?, image_prompt_blob_path = ?,
        video_prompt = ?, video_prompt_blob_path = ?, dialogue = ?, dialogue_blob_path = ?
      WHERE id = ?
    `, [imagePrompt, imagePromptBlobPath, videoPrompt, videoPromptBlobPath, dialogue, dialogueBlobPath, id])
  }
}

async function externalizeAgentPromptTextMysql(pool: Pool): Promise<void> {
  const [rows] = await pool.execute<RowDataPacket[]>(`
    SELECT id, system_prompt, system_prompt_blob_path FROM agent_configs
    WHERE system_prompt IS NOT NULL AND char_length(system_prompt) > ?
      AND (system_prompt_blob_path IS NULL OR trim(system_prompt_blob_path) = '')
  `, [TEXT_BLOB_THRESHOLD])

  for (const row of rows as Array<{ id: number; system_prompt: string; system_prompt_blob_path: string | null }>) {
    const p = persistInlineOrBlob('agent_configs', row.id, 'system_prompt', row.system_prompt)
    await pool.execute(
      'UPDATE `agent_configs` SET `system_prompt` = ?, `system_prompt_blob_path` = ? WHERE `id` = ?',
      [p.inline, p.blobPath, row.id],
    )
  }
}

function resolveGenUri(row: {
  storage_kind?: string | null
  storage_uri?: string | null
  local_path?: string | null
  minio_url?: string | null
  remote_url?: string | null
}): { uri: string | null; isLocal: boolean } {
  if (row.storage_uri) {
    return { uri: row.storage_uri, isLocal: row.storage_kind === 'local' }
  }
  if (row.local_path) return { uri: row.local_path, isLocal: true }
  if (row.minio_url) return { uri: row.minio_url, isLocal: false }
  if (row.remote_url) return { uri: row.remote_url, isLocal: false }
  return { uri: null, isLocal: false }
}

/** F4: index completed generations into assets catalog for legacy rows. */
export function backfillAssetsFromGenerationsSqlite(sqlite: Database.Database): void {
  const assetsExists = sqlite.prepare(
    `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='assets' LIMIT 1`,
  ).get() as { ok: number } | undefined
  if (!assetsExists) return

  const ts = now()
  const images = sqlite.prepare(`
    SELECT ig.id, ig.drama_id, ig.storyboard_id, ig.prompt, ig.image_type, ig.frame_type,
           ig.local_path, ig.minio_url, ig.image_url, ig.storage_kind, ig.storage_uri,
           ig.width, ig.height, ig.created_at, sb.episode_id, sb.storyboard_number
    FROM image_generations ig
    LEFT JOIN assets a ON a.image_gen_id = ig.id AND a.deleted_at IS NULL
    LEFT JOIN storyboards sb ON sb.id = ig.storyboard_id
    WHERE ig.status = 'completed' AND a.id IS NULL
    LIMIT 1000
  `).all() as Array<Record<string, unknown>>

  const insertImage = sqlite.prepare(`
    INSERT INTO assets (
      drama_id, episode_id, storyboard_id, storyboard_num, name, description, type, category,
      url, local_path, image_gen_id, width, height, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const row of images) {
    const { uri, isLocal } = resolveGenUri({
      storage_kind: row.storage_kind as string | null,
      storage_uri: row.storage_uri as string | null,
      local_path: row.local_path as string | null,
      minio_url: row.minio_url as string | null,
      remote_url: row.image_url as string | null,
    })
    if (!uri) continue
    const prompt = String(row.prompt || '')
    const trimmed = prompt.trim()
    const name = trimmed
      ? (trimmed.length <= 120 ? trimmed : trimmed.slice(0, 119) + '…')
      : 'image #' + String(row.id)
    insertImage.run(
      row.drama_id ?? null,
      row.episode_id ?? null,
      row.storyboard_id ?? null,
      row.storyboard_number ?? null,
      name,
      prompt || null,
      row.image_type || row.frame_type || 'generation',
      isLocal ? null : uri,
      isLocal ? String(uri).replace(/^\//, '') : null,
      row.id,
      row.width ?? null,
      row.height ?? null,
      row.created_at || ts,
      ts,
    )
  }

  const videos = sqlite.prepare(`
    SELECT vg.id, vg.drama_id, vg.storyboard_id, vg.prompt, vg.reference_mode,
           vg.local_path, vg.minio_url, vg.video_url, vg.storage_kind, vg.storage_uri,
           vg.width, vg.height, vg.duration, vg.created_at, sb.episode_id, sb.storyboard_number
    FROM video_generations vg
    LEFT JOIN assets a ON a.video_gen_id = vg.id AND a.deleted_at IS NULL
    LEFT JOIN storyboards sb ON sb.id = vg.storyboard_id
    WHERE vg.status = 'completed' AND a.id IS NULL
    LIMIT 1000
  `).all() as Array<Record<string, unknown>>

  const insertVideo = sqlite.prepare(`
    INSERT INTO assets (
      drama_id, episode_id, storyboard_id, storyboard_num, name, description, type, category,
      url, local_path, video_gen_id, width, height, duration, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const row of videos) {
    const { uri, isLocal } = resolveGenUri({
      storage_kind: row.storage_kind as string | null,
      storage_uri: row.storage_uri as string | null,
      local_path: row.local_path as string | null,
      minio_url: row.minio_url as string | null,
      remote_url: row.video_url as string | null,
    })
    if (!uri) continue
    const prompt = String(row.prompt || '')
    const trimmed = prompt.trim()
    const name = trimmed
      ? (trimmed.length <= 120 ? trimmed : trimmed.slice(0, 119) + '…')
      : 'video #' + String(row.id)
    insertVideo.run(
      row.drama_id ?? null,
      row.episode_id ?? null,
      row.storyboard_id ?? null,
      row.storyboard_number ?? null,
      name,
      prompt || null,
      row.reference_mode || 'generation',
      isLocal ? null : uri,
      isLocal ? String(uri).replace(/^\//, '') : null,
      row.id,
      row.width ?? null,
      row.height ?? null,
      row.duration ?? null,
      row.created_at || ts,
      ts,
    )
  }
}

export async function backfillAssetsFromGenerationsMysql(pool: Pool): Promise<void> {
  try {
    const ts = now()
    const [images] = await pool.execute<RowDataPacket[]>(`
      SELECT ig.id, ig.drama_id, ig.storyboard_id, ig.prompt, ig.image_type, ig.frame_type,
             ig.local_path, ig.minio_url, ig.image_url, ig.storage_kind, ig.storage_uri,
             ig.width, ig.height, ig.created_at, sb.episode_id, sb.storyboard_number
      FROM image_generations ig
      LEFT JOIN assets a ON a.image_gen_id = ig.id AND a.deleted_at IS NULL
      LEFT JOIN storyboards sb ON sb.id = ig.storyboard_id
      WHERE ig.status = 'completed' AND a.id IS NULL
      LIMIT 1000
    `)
    for (const row of images as Array<Record<string, unknown>>) {
      const { uri, isLocal } = resolveGenUri({
        storage_kind: row.storage_kind as string | null,
        storage_uri: row.storage_uri as string | null,
        local_path: row.local_path as string | null,
        minio_url: row.minio_url as string | null,
        remote_url: row.image_url as string | null,
      })
      if (!uri) continue
      const prompt = String(row.prompt || '')
      const trimmed = prompt.trim()
      const name = trimmed
        ? (trimmed.length <= 120 ? trimmed : trimmed.slice(0, 119) + '…')
        : 'image #' + String(row.id)
      await pool.execute(
        `INSERT INTO assets (
          drama_id, episode_id, storyboard_id, storyboard_num, name, description, type, category,
          url, local_path, image_gen_id, width, height, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.drama_id ?? null,
          row.episode_id ?? null,
          row.storyboard_id ?? null,
          row.storyboard_number ?? null,
          name,
          prompt || null,
          String(row.image_type || row.frame_type || 'generation'),
          isLocal ? null : uri,
          isLocal ? String(uri).replace(/^\//, '') : null,
          row.id,
          row.width ?? null,
          row.height ?? null,
          row.created_at || ts,
          ts,
        ] as (string | number | null)[],
      )
    }

    const [videos] = await pool.execute<RowDataPacket[]>(`
      SELECT vg.id, vg.drama_id, vg.storyboard_id, vg.prompt, vg.reference_mode,
             vg.local_path, vg.minio_url, vg.video_url, vg.storage_kind, vg.storage_uri,
             vg.width, vg.height, vg.duration, vg.created_at, sb.episode_id, sb.storyboard_number
      FROM video_generations vg
      LEFT JOIN assets a ON a.video_gen_id = vg.id AND a.deleted_at IS NULL
      LEFT JOIN storyboards sb ON sb.id = vg.storyboard_id
      WHERE vg.status = 'completed' AND a.id IS NULL
      LIMIT 1000
    `)
    for (const row of videos as Array<Record<string, unknown>>) {
      const { uri, isLocal } = resolveGenUri({
        storage_kind: row.storage_kind as string | null,
        storage_uri: row.storage_uri as string | null,
        local_path: row.local_path as string | null,
        minio_url: row.minio_url as string | null,
        remote_url: row.video_url as string | null,
      })
      if (!uri) continue
      const prompt = String(row.prompt || '')
      const trimmed = prompt.trim()
      const name = trimmed
        ? (trimmed.length <= 120 ? trimmed : trimmed.slice(0, 119) + '…')
        : 'video #' + String(row.id)
      await pool.execute(
        `INSERT INTO assets (
          drama_id, episode_id, storyboard_id, storyboard_num, name, description, type, category,
          url, local_path, video_gen_id, width, height, duration, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.drama_id ?? null,
          row.episode_id ?? null,
          row.storyboard_id ?? null,
          row.storyboard_number ?? null,
          name,
          prompt || null,
          String(row.reference_mode || 'generation'),
          isLocal ? null : uri,
          isLocal ? String(uri).replace(/^\//, '') : null,
          row.id,
          row.width ?? null,
          row.height ?? null,
          row.duration ?? null,
          row.created_at || ts,
          ts,
        ] as (string | number | null)[],
      )
    }
  } catch {
    // table may not exist on partial legacy installs
  }
}
