import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { PaymentProviderConfigRow } from '../types.js'

const db = () => getMysqlDb()

export async function listPaymentProviderConfigs(): Promise<PaymentProviderConfigRow[]> {
  return db().select().from(schema.paymentProviderConfigs)
}

export async function findPaymentProviderConfigByProvider(provider: string): Promise<PaymentProviderConfigRow | null> {
  const rows = await db().select().from(schema.paymentProviderConfigs)
    .where(eq(schema.paymentProviderConfigs.provider, provider))
  return rows[0] ?? null
}

export async function updatePaymentProviderConfig(provider: string, patch: Record<string, unknown>): Promise<void> {
  await db().update(schema.paymentProviderConfigs)
    .set(patch)
    .where(eq(schema.paymentProviderConfigs.provider, provider))
}
