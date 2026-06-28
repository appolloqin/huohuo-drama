import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { PaymentProviderConfigRow } from '../types.js'

const db = () => getSqliteDb()

export function listPaymentProviderConfigs(): PaymentProviderConfigRow[] {
  return db().select().from(schema.paymentProviderConfigs).all()
}

export function findPaymentProviderConfigByProvider(provider: string): PaymentProviderConfigRow | null {
  const [row] = db().select().from(schema.paymentProviderConfigs)
    .where(eq(schema.paymentProviderConfigs.provider, provider))
    .all()
  return row ?? null
}

export function updatePaymentProviderConfig(provider: string, patch: Record<string, unknown>): void {
  db().update(schema.paymentProviderConfigs)
    .set(patch)
    .where(eq(schema.paymentProviderConfigs.provider, provider))
    .run()
}
