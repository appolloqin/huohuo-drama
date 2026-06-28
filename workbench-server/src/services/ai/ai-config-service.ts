import * as agentConfigsRepo from '../../db/repos/agent-configs/index.js'
import * as aiServiceConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import * as aiPresetConfigsRepo from '../../db/repos/ai-preset-configs/index.js'
import * as userPresetRepo from '../../db/repos/user-ai-preset-configs/index.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase } from '../../common/http/transform.js'
import { logTaskSuccess } from '../../common/task/task-logger.js'
import { parseConfigSettings } from '../credits/credits.js'
import { parseTextBillingPayload, toServiceConfigApiShape } from '../../routes/ai/ai-config-serializers.js'
import { getHuohuoPresetPolicy, saveHuohuoPresetPolicy } from './huohuo-preset-policy.js'
import { DEFAULT_CATALOG_PRESET_KEY, getUserDefaultCatalogConfigId } from './user-ai-config-resolve.js'

export { getHuohuoPresetPolicy, saveHuohuoPresetPolicy }

/**
 * 「火火一键配置」出厂默认值。
 *
 * 这些常量只在以下场景生效：
 *   1. ai_preset_configs 表里没有任何行（首次启动迁移前）；
 *   2. DB 里某行字段为空（管理员没填，env 也没兜底）。
 *
 * 部署环境变了代理平台，修改步骤：
 *   - 不改代码：在 settings → 火火一键配置 → 卡片编辑 → 提交 → 写 DB；
 *   - 改出厂默认：仅在迁移新版本时才动这里的常量，避免每次启动重建行。
 */
const BUNDLED_DEFAULT_SERVICES = [
  { serviceType: 'text', label: '文本', provider: 'huohuo', baseUrl: 'https://huo.hcpzy.com/v1', model: 'gemini-3-pro-preview', priority: 100 },
  { serviceType: 'image', label: '图片', provider: 'huohuo', baseUrl: 'https://huo.hcpzy.com/v1', model: 'doubao-seedream-5-0-260128', priority: 99 },
  { serviceType: 'video', label: '视频', provider: 'huohuo', baseUrl: 'https://huo.hcpzy.com/v1', model: 'doubao-seedance-1-5-pro-251215', priority: 98 },
  { serviceType: 'audio', label: '音频', provider: 'huohuo', baseUrl: 'https://huo.hcpzy.com/v1', model: 'speech-2.8-hd', priority: 97 },
] as const

const BUNDLED_AGENT_PRESETS = [
  { agentType: 'drama_script_formatter', name: '剧本格式化' },
  { agentType: 'drama_cast_scene_extract', name: '角色场景提取' },
  { agentType: 'drama_storyboard_breakdown', name: '分镜拆解' },
  { agentType: 'drama_voice_assign', name: '音色分配' },
  { agentType: 'drama_image_prompt', name: '宫格/立绘/场景提示词' },
  { agentType: 'novel_premise', name: '小说梗概生成' },
  { agentType: 'novel_outline', name: '小说大纲生成' },
  { agentType: 'novel_writing_brief', name: '本章写作说明' },
  { agentType: 'novel_chapter_writer', name: '小说章节正文' },
] as const

const BUNDLED_AGENT_MODEL_NAME = 'gemini-3-pro-preview'

/**
 * env 变量覆盖 (HUOHUO_PRESET_<KEY>_<FIELD>) 的解析：
 *   HUOHUO_PRESET_TEXT_BASE_URL   → text 行 baseUrl
 *   HUOHUO_PRESET_TEXT_MODEL      → text 行 model
 *   HUOHUO_PRESET_TEXT_PROVIDER   → text 行 provider
 *   HUOHUO_PRESET_IMAGE_BASE_URL  → image 行 baseUrl
 *   ...
 *   HUOHUO_PRESET_AGENT_MODEL     → 5 个 Agent 共用模型名
 *
 * 用 env 兜底是为了让生产部署可以不改 DB、不重新打包代码就切换代理平台。
 * 没有配 env 就回退到代码里的 BUNDLED_DEFAULT_SERVICES / BUNDLED_AGENT_MODEL_NAME。
 */
