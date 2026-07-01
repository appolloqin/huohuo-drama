import { isMysqlDriver } from '../../driver.js'
import type { CreditLogRow, DbRunResult, NewUserInput, UserRow } from '../types.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  return isMysqlDriver()
    ? mysql.findUserByUsername(username)
    : sqlite.findUserByUsername(username)
}

export async function findUserById(id: number): Promise<UserRow | null> {
  return isMysqlDriver() ? mysql.findUserById(id) : sqlite.findUserById(id)
}

export async function insertUser(input: NewUserInput): Promise<DbRunResult> {
  return isMysqlDriver() ? mysql.insertUser(input) : sqlite.insertUser(input)
}

export async function updateUserPassword(id: number, passwordHash: string, updatedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.updateUserPassword(id, passwordHash, updatedAt)
  sqlite.updateUserPassword(id, passwordHash, updatedAt)
}

export async function updateUserCredits(id: number, credits: number, updatedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.updateUserCredits(id, credits, updatedAt)
  sqlite.updateUserCredits(id, credits, updatedAt)
}

export async function findUserByWechatMpOpenid(openid: string): Promise<UserRow | null> {
  return isMysqlDriver()
    ? mysql.findUserByWechatMpOpenid(openid)
    : sqlite.findUserByWechatMpOpenid(openid)
}

export async function updateUserWechatIdentity(
  id: number,
  patch: { wechatMpOpenid?: string | null; wechatUnionid?: string | null },
  updatedAt: string,
): Promise<void> {
  if (isMysqlDriver()) return mysql.updateUserWechatIdentity(id, patch, updatedAt)
  sqlite.updateUserWechatIdentity(id, patch, updatedAt)
}

export async function updateUserAccess(
  id: number,
  patch: { role?: string; navModulesOverride?: string | null },
  updatedAt: string,
): Promise<void> {
  if (isMysqlDriver()) return mysql.updateUserAccess(id, patch, updatedAt)
  sqlite.updateUserAccess(id, patch, updatedAt)
}

export async function listAllUsers(): Promise<UserRow[]> {
  return isMysqlDriver() ? mysql.listAllUsers() : sqlite.listAllUsers()
}

export async function searchUsers(keyword: string, limit: number): Promise<UserRow[]> {
  return isMysqlDriver()
    ? mysql.searchUsers(keyword, limit)
    : sqlite.searchUsers(keyword, limit)
}

export async function listCreditLogsByUser(userId: number, limit: number): Promise<CreditLogRow[]> {
  return isMysqlDriver()
    ? mysql.listCreditLogsByUser(userId, limit)
    : sqlite.listCreditLogsByUser(userId, limit)
}

export async function deleteUserById(id: number): Promise<void> {
  if (isMysqlDriver()) return mysql.deleteUserById(id)
  sqlite.deleteUserById(id)
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
  if (isMysqlDriver()) return mysql.insertCreditLog(input)
  sqlite.insertCreditLog(input)
}
