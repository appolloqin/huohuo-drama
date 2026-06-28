import { isMysqlDriver } from '../../driver.js'
import type { AiServiceConfigRow, AiServiceProviderRow, DbRunResult } from '../types.js'
import { decryptSecret, encryptSecret } from '../../../common/security/secret-cipher.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

function decryptConfigRow(row: AiServiceConfigRow): AiServiceConfigRow {
  if (!row.apiKey) return row
  return { ...row, apiKey: decryptSecret(row.apiKey) ?? '' }
}

function encryptConfigPatch(patch: Record<string, unknown>): Record<string, unknown> {
  if (typeof patch.apiKey !== 'string' || !patch.apiKey) return patch
  return { ...patch, apiKey: encryptSecret(patch.apiKey) }
}

function encryptConfigInput(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.apiKey !== 'string' || !input.apiKey) return input
  return { ...input, apiKey: encryptSecret(input.apiKey) }
}

export async function listAllServiceConfigs(): Promise<AiServiceConfigRow[]> {
  const rows = isMysqlDriver() ? await mysql.listAllServiceConfigs() : sqlite.listAllServiceConfigs()
  return rows.map(decryptConfigRow)
}

export async function listServiceConfigsByType(serviceType: string): Promise<AiServiceConfigRow[]> {
  const rows = isMysqlDriver()
    ? await mysql.listServiceConfigsByType(serviceType)
    : sqlite.listServiceConfigsByType(serviceType)
  return rows.map(decryptConfigRow)
}

export async function findServiceConfigById(id: number): Promise<AiServiceConfigRow | null> {
  const row = isMysqlDriver() ? await mysql.findServiceConfigById(id) : sqlite.findServiceConfigById(id)
  return row ? decryptConfigRow(row) : null
}

export async function findServiceConfigByTypeAndProvider(serviceType: string, provider: string): Promise<AiServiceConfigRow | null> {
  const row = isMysqlDriver()
    ? await mysql.findServiceConfigByTypeAndProvider(serviceType, provider)
    : sqlite.findServiceConfigByTypeAndProvider(serviceType, provider)
  return row ? decryptConfigRow(row) : null
}

export async function insertServiceConfig(input: Record<string, unknown>): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.insertServiceConfig(encryptConfigInput(input) as never)
    : sqlite.insertServiceConfig(encryptConfigInput(input) as never)
}

export async function updateServiceConfig(id: number, patch: Record<string, unknown>): Promise<void> {
  const encPatch = encryptConfigPatch(patch)
  if (isMysqlDriver()) return mysql.updateServiceConfig(id, encPatch)
  sqlite.updateServiceConfig(id, encPatch)
}

export async function deleteServiceConfig(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteServiceConfig(id)
  sqlite.deleteServiceConfig(id)
}

export async function listServiceProviders(): Promise<AiServiceProviderRow[]> {
  return isMysqlDriver() ? mysql.listServiceProviders() : sqlite.listServiceProviders()
}
