import { isMysqlDriver } from '../../driver.js'
import type { AgentConfigRow, DbRunResult } from '../types.js'
import { applyAgentConfigTextPatch, hydrateAgentConfigRow } from '../../../common/storage/text-blob-repo.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function listActiveAgentConfigs(): Promise<AgentConfigRow[]> {
  const rows = isMysqlDriver() ? await mysql.listActiveAgentConfigs() : sqlite.listActiveAgentConfigs()
  return rows.map(hydrateAgentConfigRow)
}

export async function listAllAgentConfigs(): Promise<AgentConfigRow[]> {
  const rows = isMysqlDriver() ? await mysql.listAllAgentConfigs() : sqlite.listAllAgentConfigs()
  return rows.map(hydrateAgentConfigRow)
}

export async function findAgentConfigById(id: number): Promise<AgentConfigRow | null> {
  const row = isMysqlDriver() ? await mysql.findAgentConfigById(id) : sqlite.findAgentConfigById(id)
  return row ? hydrateAgentConfigRow(row) : null
}

export async function findAgentConfigByType(agentType: string): Promise<AgentConfigRow | null> {
  const row = isMysqlDriver() ? await mysql.findAgentConfigByType(agentType) : sqlite.findAgentConfigByType(agentType)
  return row ? hydrateAgentConfigRow(row) : null
}

export async function insertAgentConfig(input: Record<string, unknown>): Promise<DbRunResult> {
  const { systemPrompt, ...rest } = input
  const result = isMysqlDriver()
    ? await mysql.insertAgentConfig({ ...rest, systemPrompt: null } as never)
    : sqlite.insertAgentConfig({ ...rest, systemPrompt: null } as never)
  const id = Number(result.lastInsertRowid)
  if (id > 0 && systemPrompt != null) {
    const patch = applyAgentConfigTextPatch(id, { systemPrompt })
    if (isMysqlDriver()) await mysql.updateAgentConfig(id, patch)
    else sqlite.updateAgentConfig(id, patch)
  }
  return result
}

export async function updateAgentConfig(id: number, patch: Record<string, unknown>): Promise<void> {
  const next = applyAgentConfigTextPatch(id, patch)
  if (isMysqlDriver()) return mysql.updateAgentConfig(id, next)
  sqlite.updateAgentConfig(id, next)
}

export async function softDeleteAgentConfig(id: number, deletedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.softDeleteAgentConfig(id, deletedAt)
  sqlite.softDeleteAgentConfig(id, deletedAt)
}
