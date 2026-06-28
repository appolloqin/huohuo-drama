import { hashPassword, verifyPassword } from '../../common/auth/password.js'
import { signJwt, getJwtSecret } from '../../common/auth/jwt-token.js'
import { now } from '../../common/http/response.js'
import { randomBytes } from 'node:crypto'
import * as usersRepo from '../../db/repos/users/index.js'
import {
  navModulesForUser,
  navModulesSourceForUser,
  parseStoredUserNavOverride,
  serializeUserNavOverride,
  validateRoleName,
} from './nav-modules.js'
import { getHuohuoPresetPolicy } from '../ai/huohuo-preset-policy.js'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/
const JWT_TTL_SEC = 7 * 24 * 3600

export class AuthValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthValidationError'
  }
}

export class AuthConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthConflictError'
  }
}

function issueToken(user: { id: number; username: string; role: string }) {
  return signJwt(
    { sub: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    JWT_TTL_SEC,
  )
}

async function buildUserPayload(row: {
  id?: number
  username: string
  role: string
  credits: number | null
  navModulesOverride?: string | null
}) {
  const nav_modules = await navModulesForUser({
    role: row.role,
    navModulesOverride: row.navModulesOverride,
  })
  const policy = await getHuohuoPresetPolicy()
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    credits: Number(row.credits || 0),
    nav_modules,
    nav_modules_source: navModulesSourceForUser(row.navModulesOverride),
    credit_billing_enabled: policy.credit_billing_enabled,
  }
}

async function buildAdminUserAccessRow(user: NonNullable<Awaited<ReturnType<typeof usersRepo.findUserById>>>) {
  const override = parseStoredUserNavOverride(user.navModulesOverride)
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    credits: Number(user.credits || 0),
    nav_modules_override: override,
    nav_modules: await navModulesForUser(user),
    nav_modules_source: navModulesSourceForUser(user.navModulesOverride),
  }
}

export function validateUsername(username: string) {
  if (!USERNAME_RE.test(username)) {
    throw new AuthValidationError('用户名须为 3–32 位字母、数字或下划线')
  }
}

export function validatePassword(password: string, minMessage = '密码至少 8 位') {
  if (password.length < 8) {
    throw new AuthValidationError(minMessage)
  }
}

export async function registerUser(username: string, password: string) {
  validateUsername(username)
  validatePassword(password)

  const ts = now()
  try {
    const res = await usersRepo.insertUser({
      username,
      passwordHash: hashPassword(password),
      role: 'user',
      credits: 0,
      createdAt: ts,
      updatedAt: ts,
    })
    const id = Number(res.lastInsertRowid)
    const token = issueToken({ id, username, role: 'user' })
    return {
      token,
      user: await buildUserPayload({ id, username, role: 'user', credits: 0, navModulesOverride: null }),
    }
  } catch {
    throw new AuthConflictError('用户名已存在')
  }
}

export async function loginUser(username: string, password: string) {
  if (!username || !password) {
    throw new AuthValidationError('请输入用户名和密码')
  }

  const row = await usersRepo.findUserByUsername(username.trim())
  if (!row || !verifyPassword(password, row.passwordHash)) {
    throw new AuthValidationError('用户名或密码错误')
  }

  const token = issueToken({
    id: row.id,
    username: row.username,
    role: row.role,
  })

  return {
    token,
    user: await buildUserPayload(row),
  }
}

export async function getCurrentUserProfile(userId: number, username: string, role: string) {
  const row = await usersRepo.findUserById(userId)
  const payload = row
    ? await buildUserPayload(row)
    : await buildUserPayload({ username, role, credits: 0, navModulesOverride: null })
  return payload
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  if (!currentPassword || !newPassword) {
    throw new AuthValidationError('请填写当前密码和新密码')
  }
  validatePassword(newPassword, '新密码至少 8 位')

  const row = await usersRepo.findUserById(userId)
  if (!row) throw new AuthValidationError('用户不存在')
  if (!verifyPassword(currentPassword, row.passwordHash)) {
    throw new AuthValidationError('当前密码不正确')
  }

  await usersRepo.updateUserPassword(userId, hashPassword(newPassword), now())
}

export async function listCreditLogs(userId: number, limit: number) {
  const logs = await usersRepo.listCreditLogsByUser(userId, limit)
  return logs.map(item => ({
    id: item.id,
    delta: item.delta,
    balance_after: item.balanceAfter,
    reason: item.reason,
    service_type: item.serviceType,
    provider: item.provider,
    model: item.model,
    resource_type: item.resourceType,
    resource_id: item.resourceId,
    token_count: item.tokenCount ?? null,
    tokens_estimated: item.tokensEstimated ?? null,
    created_at: item.createdAt,
  }))
}

export async function listUsersForAdmin() {
  const users = await usersRepo.listAllUsers()
  return Promise.all(users.map(user => buildAdminUserAccessRow(user)))
}

