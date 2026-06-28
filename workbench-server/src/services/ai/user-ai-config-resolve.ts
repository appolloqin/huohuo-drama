/**
 * 用户模型分两套完整配置（二选一，生成前校验当前生效的一套）：
 *
 * A. 火火一键配置（preset_key: text / image / video / audio / agent）
 *    - 含文本、图片、生视频、生音频、Agent；积分开 → 平台 Key；积分关 → 用户 BYOK
 *
 * B. 默认模型（preset_key: default_text / default_image / default_video / default_audio → ai_service_configs.id）
 *    - 同样覆盖 text / image / video / audio；走服务目录 + 积分
 *
 * 生效规则：积分开 → 火火一键生效；积分关且用户已配火火 BYOK → 火火一键生效；否则默认模型生效。
 * 火火一键生效时，全部用例以火火 preset 为主（忽略集级 configId）。
 */
import * as aiConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import * as userPresetRepo from '../../db/repos/user-ai-preset-configs/index.js'
import { logTaskProgress } from '../../common/task/task-logger.js'
import { getPlatformServicePreset, getEffectiveAgentModelName } from './ai-config-service.js'
import { getHuohuoPresetPolicy, shouldSkipCreditBilling, userHasByokApiKey } from './huohuo-preset-policy.js'
import type { AIConfig, ConfigResolveOpts, ServiceType } from './ai.js'

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
}

export type CatalogServiceType = ServiceType

export const DEFAULT_CATALOG_PRESET_KEY: Record<CatalogServiceType, string> = {
  text: 'default_text',
  image: 'default_image',
  video: 'default_video',
  audio: 'default_audio',
}

/** @deprecated use CatalogServiceType */
export type CatalogMediaType = CatalogServiceType

export type UserModelBlock = 'huohuo_preset' | 'default_model'

export class UserAiConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserAiConfigError'
  }
}

function labelOf(serviceType: ServiceType): string {
  return SERVICE_TYPE_LABELS[serviceType] || serviceType
}

function presetSettingsHint(): string {
  return '请前往 设置 → 账户 → 火火一键配置 完成配置'
}

function defaultModelHint(): string {
  return '请前往 设置 → 账户 → 默认模型 选择已启用的模型'
}

function huohuoBillingSettings(serviceType: ServiceType): string {
  if (serviceType === 'text') {
    return JSON.stringify({ creditTokenUnit: 3000, creditTokenCost: 10, creditCost: 0 })
  }
  if (serviceType === 'image') return JSON.stringify({ creditCost: 10 })
  if (serviceType === 'video') return JSON.stringify({ creditCost: 30 })
  return JSON.stringify({ creditCost: 5 })
}

type ServiceConfigRow = NonNullable<Awaited<ReturnType<typeof aiConfigsRepo.findServiceConfigById>>>

export function rowToAiConfig(row: ServiceConfigRow, serviceType?: ServiceType): AIConfig {
  const models = row.model ? JSON.parse(row.model) : []
  return {
    id: row.id,
    serviceType: (serviceType ?? row.serviceType) as ServiceType,
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: Array.isArray(models) ? (models[0] || '') : '',
    settings: row.settings,
  }
}

async function pickCatalogConfig(serviceType: ServiceType): Promise<AIConfig | null> {
  const rows = (await aiConfigsRepo.listServiceConfigsByType(serviceType))
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const active = rows[0]
  if (!active) return null
  return rowToAiConfig(active, serviceType)
}

function assertCatalogServiceType(cfg: AIConfig, expected: CatalogServiceType): void {
  if (cfg.serviceType && cfg.serviceType !== expected) {
    throw new UserAiConfigError(`${labelOf(expected)}模型类型不匹配，${defaultModelHint()}`)
  }
}

export async function getUserDefaultCatalogConfigId(
  userId: number,
  serviceType: CatalogServiceType,
): Promise<number | null> {
  const row = await userPresetRepo.findUserPreset(userId, DEFAULT_CATALOG_PRESET_KEY[serviceType])
  const id = Number(row?.model || 0)
  return Number.isFinite(id) && id > 0 ? Math.floor(id) : null
}

