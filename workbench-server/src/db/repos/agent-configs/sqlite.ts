import { eq, isNull } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { AgentConfigRow, DbRunResult } from '../types.js'

const db = () => getSqliteDb()

export function listActiveAgentConfigs(): AgentConfigRow[] {
  return db().select().from(schema.agentConfigs).where(isNull(schema.agentConfigs.deletedAt)).all()
}

export function listAllAgentConfigs(): AgentConfigRow[] {
  return db().select().from(schema.agentConfigs).all()
}

export function findAgentConfigById(id: number): AgentConfigRow | null {
  const [row] = db().select().from(schema.agentConfigs).where(eq(schema.agentConfigs.id, id)).all()
  return row ?? null
}

export function findAgentConfigByType(agentType: string): AgentConfigRow | null {
  const [row] = db().select().from(schema.agentConfigs).where(eq(schema.agentConfigs.agentType, agentType)).all()
  return row ?? null
}

export function insertAgentConfig(input: typeof schema.agentConfigs.$inferInsert): DbRunResult {
  const res = db().insert(schema.agentConfigs).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateAgentConfig(id: number, patch: Record<string, unknown>): void {
  db().update(schema.agentConfigs).set(patch).where(eq(schema.agentConfigs.id, id)).run()
}

export function softDeleteAgentConfig(id: number, deletedAt: string): void {
  db().update(schema.agentConfigs).set({ deletedAt }).where(eq(schema.agentConfigs.id, id)).run()
}