export async function searchUsersForAdmin(keyword: string, limit: number) {
  const users = await usersRepo.searchUsers(keyword, limit)
  return users.map(user => ({
    id: user.id,
    username: user.username,
    role: user.role,
    credits: Number(user.credits || 0),
  }))
}

export async function getUserAccessForAdmin(userId: number) {
  const user = await usersRepo.findUserById(userId)
  if (!user) throw new AuthValidationError('用户不存在')
  return buildAdminUserAccessRow(user)
}

export async function updateUserAccessForAdmin(args: {
  userId: number
  role?: string
  navModulesOverride?: string[] | null
}) {
  const target = await usersRepo.findUserById(args.userId)
  if (!target) throw new AuthValidationError('用户不存在')

  const patch: { role?: string; navModulesOverride?: string | null } = {}
  let nextRole = target.role

  if (args.role !== undefined) {
    try {
      nextRole = validateRoleName(args.role)
    } catch (err) {
      throw new AuthValidationError(err instanceof Error ? err.message : '角色名无效')
    }
    patch.role = nextRole
  }

  if (args.navModulesOverride !== undefined) {
    if (args.navModulesOverride === null) {
      patch.navModulesOverride = null
    } else if (!Array.isArray(args.navModulesOverride)) {
      throw new AuthValidationError('nav_modules_override 格式无效')
    } else {
      patch.navModulesOverride = serializeUserNavOverride(args.navModulesOverride, nextRole)
    }
  }

  if (!Object.keys(patch).length) {
    throw new AuthValidationError('无更新内容')
  }

  await usersRepo.updateUserAccess(args.userId, patch, now())
  const updated = await usersRepo.findUserById(args.userId)
  if (!updated) throw new AuthValidationError('用户不存在')
  return buildAdminUserAccessRow(updated)
}

export async function adjustUserCredits(args: {
  operatorUsername: string
  userId: number
  delta: number
  reason: string
}) {
  const { operatorUsername, userId, delta, reason } = args
  if (!Number.isFinite(userId) || !userId) {
    throw new AuthValidationError('user_id 无效')
  }
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AuthValidationError('delta 不能为 0')
  }

  const target = await usersRepo.findUserById(userId)
  if (!target) throw new AuthValidationError('用户不存在')

  const current = Number(target.credits || 0)
  const next = current + delta
  if (next < 0) throw new AuthValidationError(`积分不足，当前仅 ${current}`)

  const ts = now()
  await usersRepo.updateUserCredits(userId, next, ts)
  await usersRepo.insertCreditLog({
    userId,
    delta,
    balanceAfter: next,
    reason: `${reason}（操作人:${operatorUsername}）`,
    serviceType: null,
    provider: null,
    model: null,
    resourceType: 'admin_adjust',
    resourceId: null,
    createdAt: ts,
  })

  return { user_id: userId, credits: next }
}

// 生成 12 位 base64url 随机密码（满足「至少 8 位」校验）
function generateRandomPassword(): string {
  return randomBytes(12).toString('base64url')
}

export async function createUserForAdmin(args: {
  username: string
  password?: string
  role: string
  credits: number
}) {
  const username = String(args.username || '').trim()
  const role = String(args.role || '').trim()
  const credits = Math.trunc(Number(args.credits ?? 0))
  validateUsername(username)
  if (!Number.isFinite(credits) || credits < 0) {
    throw new AuthValidationError('初始积分必须为非负整数')
  }
  let roleName: string
  try {
    roleName = validateRoleName(role)
  } catch (err) {
    throw new AuthValidationError(err instanceof Error ? err.message : '角色名无效')
  }

  const plainPassword = String(args.password || '').trim() || generateRandomPassword()
  validatePassword(plainPassword)

  const ts = now()
  let insertRes
  try {
    insertRes = await usersRepo.insertUser({
      username,
      passwordHash: hashPassword(plainPassword),
      role: roleName,
      credits,
      createdAt: ts,
      updatedAt: ts,
    })
  } catch {
    throw new AuthConflictError('用户名已存在')
  }

  if (credits > 0) {
    await usersRepo.insertCreditLog({
      userId: Number(insertRes.lastInsertRowid),
      delta: credits,
      balanceAfter: credits,
      reason: '管理员开户赠送积分',
      serviceType: null,
      provider: null,
      model: null,
      resourceType: 'admin_grant',
      resourceId: null,
      createdAt: ts,
    })
  }

  return {
    user: await getUserAccessForAdmin(Number(insertRes.lastInsertRowid)),
    initial_password: plainPassword,
  }
}

export async function deleteUserForAdmin(args: {
  operatorId: number
  targetId: number
}) {
  const { operatorId, targetId } = args
  if (!Number.isFinite(targetId) || !targetId) {
    throw new AuthValidationError('user_id 无效')
  }
  if (operatorId === targetId) {
    throw new AuthValidationError('不能删除自己的账号')
  }
  const target = await usersRepo.findUserById(targetId)
  if (!target) throw new AuthValidationError('用户不存在')

  await usersRepo.deleteUserById(targetId)
  return { user_id: targetId, deleted: true as const }
}
