import { isMysqlDriver } from '../../driver.js'
import * as mysql from './mysql.js'
import * as sqlite from './sqlite.js'

export async function getUserCredits(userId: number): Promise<number> {
  return isMysqlDriver() ? mysql.getUserCredits(userId) : sqlite.getUserCredits(userId)
}

export async function findUserCreditsRow(userId: number): Promise<{ id: number; credits: number } | null> {
  return isMysqlDriver() ? mysql.findUserCreditsRow(userId) : sqlite.findUserCreditsRow(userId)
}

export async function updateUserCredits(userId: number, credits: number, updatedAt: string): Promise<void> {
  if (isMysqlDriver()) return mysql.updateUserCredits(userId, credits, updatedAt)
  sqlite.updateUserCredits(userId, credits, updatedAt)
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
  if (isMysqlDriver()) return mysql.insertCreditLogEntry(input)
  sqlite.insertCreditLogEntry(input)
}
