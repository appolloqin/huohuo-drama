import { desc, eq, like } from 'drizzle-orm'
import { getMysqlDb, schema } from '../../mysql/client.js'
import type { CreditLogRow, DbRunResult, NewUserInput, UserRow } from '../types.js'

const db = () => getMysqlDb()

type MysqlHeader = { insertId?: number; affectedRows?: number }

function normalizeRun(result: unknown): DbRunResult {
  const header = (Array.isArray(result) ? result[0] : result) as MysqlHeader | undefined
  return {
    lastInsertRowid: Number(header?.insertId ?? 0),
    changes: header?.affectedRows,
  }
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await db().select().from(schema.users).where(eq(schema.users.username, username))
  return rows[0] ?? null
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const rows = await db().select().from(schema.users).where(eq(schema.users.id, id))
  return rows[0] ?? null
}

export async function insertUser(input: NewUserInput): Promise<DbRunResult> {
  const result = await db().insert(schema.users).values(input)
  return normalizeRun(result)
}

export async function updateUserPassword(id: number, passwordHash: string, updatedAt: string): Promise<void> {
  await db().update(schema.users).set({ passwordHash, updatedAt }).where(eq(schema.users.id, id))
}

export async function updateUserCredits(id: number, credits: number, updatedAt: string): Promise<void> {
  await db().update(schema.users).set({ credits, updatedAt }).where(eq(schema.users.id, id))
}

export async function findUserByWechatMpOpenid(openid: string): Promise<UserRow | null> {
  const rows = await db().select().from(schema.users).where(eq(schema.users.wechatMpOpenid, openid))
  return rows[0] ?? null
}

export async function updateUserWechatIdentity(
  id: number,
  patch: { wechatMpOpenid?: string | null; wechatUnionid?: string | null },
  updatedAt: string,
): Promise<void> {
  const set: {
    updatedAt: string
    wechatMpOpenid?: string | null
    wechatUnionid?: string | null
  } = { updatedAt }
  if (patch.wechatMpOpenid !== undefined) set.wechatMpOpenid = patch.wechatMpOpenid
  if (patch.wechatUnionid !== undefined) set.wechatUnionid = patch.wechatUnionid
  await db().update(schema.users).set(set).where(eq(schema.users.id, id))
}

export async function updateUserAccess(
  id: number,
  patch: { role?: string; navModulesOverride?: string | null },
  updatedAt: string,
): Promise<void> {
  const set: { updatedAt: string; role?: string; navModulesOverride?: string | null } = { updatedAt }
  if (patch.role !== undefined) set.role = patch.role
  if (patch.navModulesOverride !== undefined) set.navModulesOverride = patch.navModulesOverride
  await db().update(schema.users).set(set).where(eq(schema.users.id, id))
}

export async function listAllUsers(): Promise<UserRow[]> {
  const rows = await db().select().from(schema.users)
  return rows.sort((a, b) => a.id - b.id)
}

export async function searchUsers(keyword: string, limit: number): Promise<UserRow[]> {
  const capped = Math.min(Math.max(limit, 1), 50)
  const kw = keyword.trim()
  if (!kw) {
    const rows = await db().select().from(schema.users)
    return rows.sort((a, b) => b.id - a.id).slice(0, capped)
  }
  if (/^\d+$/.test(kw)) {
    const row = await findUserById(Number(kw))
    return row ? [row] : []
  }
  const escaped = kw.replace(/[%_\\]/g, '\\$&')
  const rows = await db().select().from(schema.users)
    .where(like(schema.users.username, `%${escaped}%`))
  return rows.sort((a, b) => a.username.localeCompare(b.username)).slice(0, capped)
}

export async function listCreditLogsByUser(userId: number, limit: number): Promise<CreditLogRow[]> {
  // Push the user_id filter, ORDER BY created_at desc, and LIMIT into SQL so
  // we never pull the full credit_logs table into Node just to sort/slice it.
  // The composite (user_id, created_at) index below covers this query.
  const capped = Math.min(Math.max(limit, 1), 200)
  const rows = await db().select().from(schema.creditLogs)
    .where(eq(schema.creditLogs.userId, userId))
    .orderBy(desc(schema.creditLogs.createdAt))
    .limit(capped)
  return rows.map(row => ({
    ...row,
    tokensEstimated: row.tokensEstimated == null ? null : Boolean(row.tokensEstimated),
  }))
}

export async function deleteUserById(id: number): Promise<void> {
  await db().delete(schema.users).where(eq(schema.users.id, id))
}

export async function insertCreditLog(input: {
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
}): Promise<void> {
  await db().insert(schema.creditLogs).values(input)
}