/** 默认模型：用户所选 ai_service_configs 行（或集级 override），须 is_active */
export async function resolveUserCatalogModel(
  serviceType: CatalogServiceType,
  opts?: ConfigResolveOpts & { configId?: number | null },
): Promise<AIConfig> {
  const isAdmin = opts?.role === 'admin'

  if (!opts?.userId) {
    const configId = opts?.configId
    if (configId) {
      const cfg = await resolveServiceConfigById(configId)
      if (!cfg) throw new UserAiConfigError(`所选${labelOf(serviceType)}模型未启用或不存在`)
      assertCatalogServiceType(cfg, serviceType)
      return cfg
    }
    const fallback = await pickCatalogConfig(serviceType)
    if (!fallback) throw new UserAiConfigError(`平台尚未启用${labelOf(serviceType)}服务`)
    return fallback
  }

  const configId = opts.configId ?? await getUserDefaultCatalogConfigId(opts.userId, serviceType)

  if (isAdmin && !configId) {
    const fallback = await pickCatalogConfig(serviceType)
    if (fallback) return fallback
    throw new UserAiConfigError(`平台尚未启用${labelOf(serviceType)}服务`)
  }

  if (!configId) {
    throw new UserAiConfigError(`未配置${labelOf(serviceType)}默认模型，${defaultModelHint()}`)
  }

  const cfg = await resolveServiceConfigById(configId, opts)
  if (!cfg) {
    throw new UserAiConfigError(`所选${labelOf(serviceType)}默认模型未启用或已删除，${defaultModelHint()}`)
  }
  assertCatalogServiceType(cfg, serviceType)
  logTaskProgress('AIConfig', 'user-default-catalog', {
    serviceType,
    userId: opts.userId,
    configId,
    provider: cfg.provider,
    model: cfg.model,
  })
  return cfg
}

/** 火火一键配置：文本 / 图片 / 视频 / 音频；积分 / BYOK 双模式 */
export async function resolveHuohuoPresetConfig(
  serviceType: ServiceType,
  opts?: ConfigResolveOpts,
): Promise<AIConfig> {
  if (!opts?.userId || opts.role === 'admin') {
    const platformPreset = await getPlatformServicePreset(serviceType)
    if (platformPreset?.baseUrl?.trim()) {
      return {
        serviceType,
        provider: platformPreset.provider,
        baseUrl: platformPreset.baseUrl,
        apiKey: platformPreset.apiKey,
        model: platformPreset.model,
        settings: huohuoBillingSettings(serviceType),
      }
    }
    const fallback = await pickCatalogConfig(serviceType)
    if (!fallback) throw new UserAiConfigError(`平台尚未配置火火一键${labelOf(serviceType)}服务`)
    return fallback
  }

  const policy = await getHuohuoPresetPolicy()
  const userRow = await userPresetRepo.findUserPreset(opts.userId, serviceType)
  const platformPreset = await getPlatformServicePreset(serviceType)
  const label = labelOf(serviceType)

  if (!platformPreset?.baseUrl?.trim()) {
    throw new UserAiConfigError(`平台尚未配置火火一键${label}接入，请联系管理员`)
  }

  if (policy.credit_billing_enabled) {
    const apiKey = platformPreset.apiKey?.trim() || ''
    if (!apiKey) {
      throw new UserAiConfigError(`平台火火一键${label} API Key 未配置，请联系管理员`)
    }
    const model = userRow?.model?.trim() || platformPreset.model?.trim() || ''
    if (!model) {
      throw new UserAiConfigError(`${label}模型未配置，${presetSettingsHint()}`)
    }
    logTaskProgress('AIConfig', 'huohuo-preset-billing-on', {
      serviceType,
      userId: opts.userId,
      provider: platformPreset.provider,
      model,
    })
    return {
      serviceType,
      provider: platformPreset.provider,
      baseUrl: platformPreset.baseUrl,
      apiKey,
      model,
      settings: huohuoBillingSettings(serviceType),
    }
  }

  const apiKey = userRow?.apiKey?.trim() || ''
  if (!apiKey) {
    throw new UserAiConfigError(`${label} API Key 未配置，${presetSettingsHint()}`)
  }
  const model = userRow?.model?.trim() || platformPreset.model?.trim() || ''
  if (!model) {
    throw new UserAiConfigError(`${label}模型未配置，${presetSettingsHint()}`)
  }

  logTaskProgress('AIConfig', 'huohuo-preset-byok', {
    serviceType,
    userId: opts.userId,
    provider: platformPreset.provider,
    model,
  })
  return {
    serviceType,
    provider: platformPreset.provider,
    baseUrl: platformPreset.baseUrl,
    apiKey,
    model,
    settings: null,
  }
}

export type ConfigSource = 'catalog' | 'huohuo_preset'

/** @deprecated use ConfigSource */
export type MediaConfigSource = ConfigSource

const CATALOG_SERVICE_TYPES: CatalogServiceType[] = ['text', 'image', 'video', 'audio']

