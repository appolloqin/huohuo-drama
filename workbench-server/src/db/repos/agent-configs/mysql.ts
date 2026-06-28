import { eq, isNull } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { AgentConfigRow, DbRunResult } from '../types.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

function normalizeAgentRow(row: typeof schema.agentConfigs.$inferSelect): AgentConfigRow {
  return {
    ...row,
    isActive: row.isActive == null ? null : Boolean(row.isActive),
  }
}

export async function listActiveAgentConfigs(): Promise<AgentConfigRow[]> {
  const rows = await db().select().from(schema.agentConfigs).where(isNull(schema.agentConfigs.deletedAt))
  return rows.map(normalizeAgentRow)
}

export async function listAllAgentConfigs(): Promise<AgentConfigRow[]> {
  const rows = await db().select().from(schema.agentConfigs)
  return rows.map(normalizeAgentRow)
}

export async function findAgentConfigById(id: number): Promise<AgentConfigRow | null> {
  const rows = await db().select().from(schema.agentConfigs).where(eq(schema.agentConfigs.id, id))
  return rows[0] ? normalizeAgentRow(rows[0]) : null
}

export async function findAgentConfigByType(agentType: string): Promise<AgentConfigRow | null> {
  const rows = await db().select().from(schema.agentConfigs).where(eq(schema.agentConfigs.agentType, agentType))
  return rows[0] ? normalizeAgentRow(rows[0]) : null
}

export async function insertAgentConfig(input: typeof schema.agentConfigs.$inferInsert): Promise<DbRunResult> {
  const result = await db().insert(schema.agentConfigs).values({
    ...input,
    isActive: input.isActive == null ? input.isActive : (input.isActive ? 1 : 0),
  })
  return normalizeRun(result)
}

export async function updateAgentConfig(id: number, patch: Record<string, unknown>): Promise<void> {
  const normalized = { ...patch }
  if ('isActive' in normalized && typeof normalized.isActive === 'boolean') {
    normalized.isActive = normalized.isActive ? 1 : 0
  }
  await db().update(schema.agentConfigs).set(normalized).where(eq(schema.agentConfigs.id, id))
}

export async function softDeleteAgentConfig(id: number, deletedAt: string): Promise<void> {
  await db().update(schema.agentConfigs).set({ deletedAt }).where(eq(schema.agentConfigs.id, id))
}
