import * as aiPresetConfigsRepo from '../../db/repos/ai-preset-configs/index.js'
import * as userPresetRepo from '../../db/repos/user-ai-preset-configs/index.js'
import { now } from '../../common/http/response.js'

const POLICY_PRESET_KEY = 'policy'

export type HuohuoPresetPolicy = {
  credit_billing_enabled: boolean
}

export async function getHuohuoPresetPolicy(): Promise<HuohuoPresetPolicy> {
  const row = await aiPresetConfigsRepo.findPresetByKey(POLICY_PRESET_KEY)
  if (!row?.model) return { credit_billing_enabled: true }
  try {
    const parsed = JSON.parse(row.model)
    return { credit_billing_enabled: parsed.credit_billing_enabled !== false }
  } catch {
    return { credit_billing_enabled: true }
  }
}

export async function saveHuohuoPresetPolicy(creditBillingEnabled: boolean): Promise<HuohuoPresetPolicy> {
  const ts = now()
  await aiPresetConfigsRepo.upsertPreset({
    presetKey: POLICY_PRESET_KEY,
    model: JSON.stringify({ credit_billing_enabled: creditBillingEnabled }),
    label: 'Policy',
    priority: 0,
    isActive: true,
    createdAt: ts,
    updatedAt: ts,
  })
  return getHuohuoPresetPolicy()
}

export async function userHasByokApiKey(userId: number, serviceType: string): Promise<boolean> {
  const row = await userPresetRepo.findUserPreset(userId, serviceType)
  return !!((row?.apiKey ?? '').trim())
}

export async function shouldSkipCreditBilling(
  userId: number,
  role?: string,
  serviceType?: string,
): Promise<boolean> {
  if (role === 'admin') return true
  const policy = await getHuohuoPresetPolicy()
  if (policy.credit_billing_enabled) return false
  if (!serviceType) return true
  return userHasByokApiKey(userId, serviceType)
}
