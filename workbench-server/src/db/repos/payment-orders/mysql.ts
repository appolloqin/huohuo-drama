import { and, eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { DbRunResult, PaymentOrderRow } from '../types.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function findPaymentOrderById(id: number): Promise<PaymentOrderRow | null> {
  const rows = await db().select().from(schema.paymentOrders).where(eq(schema.paymentOrders.id, id))
  return rows[0] ?? null
}

export async function findPaymentOrderByProviderAndOrderNo(
  provider: string,
  orderNo: string,
): Promise<PaymentOrderRow | null> {
  const rows = await db().select().from(schema.paymentOrders).where(
    and(eq(schema.paymentOrders.provider, provider), eq(schema.paymentOrders.orderNo, orderNo)),
  )
  return rows[0] ?? null
}

export async function findPaymentOrderByProviderOrderNoAndUserId(
  provider: string,
  orderNo: string,
  userId: number,
): Promise<PaymentOrderRow | null> {
  const rows = await db().select().from(schema.paymentOrders).where(
    and(
      eq(schema.paymentOrders.provider, provider),
      eq(schema.paymentOrders.orderNo, orderNo),
      eq(schema.paymentOrders.userId, userId),
    ),
  )
  return rows[0] ?? null
}

export async function findPaymentOrderByProviderPaypalOrderIdAndUserId(
  provider: string,
  paypalOrderId: string,
  userId: number,
): Promise<PaymentOrderRow | null> {
  const rows = await db().select().from(schema.paymentOrders).where(
    and(
      eq(schema.paymentOrders.provider, provider),
      eq(schema.paymentOrders.paypalOrderId, paypalOrderId),
      eq(schema.paymentOrders.userId, userId),
    ),
  )
  return rows[0] ?? null
}

export async function insertPaymentOrder(input: typeof schema.paymentOrders.$inferInsert): Promise<DbRunResult> {
  const result = await db().insert(schema.paymentOrders).values(input)
  return normalizeRun(result)
}

export async function updatePaymentOrder(id: number, patch: Record<string, unknown>): Promise<DbRunResult> {
  const result = await db().update(schema.paymentOrders).set(patch).where(eq(schema.paymentOrders.id, id))
  return normalizeRun(result)
}

export async function markPaymentOrderPaidIfPending(
  id: number,
  patch: Record<string, unknown>,
): Promise<DbRunResult> {
  const result = await db().update(schema.paymentOrders).set(patch).where(
    and(eq(schema.paymentOrders.id, id), eq(schema.paymentOrders.status, 'pending')),
  )
  return normalizeRun(result)
}
