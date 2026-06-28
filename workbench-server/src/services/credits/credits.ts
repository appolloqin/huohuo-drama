import * as creditsRepo from '../../db/repos/credits/index.js'
import * as usersRepo from '../../db/repos/users/index.js'
import { now } from '../../common/http/response.js'
import { getHuohuoPresetPolicy } from '../ai/huohuo-preset-policy.js'

type ConsumeCreditInput = {
  userId: number
  amount: number
  reason: string
  serviceType?: string
  provider?: string | null
  model?: string | null
  resourceType?: string
  resourceId?: number
  tokenCount?: number
  tokensEstimated?: boolean
}

type AddCreditInput = {
  userId: number
  amount: number
  reason: string
  serviceType?: string
  provider?: string | null
  model?: string | null
  resourceType?: string
  resourceId?: number
}

export function parseConfigSettings(settings: string | null | undefined): Record<string, any> {
  if (!settings) return {}
  try {
    const parsed = JSON.parse(settings)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** 文本服务是否开启模型思考链；默认关闭（小说/润色场景） */
export function resolveThinkingEnabled(settings: Record<string, unknown> | string | null | undefined): boolean {
  const parsed = typeof settings === 'string' || settings == null
    ? parseConfigSettings(settings)
    : settings
  if (typeof parsed.enableThinking === 'boolean') return parsed.enableThinking
  // 兼容旧字段 disableThinking
  if (parsed.disableThinking === true) return false
  if (parsed.disableThinking === false) return true
  return false
}

export function resolveCreditCostFromConfig(config: { settings?: string | null }, fallback = 0): number {
  const parsed = parseConfigSettings(config.settings)
  const raw = Number(parsed.creditCost)
  if (!Number.isFinite(raw) || raw < 0) return fallback
  return Math.floor(raw)
}

export function resolveTextCreditsFromTokens(settings: string | null | undefined, totalTokens: number): number {
  const parsed = parseConfigSettings(settings)
  const unit = Math.max(0, Math.floor(Number(parsed.creditTokenUnit || 0)))
  const cost = Math.max(0, Math.floor(Number(parsed.creditTokenCost || 0)))
  const tokens = Math.max(0, Math.floor(Number(totalTokens || 0)))
  if (unit > 0 && cost > 0) {
    if (tokens <= 0) return 0
    return Math.ceil(tokens * cost / unit)
  }
  return resolveCreditCostFromConfig({ settings }, 0)
}

export function estimateTokensFromText(
  messages: Array<{ content?: string | null }>,
  output = '',
): number {
  const inputChars = messages.reduce((n, m) => n + String(m.content || '').length, 0)
  const outputChars = String(output || '').length
  return Math.max(1, Math.ceil((inputChars + outputChars) / 4))
}

export function resolveTokenUsage(
  usage: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | null | undefined,
  messages: Array<{ content?: string | null }>,
  output = '',
): { totalTokens: number; estimated: boolean } {
  const fromUsage = Number(
    usage?.total_tokens
    ?? ((Number(usage?.prompt_tokens || 0) + Number(usage?.completion_tokens || 0)) || 0),
  )
  if (Number.isFinite(fromUsage) && fromUsage > 0) {
    return { totalTokens: Math.floor(fromUsage), estimated: false }
  }
  return { totalTokens: estimateTokensFromText(messages, output), estimated: true }
}

export async function chargeTextUsage(input: {
  userId: number
  role?: string
  config: { settings?: string | null; provider?: string | null; model?: string | null }
  totalTokens: number
  tokensEstimated?: boolean
  reason: string
  resourceType?: string
  resourceId?: number
}) {
  if (input.role === 'admin') {
    return { charged: 0, remaining: await getUserCredits(input.userId) }
  }
  const policy = await getHuohuoPresetPolicy()
  if (!policy.credit_billing_enabled) {
    return { charged: 0, remaining: await getUserCredits(input.userId) }
  }
  const amount = resolveTextCreditsFromTokens(input.config.settings, input.totalTokens)
  if (amount <= 0) {
    return { charged: 0, remaining: await getUserCredits(input.userId) }
  }
  return await consumeCredits({
    userId: input.userId,
    amount,
    reason: input.reason,
    serviceType: 'text',
    provider: input.config.provider || null,
    model: input.config.model || null,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    tokenCount: input.totalTokens,
    tokensEstimated: input.tokensEstimated,
  })
}

export async function getUserCredits(userId: number): Promise<number> {
  return creditsRepo.getUserCredits(userId)
}

export async function assertUserCanGenerate(userId: number, role?: string) {
  if (role === 'admin') return
  const policy = await getHuohuoPresetPolicy()
  if (!policy.credit_billing_enabled) return
  const credits = await getUserCredits(userId)
  if (credits <= 0) {
    throw new Error('积分不足：当前为 0，无法发起生成')
  }
}

export async function consumeCredits(input: ConsumeCreditInput) {
  const amount = Math.max(0, Math.floor(Number(input.amount || 0)))
  if (amount <= 0) return { remaining: await getUserCredits(input.userId), charged: 0 }

  const profile = await usersRepo.findUserById(input.userId)
  if (!profile) throw new Error('用户不存在')
  if (profile.role === 'admin') {
    return { remaining: Number(profile.credits || 0), charged: 0 }
  }

  const policy = await getHuohuoPresetPolicy()
  if (!policy.credit_billing_enabled) {
    return { remaining: Number(profile.credits || 0), charged: 0 }
  }

  const user = await creditsRepo.findUserCreditsRow(input.userId)
  if (!user) throw new Error('用户不存在')
  const current = Number(user.credits || 0)
  if (current < amount) {
    throw new Error(`积分不足：当前 ${current}，需要 ${amount}`)
  }
  const remaining = current - amount
  const ts = now()

  await creditsRepo.updateUserCredits(input.userId, remaining, ts)
  const tokenCount = Number.isFinite(Number(input.tokenCount)) && Number(input.tokenCount) > 0
    ? Math.floor(Number(input.tokenCount))
    : null

  await creditsRepo.insertCreditLogEntry({
    userId: input.userId,
    delta: -amount,
    balanceAfter: remaining,
    reason: input.reason,
    serviceType: input.serviceType || null,
    provider: input.provider || null,
    model: input.model || null,
    resourceType: input.resourceType || null,
    resourceId: input.resourceId,
    tokenCount,
    tokensEstimated: tokenCount != null ? !!input.tokensEstimated : null,
    createdAt: ts,
  })

  return { remaining, charged: amount, tokenCount }
}

export async function addCredits(input: AddCreditInput) {
  const amount = Math.max(0, Math.floor(Number(input.amount || 0)))
  if (amount <= 0) return { remaining: await getUserCredits(input.userId), added: 0 }

  const user = await creditsRepo.findUserCreditsRow(input.userId)
  if (!user) throw new Error('用户不存在')
  const current = Number(user.credits || 0)
  const remaining = current + amount
  const ts = now()

  await creditsRepo.updateUserCredits(input.userId, remaining, ts)
  await creditsRepo.insertCreditLogEntry({
    userId: input.userId,
    delta: amount,
    balanceAfter: remaining,
    reason: input.reason,
    serviceType: input.serviceType || null,
    provider: input.provider || null,
    model: input.model || null,
    resourceType: input.resourceType || null,
    resourceId: input.resourceId,
    tokenCount: null,
    tokensEstimated: null,
    createdAt: ts,
  })

  return { remaining, added: amount }
}
