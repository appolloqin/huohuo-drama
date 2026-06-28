/**
 * MySQL schema upgrades for legacy databases (P2/P3).
 * New installs get correct types from DDL; this migrates existing TEXT columns in place.
 */
import type { Pool, RowDataPacket } from 'mysql2/promise'

async function columnDataType(pool: Pool, table: string, column: string): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT DATA_TYPE AS data_type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  )
  return (rows[0] as { data_type?: string } | undefined)?.data_type?.toLowerCase() ?? null
}

const TEXT_LIKE_TYPES = new Set(['text', 'varchar', 'longtext', 'mediumtext', 'tinytext', 'char'])

/** Legacy SQLite-style ISO strings in TEXT columns must be normalized before DATETIME MODIFY. */
async function normalizeIsoDatetimeTextColumn(pool: Pool, table: string, column: string) {
  const current = await columnDataType(pool, table, column)
  if (!current || !TEXT_LIKE_TYPES.has(current)) return

  await pool.execute(`
    UPDATE \`${table}\` SET \`${column}\` = CONCAT(
      SUBSTRING(\`${column}\`, 1, 10), ' ',
      TRIM(TRAILING '+00:00' FROM TRIM(TRAILING 'Z' FROM SUBSTRING(\`${column}\`, 12)))
    )
    WHERE \`${column}\` IS NOT NULL
      AND TRIM(\`${column}\`) != ''
      AND \`${column}\` LIKE '%T%'
  `)
}

async function modifyColumnIfNotTarget(pool: Pool, table: string, column: string, definition: string, targets: string[]) {
  const current = await columnDataType(pool, table, column)
  if (!current || targets.includes(current)) return
  if (definition.startsWith('DATETIME')) {
    await normalizeIsoDatetimeTextColumn(pool, table, column)
  }
  await pool.execute(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`)
}

async function upgradeDatetimeColumns(pool: Pool, table: string, columns: string[], nullable = false) {
  const def = nullable ? 'DATETIME(3) NULL' : 'DATETIME(3) NOT NULL'
  for (const column of columns) {
    await modifyColumnIfNotTarget(pool, table, column, def, ['datetime', 'timestamp'])
  }
}

async function upgradeTinyintColumns(pool: Pool, table: string, columns: string[], nullable = false, defaultVal?: number) {
  const defaultClause = defaultVal === undefined ? '' : ` DEFAULT ${defaultVal}`
  const def = nullable
    ? `TINYINT(1) NULL${defaultClause}`
    : `TINYINT(1) NOT NULL${defaultClause}`
  for (const column of columns) {
    await modifyColumnIfNotTarget(pool, table, column, def, ['tinyint'])
  }
}

async function upgradeJsonColumns(pool: Pool, table: string, columns: string[]) {
  for (const column of columns) {
    try {
      await modifyColumnIfNotTarget(pool, table, column, 'JSON NULL', ['json'])
    } catch {
      // skip invalid legacy JSON text; column stays TEXT until manually fixed
    }
  }
}

export async function applyMysqlSchemaUpgrades(pool: Pool): Promise<void> {
  const datetimeTables: Array<{ table: string; cols: string[]; nullableCols?: string[] }> = [
    { table: 'users', cols: ['created_at', 'updated_at'] },
    { table: 'credit_logs', cols: ['created_at'] },
    { table: 'payment_orders', cols: ['created_at', 'updated_at'], nullableCols: ['paid_at'] },
    { table: 'payment_provider_configs', cols: ['created_at', 'updated_at'] },
    { table: 'app_settings', cols: ['updated_at'] },
    { table: 'dramas', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'episodes', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'characters', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'scenes', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'storyboards', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'episode_characters', cols: ['created_at'] },
    { table: 'episode_scenes', cols: ['created_at'] },
    { table: 'ai_service_configs', cols: ['created_at', 'updated_at'] },
    { table: 'ai_service_providers', cols: ['created_at', 'updated_at'] },
    { table: 'ai_voices', cols: ['created_at'] },
    { table: 'ai_preset_configs', cols: ['created_at', 'updated_at'] },
    { table: 'agent_configs', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'image_generations', cols: ['created_at', 'updated_at'], nullableCols: ['completed_at'] },
    { table: 'video_generations', cols: ['created_at', 'updated_at'], nullableCols: ['completed_at', 'deleted_at'] },
    { table: 'video_merges', cols: ['created_at'], nullableCols: ['completed_at', 'deleted_at'] },
    { table: 'props', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'assets', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'generation_lessons', cols: ['created_at', 'updated_at'], nullableCols: ['deleted_at'] },
    { table: 'batch_jobs', cols: ['created_at', 'updated_at'], nullableCols: ['started_at', 'finished_at'] },
  ]

  for (const { table, cols, nullableCols = [] } of datetimeTables) {
    await upgradeDatetimeColumns(pool, table, cols, false)
    if (nullableCols.length) await upgradeDatetimeColumns(pool, table, nullableCols, true)
  }

  await upgradeTinyintColumns(pool, 'dramas', ['is_template', 'is_template_only'], true, 0)
  await upgradeTinyintColumns(pool, 'ai_service_configs', ['is_default', 'is_active'], true)
  await upgradeTinyintColumns(pool, 'ai_service_providers', ['is_active'], true, 1)
  await upgradeTinyintColumns(pool, 'ai_preset_configs', ['is_active'], true, 1)
  await upgradeTinyintColumns(pool, 'agent_configs', ['is_active'], true, 1)
  await upgradeTinyintColumns(pool, 'generation_lessons', ['is_active'], true, 1)
  await upgradeTinyintColumns(pool, 'payment_provider_configs', ['enabled'], false, 0)
  await upgradeTinyintColumns(pool, 'batch_jobs', ['cancel_requested'], false, 0)
  await upgradeTinyintColumns(pool, 'credit_logs', ['tokens_estimated'], true, 0)
  await upgradeTinyintColumns(pool, 'assets', ['is_favorite'], true, 0)

  await upgradeJsonColumns(pool, 'dramas', ['metadata'])
  await upgradeJsonColumns(pool, 'episodes', ['metadata'])
  await upgradeJsonColumns(pool, 'ai_service_configs', ['settings'])
  await upgradeJsonColumns(pool, 'ai_service_providers', ['preset_models'])
  await upgradeJsonColumns(pool, 'payment_provider_configs', ['settings'])
  await upgradeJsonColumns(pool, 'payment_orders', ['raw_payload'])
  await upgradeJsonColumns(pool, 'video_merges', ['scenes'])
  await upgradeJsonColumns(pool, 'batch_jobs', ['payload', 'progress'])
}

async function foreignKeyExists(pool: Pool, name: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1 AS ok FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE() AND constraint_name = ? AND constraint_type = 'FOREIGN KEY' LIMIT 1`,
    [name],
  )
  return rows.length > 0
}

