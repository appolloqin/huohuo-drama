import { isMysqlDriver } from '../../driver.js'
import type { DbRunResult, PaymentOrderRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function findPaymentOrderById(id: number): Promise<PaymentOrderRow | null> {
  return isMysqlDriver() ? mysql.findPaymentOrderById(id) : sqlite.findPaymentOrderById(id)
}

export async function findPaymentOrderByProviderAndOrderNo(
  provider: string,
  orderNo: string,
): Promise<PaymentOrderRow | null> {
  return isMysqlDriver()
    ? mysql.findPaymentOrderByProviderAndOrderNo(provider, orderNo)
    : sqlite.findPaymentOrderByProviderAndOrderNo(provider, orderNo)
}

export async function findPaymentOrderByProviderOrderNoAndUserId(
  provider: string,
  orderNo: string,
  userId: number,
): Promise<PaymentOrderRow | null> {
  return isMysqlDriver()
    ? mysql.findPaymentOrderByProviderOrderNoAndUserId(provider, orderNo, userId)
    : sqlite.findPaymentOrderByProviderOrderNoAndUserId(provider, orderNo, userId)
}

export async function findPaymentOrderByProviderPaypalOrderIdAndUserId(
  provider: string,
  paypalOrderId: string,
  userId: number,
): Promise<PaymentOrderRow | null> {
  return isMysqlDriver()
    ? mysql.findPaymentOrderByProviderPaypalOrderIdAndUserId(provider, paypalOrderId, userId)
    : sqlite.findPaymentOrderByProviderPaypalOrderIdAndUserId(provider, paypalOrderId, userId)
}

export async function insertPaymentOrder(input: Record<string, unknown>): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.insertPaymentOrder(input as never)
    : sqlite.insertPaymentOrder(input as never)
}

export async function updatePaymentOrder(id: number, patch: Record<string, unknown>): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.updatePaymentOrder(id, patch)
    : sqlite.updatePaymentOrder(id, patch)
}

export async function markPaymentOrderPaidIfPending(
  id: number,
  patch: Record<string, unknown>,
): Promise<DbRunResult> {
  return isMysqlDriver()
    ? mysql.markPaymentOrderPaidIfPending(id, patch)
    : sqlite.markPaymentOrderPaidIfPending(id, patch)
}
