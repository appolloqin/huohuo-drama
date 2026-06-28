import { eq } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'

const db = () => getSqliteDb()

export function getUserCredits(userId: number): number {
  const [row] = db().select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId)).all()
  return Number(row?.credits || 0)
}

export function findUserCreditsRow(userId: number): { id: number; credits: number } | null {
  const [row] = db().select({ id: schema.users.id, credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId)).all()
  return row ?? null
}

export function updateUserCredits(userId: number, credits: number, updatedAt: string): void {
  db().update(schema.users).set({ credits, updatedAt }).where(eq(schema.users.id, userId)).run()
}

export function insertCreditLogEntry(input: {
  userId: number
  delta: number
  balanceAfter: number
  reason: string
  serviceType: string | null
  provider: string | null
  model: string | null
  resourceType: string | null
  resourceId: number | null | undefined
  tokenCount: number | null
  tokensEstimated: boolean | null
  createdAt: string
}): void {
  db().insert(schema.creditLogs).values(input).run()
}
