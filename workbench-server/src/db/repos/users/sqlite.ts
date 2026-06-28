import { desc, eq, like } from 'drizzle-orm'
import { getSqliteDb, schema } from '../../sqlite/client.js'
import type { CreditLogRow, DbRunResult, NewUserInput, UserRow } from '../types.js'

const db = () => getSqliteDb()

export function findUserByUsername(username: string): UserRow | null {
  const [row] = db().select().from(schema.users).where(eq(schema.users.username, username)).all()
  return row ?? null
}

export function findUserById(id: number): UserRow | null {
  const [row] = db().select().from(schema.users).where(eq(schema.users.id, id)).all()
  return row ?? null
}

export function insertUser(input: NewUserInput): DbRunResult {
  const res = db().insert(schema.users).values(input).run()
  return { lastInsertRowid: Number(res.lastInsertRowid ?? 0), changes: res.changes }
}

export function updateUserPassword(id: number, passwordHash: string, updatedAt: string): void {
  db().update(schema.users).set({ passwordHash, updatedAt }).where(eq(schema.users.id, id)).run()
}

export function updateUserCredits(id: number, credits: number, updatedAt: string): void {
  db().update(schema.users).set({ credits, updatedAt }).where(eq(schema.users.id, id)).run()
}

export function updateUserAccess(
  id: number,
  patch: { role?: string; navModulesOverride?: string | null },
  updatedAt: string,
): void {
  const set: { updatedAt: string; role?: string; navModulesOverride?: string | null } = { updatedAt }
  if (patch.role !== undefined) set.role = patch.role
  if (patch.navModulesOverride !== undefined) set.navModulesOverride = patch.navModulesOverride
  db().update(schema.users).set(set).where(eq(schema.users.id, id)).run()
}

export function listAllUsers(): UserRow[] {
  return db().select().from(schema.users).all().sort((a, b) => a.id - b.id)
}

export function searchUsers(keyword: string, limit: number): UserRow[] {
  const capped = Math.min(Math.max(limit, 1), 50)
  const kw = keyword.trim()
  if (!kw) {
    return db().select().from(schema.users).all()
      .sort((a, b) => b.id - a.id)
      .slice(0, capped)
  }
  if (/^\d+$/.test(kw)) {
    const row = findUserById(Number(kw))
    return row ? [row] : []
  }
  const escaped = kw.replace(/[%_\\]/g, '\\$&')
  const rows = db().select().from(schema.users)
    .where(like(schema.users.username, `%${escaped}%`))
    .all()
  return rows.sort((a, b) => a.username.localeCompare(b.username)).slice(0, capped)
}

export function listCreditLogsByUser(userId: number, limit: number): CreditLogRow[] {
  // Push the user_id filter, ORDER BY created_at desc, and LIMIT into SQL so
  // we never pull the full credit_logs table into Node just to sort/slice it.
  const capped = Math.min(Math.max(limit, 1), 200)
  return db().select().from(schema.creditLogs)
    .where(eq(schema.creditLogs.userId, userId))
    .orderBy(desc(schema.creditLogs.createdAt))
    .limit(capped)
    .all()
}

export function deleteUserById(id: number): void {
  db().delete(schema.users).where(eq(schema.users.id, id)).run()
}

export function insertCreditLog(input: {
  userId: number
  delta: number
  balanceAfter: number
  reason: string
  serviceType: string | null
  provider: string | null
  model: string | null
  resourceType: string
  resourceId: number | null
  createdAt: string
}): void {
  db().insert(schema.creditLogs).values(input).run()
}