/** 火火一键是否对该账号生效（生效时全部服务以火火 preset 为主） */
export async function isHuohuoPresetEffective(userId: number, role?: string): Promise<boolean> {
  if (role === 'admin') return false
  const policy = await getHuohuoPresetPolicy()
  if (policy.credit_billing_enabled) return true
  for (const serviceType of CATALOG_SERVICE_TYPES) {
    if (await userHasByokApiKey(userId, serviceType)) return true
  }
  return false
}

/**
 * 统一运行时配置：火火一键生效 → preset；否则 → 默认模型（目录）。
 * 火火生效时忽略 configId（集级 override 仅对默认模型模式有效）。
 */
export async function resolveUserServiceConfig(
  serviceType: ServiceType,
  opts?: ConfigResolveOpts & { configId?: number | null },
): Promise<{ config: AIConfig; source: ConfigSource }> {
  if (!opts?.userId || opts.role === 'admin') {
    const hasCatalogId = !!(opts?.configId && opts.configId > 0)
    if (hasCatalogId) {
      const cfg = await resolveServiceConfigById(opts!.configId!, opts)
      if (!cfg) throw new UserAiConfigError(`所选${labelOf(serviceType)}模型未启用或不存在`)
      assertCatalogServiceType(cfg, serviceType)
      return { config: cfg, source: 'catalog' }
    }
    const cfg = await resolveHuohuoPresetConfig(serviceType, opts)
    return { config: cfg, source: 'huohuo_preset' }
  }

  if (await isHuohuoPresetEffective(opts.userId, opts.role)) {
    const cfg = await resolveHuohuoPresetConfig(serviceType, opts)
    return { config: cfg, source: 'huohuo_preset' }
  }

  const cfg = await resolveUserCatalogModel(serviceType, {
    ...opts,
    configId: opts?.configId ?? null,
  })
  return { config: cfg, source: 'catalog' }
}

/** @deprecated use resolveUserServiceConfig */
export async function resolveMediaGenerationConfig(
  serviceType: CatalogServiceType,
  opts?: ConfigResolveOpts & { configId?: number | null },
): Promise<{ config: AIConfig; source: ConfigSource }> {
  return resolveUserServiceConfig(serviceType, opts)
}

/** 生成扣费：积分开 → 两套路径均扣费；积分关 → 火火 BYOK 免扣费 */
export async function shouldChargeServiceGeneration(
  userId: number,
  role: string | undefined,
  serviceType: ServiceType,
  source: ConfigSource,
): Promise<boolean> {
  if (role === 'admin') return false
  const policy = await getHuohuoPresetPolicy()
  if (!policy.credit_billing_enabled) {
    if (source === 'catalog') return false
    return !(await shouldSkipCreditBilling(userId, role, serviceType))
  }
  return true
}

/** @deprecated use shouldChargeServiceGeneration */
export async function shouldChargeMediaGeneration(
  userId: number,
  role: string | undefined,
  serviceType: CatalogServiceType,
  source: ConfigSource,
): Promise<boolean> {
  return shouldChargeServiceGeneration(userId, role, serviceType, source)
}

export async function resolveServiceConfigById(
  id: number,
  opts?: ConfigResolveOpts,
): Promise<AIConfig | null> {
  const row = await aiConfigsRepo.findServiceConfigById(id)
  if (!row || !row.isActive) {
    if (opts?.userId && opts.role !== 'admin') {
      throw new UserAiConfigError(`所选模型未启用或不存在，${defaultModelHint()}`)
    }
    return null
  }
  return rowToAiConfig(row)
}

/** 内部脚本 / 管理员无 userId 时取目录最高优先级 */
export async function resolveCatalogConfig(
  serviceType: ServiceType,
  opts?: ConfigResolveOpts,
): Promise<AIConfig | null> {
  return pickCatalogConfig(serviceType)
}

export async function assertHuohuoPresetReady(
  userId: number,
  role: string | undefined,
  serviceType: ServiceType = 'text',
): Promise<void> {
  if (role === 'admin') return
  await resolveHuohuoPresetConfig(serviceType, { userId, role })
}

export async function assertHuohuoAgentReady(userId: number, role: string | undefined): Promise<void> {
  if (role === 'admin') return
  await resolveHuohuoPresetConfig('text', { userId, role })
  const userAgent = await userPresetRepo.findUserPreset(userId, 'agent')
  const model = userAgent?.model?.trim() || (await getEffectiveAgentModelName()).trim()
  if (!model) {
    throw new UserAiConfigError(`Agent 模型未配置，${presetSettingsHint()}`)
  }
}

export async function assertUserDefaultCatalogReady(
  userId: number,
  role: string | undefined,
  serviceType: CatalogServiceType,
): Promise<void> {
  if (role === 'admin') return
  await resolveUserCatalogModel(serviceType, { userId, role })
}

