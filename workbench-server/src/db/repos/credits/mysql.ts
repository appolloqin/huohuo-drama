import { eq } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'

const db = () => getMysqlDb()

export async function getUserCredits(userId: number): Promise<number> {
  const rows = await db().select({ credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId))
  return Number(rows[0]?.credits || 0)
}

export async function findUserCreditsRow(userId: number): Promise<{ id: number; credits: number } | null> {
  const rows = await db().select({ id: schema.users.id, credits: schema.users.credits }).from(schema.users).where(eq(schema.users.id, userId))
  return rows[0] ?? null
}

export async function updateUserCredits(userId: number, credits: number, updatedAt: string): Promise<void> {
  await db().update(schema.users).set({ credits, updatedAt }).where(eq(schema.users.id, userId))
}

export async function insertCreditLogEntry(input: {
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
}): Promise<void> {
  await db().insert(schema.creditLogs).values({
    ...input,
    tokensEstimated: input.tokensEstimated == null ? null : (input.tokensEstimated ? 1 : 0),
  })
}
