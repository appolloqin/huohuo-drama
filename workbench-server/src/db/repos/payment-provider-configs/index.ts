import { isMysqlDriver } from '../../driver.js'
import type { PaymentProviderConfigRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function listPaymentProviderConfigs(): Promise<PaymentProviderConfigRow[]> {
  return isMysqlDriver()
    ? mysql.listPaymentProviderConfigs()
    : sqlite.listPaymentProviderConfigs()
}

export async function findPaymentProviderConfigByProvider(provider: string): Promise<PaymentProviderConfigRow | null> {
  return isMysqlDriver()
    ? mysql.findPaymentProviderConfigByProvider(provider)
    : sqlite.findPaymentProviderConfigByProvider(provider)
}

export async function updatePaymentProviderConfig(provider: string, patch: Record<string, unknown>): Promise<void> {
  if (isMysqlDriver()) return mysql.updatePaymentProviderConfig(provider, patch)
  sqlite.updatePaymentProviderConfig(provider, patch)
}