function envOverride(presetKey: 'text' | 'image' | 'video' | 'audio' | 'agent', field: 'BASE_URL' | 'MODEL' | 'PROVIDER' | 'LABEL') {
  const raw = process.env[`HUOHUO_PRESET_${presetKey.toUpperCase()}_${field}`]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

/**
 * Resolve the effective 「火火一键配置」4 条服务 + 1 条 Agent 模型。
 *
 * Lookup order (highest priority first):
 *   1. ai_preset_configs 表里 presetKey 行的对应字段（非空时直接用）
 *   2. 环境变量 HUOHUO_PRESET_<KEY>_<FIELD>
 *   3. 代码里 BUNDLED_DEFAULT_SERVICES / BUNDLED_AGENT_MODEL_NAME 兜底
 *
 * api_key 现在每张卡片独立持久化（ai_preset_configs.api_key），applyHuohuoPreset 时
 * 优先用 DB 里的卡内 key，没有再回退到弹窗提交的共用 key（保留向后兼容）。
 */
type EffectivePreset = {
  serviceType: 'text' | 'image' | 'video' | 'audio'
  label: string
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  priority: number
}

async function resolveEffectiveServicePresets(): Promise<EffectivePreset[]> {
  const presets = BUNDLED_DEFAULT_SERVICES.map((preset) => ({ ...preset, apiKey: '' }))
  const dbRows = await aiPresetConfigsRepo.listAllPresets()
  const byKey = new Map(dbRows.map(r => [String(r.presetKey), r]))
  return presets.map((preset) => {
    const dbRow = byKey.get(preset.serviceType)
    const provider = (dbRow?.provider as string | null | undefined)
      || envOverride(preset.serviceType, 'PROVIDER')
      || preset.provider
    const baseUrl = (dbRow?.baseUrl as string | null | undefined)
      || envOverride(preset.serviceType, 'BASE_URL')
      || preset.baseUrl
    const apiKey = (dbRow?.apiKey as string | null | undefined) || ''
    const model = (dbRow?.model as string | null | undefined)
      || envOverride(preset.serviceType, 'MODEL')
      || preset.model
    const label = (dbRow?.label as string | null | undefined)
      || envOverride(preset.serviceType, 'LABEL')
      || preset.label
    const priority = Number(dbRow?.priority ?? preset.priority)
    return { serviceType: preset.serviceType, label, provider, baseUrl, apiKey, model, priority }
  })
}

async function resolveEffectiveAgentModel(): Promise<string> {
  const dbRow = await aiPresetConfigsRepo.findPresetByKey('agent')
  const fromDb = (dbRow?.model as string | null | undefined) || ''
  if (fromDb) return fromDb
  const fromEnv = envOverride('agent', 'MODEL')
  if (fromEnv) return fromEnv
  return BUNDLED_AGENT_MODEL_NAME
}

function encodePresetBillingBlob(serviceType: string) {
  if (serviceType === 'text') return JSON.stringify({ creditTokenUnit: 3000, creditTokenCost: 10, creditCost: 0 })
  if (serviceType === 'image') return JSON.stringify({ creditCost: 10 })
  if (serviceType === 'video') return JSON.stringify({ creditCost: 30 })
  return JSON.stringify({ creditCost: 5 })
}

function mergeBillingPatchFromBody(
  existing: { serviceType: string | null; settings: string | null } | undefined,
  body: Record<string, unknown>,
) {
  const settings = parseConfigSettings(existing?.settings)
  if (existing?.serviceType === 'text') {
    if ('credit_token_unit' in body) {
      settings.creditTokenUnit = Math.max(1, Math.floor(Number(body.credit_token_unit || 3000)))
    }
    if ('credit_token_cost' in body) {
      settings.creditTokenCost = Math.max(0, Math.floor(Number(body.credit_token_cost || 0)))
    }
    if ('perplexity_model' in body) {
      settings.perplexityModel = typeof body.perplexity_model === 'string' ? body.perplexity_model.trim() : ''
    }
    if ('enable_thinking' in body) {
      settings.enableThinking = body.enable_thinking === true
    }
    settings.creditCost = 0
  } else if ('credit_cost' in body) {
    settings.creditCost = Math.max(0, Math.floor(Number(body.credit_cost || 0)))
  }
  return settings
}

async function persistBundledServicePreset(
  preset: EffectivePreset,
  fallbackApiKey: string,
  ts: string,
) {
  const existing = await aiServiceConfigsRepo.findServiceConfigByTypeAndProvider(preset.serviceType, preset.provider)
  // 优先用每张卡片 ai_preset_configs.api_key，没有再回退到弹窗提交的统一 key
  const apiKey = preset.apiKey || fallbackApiKey
  const values = {
    serviceType: preset.serviceType,
    provider: preset.provider,
    name: `火火默认${preset.label}服务`,
    baseUrl: preset.baseUrl,
    apiKey,
    model: JSON.stringify([preset.model]),
    priority: preset.priority,
    settings: encodePresetBillingBlob(preset.serviceType),
    isActive: true,
    updatedAt: ts,
  }

  if (existing) {
    await aiServiceConfigsRepo.updateServiceConfig(existing.id, values)
  } else {
    await aiServiceConfigsRepo.insertServiceConfig({ ...values, createdAt: ts })
  }
}

async function persistBundledAgentPreset(agent: typeof BUNDLED_AGENT_PRESETS[number], modelName: string, ts: string) {
  const existing = await agentConfigsRepo.findAgentConfigByType(agent.agentType)
  const values = {
    name: agent.name,
    model: modelName,
    isActive: true,
    updatedAt: ts,
  }

  if (existing) {
    await agentConfigsRepo.updateAgentConfig(existing.id, values)
  } else {
    await agentConfigsRepo.insertAgentConfig({
      agentType: agent.agentType,
      description: '',
      model: modelName,
      name: agent.name,
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4096,
      maxIterations: 10,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
  }
}

export async function listServiceConfigs(serviceType?: string) {
  const rows = serviceType
    ? await aiServiceConfigsRepo.listServiceConfigsByType(serviceType)
    : await aiServiceConfigsRepo.listAllServiceConfigs()
  return rows.map(toServiceConfigApiShape)
}

export async function createServiceConfig(body: Record<string, unknown>) {
  const ts = now()
  const settings = body.service_type === 'text'
    ? parseTextBillingPayload(body)
    : { creditCost: Math.max(0, Math.floor(Number(body.credit_cost || 0))) }

  if (!body.service_type || !body.provider) {
    throw new Error('service_type and provider are required')
  }

  const res = await aiServiceConfigsRepo.insertServiceConfig({
    serviceType: String(body.service_type),
    provider: String(body.provider),
    name: String(body.name || `${body.provider}-${body.service_type}`),
    baseUrl: String(body.base_url || ''),
    apiKey: String(body.api_key || ''),
    model: JSON.stringify(body.model || []),
    priority: Number(body.priority || 0),
    settings: JSON.stringify(settings),
    isActive: true,
    createdAt: ts,
    updatedAt: ts,
  })

  const row = await aiServiceConfigsRepo.findServiceConfigById(res.lastInsertRowid)
  if (!row) throw new Error('创建配置失败')
  return toServiceConfigApiShape(row)
}

export async function applyHuohuoPreset(apiKey: string) {
  const ts = now()
  const presets = await resolveEffectiveServicePresets()
  const agentModel = await resolveEffectiveAgentModel()

  for (const preset of presets) await persistBundledServicePreset(preset, apiKey, ts)
  for (const agent of BUNDLED_AGENT_PRESETS) await persistBundledAgentPreset(agent, agentModel, ts)

  const configs = (await aiServiceConfigsRepo.listAllServiceConfigs()).map(toServiceConfigApiShape)
  const agents = (await agentConfigsRepo.listAllAgentConfigs()).map(row => toSnakeCase(row))

  logTaskSuccess('AIConfig', 'huohuo-preset-applied', {
    serviceCount: presets.length,
    agentCount: BUNDLED_AGENT_PRESETS.length,
    agentModel,
  })

  return { configs, agents, agent_model: agentModel }
}

/**
 * 读取 5 行 effective preset (4 服务 + 1 agent)，给前端弹窗渲染用。
 * 标记每一行的 source = 'db' / 'env' / 'code' 方便前端展示「该值来源于…」提示。
 */
export async function listEffectivePresets() {
  const services = await resolveEffectiveServicePresets()
  const agentModel = await resolveEffectiveAgentModel()

  const dbRows = await aiPresetConfigsRepo.listAllPresets()
  const dbByKey = new Map(dbRows.map(r => [String(r.presetKey), r]))
  function serviceSource(p: EffectivePreset): 'db' | 'env' | 'code' {
    const row = dbByKey.get(p.serviceType)
    if (row) return 'db'
    if (envOverride(p.serviceType, 'BASE_URL') || envOverride(p.serviceType, 'MODEL') || envOverride(p.serviceType, 'PROVIDER')) return 'env'
    return 'code'
  }
  function agentSource(): 'db' | 'env' | 'code' {
    if (dbByKey.get('agent')) return 'db'
    if (envOverride('agent', 'MODEL')) return 'env'
    return 'code'
  }

  return {
    services: services.map((p) => ({
      preset_key: p.serviceType,
      service_type: p.serviceType,
      provider: p.provider,
      base_url: p.baseUrl,
      api_key: p.apiKey,    // 每张卡片独立的 api_key；管理员在弹窗内填，避免共用一个 key
      model: p.model,
      label: p.label,
      priority: p.priority,
      source: serviceSource(p),
    })),
    agent: {
      preset_key: 'agent',
      model: agentModel,
      label: 'Agent',
      source: agentSource(),
    },
    policy: await getHuohuoPresetPolicy(),
    can_edit_platform_fields: true,
  }
}

export async function getPlatformServicePreset(serviceType: 'text' | 'image' | 'video' | 'audio') {
  const presets = await resolveEffectiveServicePresets()
  return presets.find(p => p.serviceType === serviceType) ?? null
}

export async function getEffectiveAgentModelName(): Promise<string> {
  return resolveEffectiveAgentModel()
}

/** 普通用户视角：平台 preset + 用户自配 key/model（不可改 base_url / provider） */
export async function listUserEffectivePresets(userId: number) {
  const policy = await getHuohuoPresetPolicy()
  const platform = await listEffectivePresets()
  const userRows = await userPresetRepo.listUserPresets(userId)
  const byKey = new Map(userRows.map(r => [String(r.presetKey), r]))

  const services = platform.services.map((s) => {
    const userRow = byKey.get(s.preset_key)
    const usePlatformKey = policy.credit_billing_enabled
    return {
      ...s,
      api_key: usePlatformKey ? s.api_key : (userRow?.apiKey || ''),
      model: userRow?.model || s.model,
      source: userRow ? 'db' as const : s.source,
    }
  })

  const userAgent = byKey.get('agent')
  return {
    policy,
    can_edit_platform_fields: false,
    services,
    agent: {
      ...platform.agent,
      model: userAgent?.model || platform.agent.model,
    },
  }
}

export async function saveUserPresetOverrides(userId: number, items: Array<Record<string, unknown>>) {
  const ts = now()
  const knownKeys = new Set(['text', 'image', 'video', 'audio', 'agent'])
  for (const item of items) {
    const presetKey = String(item.preset_key || '').trim()
    if (!knownKeys.has(presetKey)) throw new Error(`未知 preset_key: ${presetKey}`)
    if ('base_url' in item || 'provider' in item) {
      throw new Error('普通用户不可修改 Base URL 或 Provider')
    }
    if (presetKey === 'agent') {
      const model = String(item.model || '').trim()
      if (!model) throw new Error('Agent 模型不能为空')
      const existing = await userPresetRepo.findUserPreset(userId, presetKey)
      await userPresetRepo.upsertUserPreset({
        userId,
        presetKey,
        model,
        apiKey: existing?.apiKey || null,
        createdAt: existing?.createdAt || ts,
        updatedAt: ts,
      })
      continue
    }
    const model = String(item.model || '').trim()
    if (!model) throw new Error(`${presetKey} 模型不能为空`)
    const apiKeyRaw = typeof item.api_key === 'string' ? item.api_key.trim() : undefined
    const existing = await userPresetRepo.findUserPreset(userId, presetKey)
    await userPresetRepo.upsertUserPreset({
      userId,
      presetKey,
      model,
      apiKey: apiKeyRaw !== undefined && apiKeyRaw !== ''
        ? apiKeyRaw
        : (existing?.apiKey || null),
      createdAt: existing?.createdAt || ts,
      updatedAt: ts,
    })
  }
  return listUserEffectivePresets(userId)
}

const DEFAULT_CATALOG_TYPES = ['text', 'image', 'video', 'audio'] as const
type DefaultCatalogType = typeof DEFAULT_CATALOG_TYPES[number]

function defaultCatalogPresetKey(serviceType: DefaultCatalogType): string {
  return DEFAULT_CATALOG_PRESET_KEY[serviceType]
}

export async function getUserDefaultCatalogModels(userId: number) {
  const items: Array<{
    service_type: DefaultCatalogType
    config_id: number | null
    ready: boolean
    message?: string
  }> = []

  for (const serviceType of DEFAULT_CATALOG_TYPES) {
    const configId = await getUserDefaultCatalogConfigId(userId, serviceType)
    let ready = false
    let message: string | undefined
    if (configId) {
      const row = await aiServiceConfigsRepo.findServiceConfigById(configId)
      ready = !!(row?.isActive && row.serviceType === serviceType)
      if (!ready) message = '所选模型未启用或已删除'
    } else {
      message = '未选择默认模型'
    }
    items.push({ service_type: serviceType, config_id: configId, ready, message })
  }

  return { items }
}

export async function saveUserDefaultCatalogModels(
  userId: number,
  items: Array<{ service_type: string; config_id: number }>,
) {
  const ts = now()
  for (const item of items) {
    const serviceType = String(item.service_type || '').trim() as DefaultCatalogType
    if (!DEFAULT_CATALOG_TYPES.includes(serviceType)) {
      throw new Error(`未知 service_type: ${item.service_type}`)
    }
    const configId = Math.floor(Number(item.config_id))
    if (!Number.isFinite(configId) || configId <= 0) {
      throw new Error(`${serviceType} config_id 无效`)
    }
    const row = await aiServiceConfigsRepo.findServiceConfigById(configId)
    if (!row || !row.isActive) {
      throw new Error(`${serviceType} 模型未启用或不存在`)
    }
    if (row.serviceType !== serviceType) {
      throw new Error(`${serviceType} 模型类型不匹配`)
    }
    const presetKey = defaultCatalogPresetKey(serviceType)
    const existing = await userPresetRepo.findUserPreset(userId, presetKey)
    await userPresetRepo.upsertUserPreset({
      userId,
      presetKey,
      model: String(configId),
      apiKey: null,
      createdAt: existing?.createdAt || ts,
      updatedAt: ts,
    })
  }
  return getUserDefaultCatalogModels(userId)
}

/**
 * 保存管理员在 settings 弹窗里编辑的 5 行 preset。
 * 前端 PUT /ai-configs/preset body: { items: [...] }
 * 每个 item 必须含 preset_key（text/image/video/audio/agent）和要改的字段；
 * service_type 行还要带 service_type 和 provider，其它字段可选。
 */
export async function savePresetOverrides(items: Array<Record<string, unknown>>) {
  const ts = now()
  const knownKeys = new Set(['text', 'image', 'video', 'audio', 'agent'])
  for (const item of items) {
    const presetKey = String(item.preset_key || '').trim()
    if (!knownKeys.has(presetKey)) {
      throw new Error(`未知 preset_key: ${presetKey}`)
    }
    if (presetKey === 'agent') {
      const model = String(item.model || '').trim() || BUNDLED_AGENT_MODEL_NAME
      await aiPresetConfigsRepo.upsertPreset({
        presetKey,
        model,
        serviceType: null,
        provider: null,
        baseUrl: null,
        label: 'Agent',
        priority: 0,
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      })
      continue
    }
    const serviceType = String(item.service_type || presetKey).trim()
    const provider = String(item.provider || '').trim()
    const baseUrl = String(item.base_url || '').trim()
    const apiKey = typeof item.api_key === 'string' ? item.api_key.trim() : ''
    const model = String(item.model || '').trim()
    const label = String(item.label || '').trim() || presetKey
    const priority = Number(item.priority ?? 0)
    if (!serviceType) throw new Error(`${presetKey} 行缺少 service_type`)
    if (!provider) throw new Error(`${presetKey} 行缺少 provider`)
    if (!baseUrl) throw new Error(`${presetKey} 行缺少 base_url`)
    if (!model) throw new Error(`${presetKey} 行缺少 model`)
    await aiPresetConfigsRepo.upsertPreset({
      presetKey,
      serviceType,
      provider,
      baseUrl,
      apiKey,
      model,
      label,
      priority,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    })
  }
  return await listEffectivePresets()
}

export async function getServiceConfigById(id: number) {
  const row = await aiServiceConfigsRepo.findServiceConfigById(id)
  return row ? toServiceConfigApiShape(row) : null
}

export async function updateServiceConfig(id: number, body: Record<string, unknown>) {
  const updates: Record<string, unknown> = { updatedAt: now() }

  if ('provider' in body) updates.provider = body.provider
  if ('name' in body) updates.name = body.name
  if ('base_url' in body) updates.baseUrl = body.base_url
  if ('api_key' in body) updates.apiKey = body.api_key
  if ('model' in body) updates.model = JSON.stringify(body.model)
  if ('priority' in body) updates.priority = body.priority
  if ('is_active' in body) updates.isActive = body.is_active
  if ('credit_cost' in body || 'credit_token_unit' in body || 'credit_token_cost' in body || 'perplexity_model' in body || 'enable_thinking' in body) {
    const existing = await aiServiceConfigsRepo.findServiceConfigById(id)
    updates.settings = JSON.stringify(mergeBillingPatchFromBody(existing ?? undefined, body))
  }

  await aiServiceConfigsRepo.updateServiceConfig(id, updates)
}

export async function deleteServiceConfig(id: number) {
  await aiServiceConfigsRepo.deleteServiceConfig(id)
}

export async function listAiServiceProviders() {
  const rows = await aiServiceConfigsRepo.listServiceProviders()
  return rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
}
