/**
 * 文本审核模型（用户级）：启用且选定型号时，审/判走「该型号所属」的文本服务配置；
 * 未启用或未填 → 与写作同模。
 *
 * 存储格式：
 * - 新：`{configId}::{model}`（保证走对的 provider/key）
 * - 旧：纯型号名（按型号在 active 文本配置中反查）
 */
import { now } from '../../common/http/response.js'
import * as userPresetRepo from '../../db/repos/user-ai-preset-configs/index.js'
import * as aiConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import { presetRowEnabled } from './huohuo-preset-enable.js'
import type { AIConfig } from './ai.js'

/** 仅存 enabled + model 引用，不是独立 service_type */
export const TEXT_AUDIT_MODEL_PRESET_KEY = 'text_audit_model'

export type TextAuditModelSettings = {
  enabled: boolean
  /** 展示/回传用：可能是 `id::model` 或纯型号 */
  model: string
}

export type ParsedTextAuditModelRef = {
  configId?: number
  model: string
}

export function encodeTextAuditModelRef(configId: number, model: string): string {
  return `${configId}::${model.trim()}`
}

export function parseTextAuditModelRef(raw: string): ParsedTextAuditModelRef {
  const trimmed = (raw || '').trim()
  const m = trimmed.match(/^(\d+)::(.+)$/)
  if (m) {
    const configId = Number(m[1])
    const model = m[2].trim()
    if (Number.isFinite(configId) && configId > 0 && model) {
      return { configId, model }
    }
  }
  return { model: trimmed }
}

function parseModelList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim())
  } catch {
    return []
  }
}

function rowToTextConfig(row: {
  id: number
  provider: string | null
  baseUrl: string
  apiKey: string
  settings: string | null
}, model: string): AIConfig {
  return {
    id: row.id,
    serviceType: 'text',
    provider: row.provider || '',
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model,
    settings: row.settings,
  }
}

/**
 * 解析审核用 AIConfig：优先按 configId，否则按型号匹配 active 文本服务行。
 * 找不到则返回 null（调用方回退写作配置）。
 */
export async function resolveTextAuditAiConfig(
  refRaw: string,
  preferProvider?: string,
): Promise<AIConfig | null> {
  const { configId, model } = parseTextAuditModelRef(refRaw)
  if (!model) return null

  if (configId) {
    const row = await aiConfigsRepo.findServiceConfigById(configId)
    if (row?.isActive && row.serviceType === 'text' && row.baseUrl && row.apiKey) {
      const models = parseModelList(row.model)
      // 允许列表外型号（用户手改），仍用该行的通道
      if (!models.length || models.includes(model)) {
        return rowToTextConfig(row, model)
      }
      // 型号不在列表但仍指定了该配置：仍用该通道（兼容改名）
      return rowToTextConfig(row, model)
    }
  }

  const rows = (await aiConfigsRepo.listServiceConfigsByType('text'))
    .filter(r => r.isActive && r.baseUrl && r.apiKey)
    .filter(r => parseModelList(r.model).includes(model))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))

  if (!rows.length) return null

  const prefer = (preferProvider || '').toLowerCase()
  const preferred = prefer
    ? rows.find(r => (r.provider || '').toLowerCase() === prefer)
    : undefined
  const row = preferred || rows[0]!
  return rowToTextConfig(row, model)
}

export async function getUserTextAuditModelSettings(userId: number): Promise<TextAuditModelSettings> {
  const row = await userPresetRepo.findUserPreset(userId, TEXT_AUDIT_MODEL_PRESET_KEY)
  if (row == null) {
    return { enabled: false, model: '' }
  }
  return {
    enabled: presetRowEnabled(row),
    model: (row.model || '').trim(),
  }
}

/** 是否应用独立审核型号（须同时启用且已填型号） */
export async function isTextAuditModelActive(userId: number): Promise<boolean> {
  const s = await getUserTextAuditModelSettings(userId)
  return s.enabled && !!s.model
}

export async function saveUserTextAuditModelSettings(
  userId: number,
  body: { enabled?: boolean; model?: string },
): Promise<TextAuditModelSettings> {
  const ts = now()
  const existing = await userPresetRepo.findUserPreset(userId, TEXT_AUDIT_MODEL_PRESET_KEY)
  const enabled = typeof body.enabled === 'boolean'
    ? body.enabled
    : (existing ? presetRowEnabled(existing) : false)
  const model = body.model !== undefined
    ? String(body.model || '').trim()
    : (existing?.model || '').trim()

  await userPresetRepo.upsertUserPreset({
    userId,
    presetKey: TEXT_AUDIT_MODEL_PRESET_KEY,
    model,
    apiKey: existing?.apiKey || null,
    enabled,
    createdAt: existing?.createdAt || ts,
    updatedAt: ts,
  })
  return getUserTextAuditModelSettings(userId)
}