/** @deprecated 请用 assertHuohuoPresetReady / assertUserDefaultCatalogReady */
export async function assertUserAiConfigReady(
  userId: number,
  role: string | undefined,
  serviceType: ServiceType,
): Promise<void> {
  if (role === 'admin') return
  if (serviceType === 'text' || serviceType === 'image' || serviceType === 'video' || serviceType === 'audio') {
    await assertHuohuoPresetReady(userId, role, serviceType)
    return
  }
}

export async function assertUserServiceConfigReady(
  userId: number,
  role: string | undefined,
  serviceType: ServiceType,
  configId?: number | null,
): Promise<void> {
  if (role === 'admin') return
  if (await isHuohuoPresetEffective(userId, role)) {
    await assertHuohuoPresetReady(userId, role, serviceType)
    return
  }
  await resolveUserCatalogModel(serviceType, { userId, role, configId: configId ?? null })
}

export async function assertEpisodeMediaConfigReady(
  userId: number,
  role: string | undefined,
  serviceType: CatalogServiceType,
  configId: number | null | undefined,
): Promise<void> {
  await assertUserServiceConfigReady(userId, role, serviceType, configId)
}

export type UserModelReadinessItem = {
  block: UserModelBlock
  service_type: ServiceType | 'agent'
  ready: boolean
  config_id?: number | null
  message?: string
}

export async function getUserAiConfigReadiness(
  userId: number,
  role?: string,
  scope: 'novel' | 'drama' | 'full' = 'full',
): Promise<{
  credit_billing_enabled: boolean
  huohuo_preset_effective: boolean
  ready: boolean
  items: UserModelReadinessItem[]
}> {
  const policy = await getHuohuoPresetPolicy()
  if (role === 'admin') {
    return {
      credit_billing_enabled: policy.credit_billing_enabled,
      huohuo_preset_effective: false,
      ready: true,
      items: [],
    }
  }

  const items: UserModelReadinessItem[] = []

  const push = (item: UserModelReadinessItem) => { items.push(item) }

  for (const serviceType of CATALOG_SERVICE_TYPES) {
    try {
      await resolveHuohuoPresetConfig(serviceType, { userId, role })
      push({ block: 'huohuo_preset', service_type: serviceType, ready: true })
    } catch (err) {
      push({
        block: 'huohuo_preset',
        service_type: serviceType,
        ready: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  try {
    await assertHuohuoAgentReady(userId, role)
    push({ block: 'huohuo_preset', service_type: 'agent', ready: true })
  } catch (err) {
    push({
      block: 'huohuo_preset',
      service_type: 'agent',
      ready: false,
      message: err instanceof Error ? err.message : String(err),
    })
  }

  const huohuoEffective = await isHuohuoPresetEffective(userId, role)

  for (const serviceType of CATALOG_SERVICE_TYPES) {
    try {
      const configId = await getUserDefaultCatalogConfigId(userId, serviceType)
      await resolveUserCatalogModel(serviceType, { userId, role })
      push({
        block: 'default_model',
        service_type: serviceType,
        ready: true,
        config_id: configId,
      })
    } catch (err) {
      push({
        block: 'default_model',
        service_type: serviceType,
        ready: false,
        config_id: await getUserDefaultCatalogConfigId(userId, serviceType),
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const activeBlock: UserModelBlock = huohuoEffective ? 'huohuo_preset' : 'default_model'
  let checkItems = items.filter(i => i.block === activeBlock)

  if (scope === 'novel') {
    checkItems = checkItems.filter(i =>
      i.service_type === 'text' || (huohuoEffective && i.service_type === 'agent'),
    )
  } else if (scope === 'drama' && !huohuoEffective) {
    checkItems = checkItems.filter(i => i.service_type !== 'agent')
  }

  return {
    credit_billing_enabled: policy.credit_billing_enabled,
    huohuo_preset_effective: huohuoEffective,
    ready: checkItems.every(i => i.ready),
    items,
  }
}

export async function resolveUserAgentModel(
  userId: number,
  role: string | undefined,
  fallbackModel: string,
): Promise<string> {
  if (role === 'admin') return fallbackModel
  const userAgent = await userPresetRepo.findUserPreset(userId, 'agent')
  return userAgent?.model?.trim() || fallbackModel
}

export async function resolveActiveConfigForUser(
  serviceType: ServiceType,
  opts?: ConfigResolveOpts & { configId?: number | null },
): Promise<AIConfig | null> {
  const { config } = await resolveUserServiceConfig(serviceType, opts)
  return config
}
