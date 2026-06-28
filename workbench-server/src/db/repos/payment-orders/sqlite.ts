import { and, eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { DbRunResult, PaymentOrderRow } from '../types.js'

const db = () => getSqliteDb()

export function findPaymentOrderById(id: number): PaymentOrderRow | null {
  const [row] = db().select().from(schema.paymentOrders).where(eq(schema.paymentOrders.id, id)).all()
  return row ?? null
}

export function findPaymentOrderByProviderAndOrderNo(
  provider: string,
  orderNo: string,
): PaymentOrderRow | null {
  const [row] = db().select().from(schema.paymentOrders).where(
    and(eq(schema.paymentOrders.provider, provider), eq(schema.paymentOrders.orderNo, orderNo)),
  ).all()
  return row ?? null
}

export function findPaymentOrderByProviderOrderNoAndUserId(
  provider: string,
  orderNo: string,
  userId: number,
): PaymentOrderRow | null {
  const [row] = db().select().from(schema.paymentOrders).where(
    and(
      eq(schema.paymentOrders.provider, provider),
      eq(schema.paymentOrders.orderNo, orderNo),
      eq(schema.paymentOrders.userId, userId),
    ),
  ).all()
  return row ?? null
}

export function findPaymentOrderByProviderPaypalOrderIdAndUserId(
  provider: string,
  paypalOrderId: string,
  userId: number,
): PaymentOrderRow | null {
  const [row] = db().select().from(schema.paymentOrders).where(
    and(
      eq(schema.paymentOrders.provider, provider),
      eq(schema.paymentOrders.paypalOrderId, paypalOrderId),
      eq(schema.paymentOrders.userId, userId),
    ),
  ).all()
  return row ?? null
}

export function insertPaymentOrder(input: typeof schema.paymentOrders.$inferInsert): DbRunResult {
  const res = db().insert(schema.paymentOrders).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updatePaymentOrder(id: number, patch: Record<string, unknown>): DbRunResult {
  const res = db().update(schema.paymentOrders).set(patch).where(eq(schema.paymentOrders.id, id)).run()
  return { lastInsertRowid: 0, changes: res.changes }
}

export function markPaymentOrderPaidIfPending(
  id: number,
  patch: Record<string, unknown>,
): DbRunResult {
  const res = db().update(schema.paymentOrders).set(patch).where(
    and(eq(schema.paymentOrders.id, id), eq(schema.paymentOrders.status, 'pending')),
  ).run()
  return { lastInsertRowid: 0, changes: res.changes }
}