async function ensureForeignKey(pool: Pool, name: string, ddl: string): Promise<void> {
  if (await foreignKeyExists(pool, name)) return
  await pool.execute(ddl)
}

/** Remove orphan rows so FK creation succeeds on legacy databases. */
async function cleanupOrphanRows(pool: Pool): Promise<void> {
  const statements = [
    'DELETE FROM episodes WHERE drama_id NOT IN (SELECT id FROM dramas)',
    'DELETE FROM characters WHERE drama_id NOT IN (SELECT id FROM dramas)',
    'DELETE FROM scenes WHERE drama_id NOT IN (SELECT id FROM dramas)',
    'DELETE FROM props WHERE drama_id NOT IN (SELECT id FROM dramas)',
    'DELETE FROM storyboards WHERE episode_id NOT IN (SELECT id FROM episodes)',
    'DELETE FROM episode_characters WHERE episode_id NOT IN (SELECT id FROM episodes)',
    'DELETE FROM episode_scenes WHERE episode_id NOT IN (SELECT id FROM episodes)',
    'DELETE FROM credit_logs WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM payment_orders WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM batch_jobs WHERE user_id NOT IN (SELECT id FROM users)',
    'DELETE FROM batch_jobs WHERE drama_id NOT IN (SELECT id FROM dramas)',
  ]
  for (const sql of statements) {
    try {
      await pool.execute(sql)
    } catch {
      // table may not exist yet on partial installs
    }
  }
}

export async function applyMysqlForeignKeys(pool: Pool): Promise<void> {
  await cleanupOrphanRows(pool)

  const fks: Array<{ name: string; ddl: string }> = [
    {
      name: 'fk_episodes_drama',
      ddl: 'ALTER TABLE `episodes` ADD CONSTRAINT `fk_episodes_drama` FOREIGN KEY (`drama_id`) REFERENCES `dramas`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_characters_drama',
      ddl: 'ALTER TABLE `characters` ADD CONSTRAINT `fk_characters_drama` FOREIGN KEY (`drama_id`) REFERENCES `dramas`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_scenes_drama',
      ddl: 'ALTER TABLE `scenes` ADD CONSTRAINT `fk_scenes_drama` FOREIGN KEY (`drama_id`) REFERENCES `dramas`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_props_drama',
      ddl: 'ALTER TABLE `props` ADD CONSTRAINT `fk_props_drama` FOREIGN KEY (`drama_id`) REFERENCES `dramas`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_storyboards_episode',
      ddl: 'ALTER TABLE `storyboards` ADD CONSTRAINT `fk_storyboards_episode` FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_credit_logs_user',
      ddl: 'ALTER TABLE `credit_logs` ADD CONSTRAINT `fk_credit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_payment_orders_user',
      ddl: 'ALTER TABLE `payment_orders` ADD CONSTRAINT `fk_payment_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_batch_jobs_user',
      ddl: 'ALTER TABLE `batch_jobs` ADD CONSTRAINT `fk_batch_jobs_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE',
    },
    {
      name: 'fk_batch_jobs_drama',
      ddl: 'ALTER TABLE `batch_jobs` ADD CONSTRAINT `fk_batch_jobs_drama` FOREIGN KEY (`drama_id`) REFERENCES `dramas`(`id`) ON DELETE CASCADE',
    },
  ]

  for (const fk of fks) {
    try {
      await ensureForeignKey(pool, fk.name, fk.ddl)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'ER_DUP_KEYNAME' || code === 'ER_FK_DUP_NAME') continue
      throw err
    }
  }
}
