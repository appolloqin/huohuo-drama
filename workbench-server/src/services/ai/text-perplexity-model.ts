/**
 * 默认困惑度检测模型（用户级）：启用且选定型号时，AI 率/困惑度优先走该配置；
 * 未启用或未填 → 回退文本服务 settings / 全站复用逻辑。
 *
 * 存储格式与审核模型相同：`{configId}::{model}` 或纯型号名。
 */
import { now } from '../../common/http/response.js'
import * as userPresetRepo from '../../db/repos/user-ai-preset-configs/index.js'
import { presetRowEnabled } from './huohuo-preset-enable.js'
import {
  parseTextAuditModelRef,
  resolveTextAuditAiConfig,
} from './text-audit-model.js'
import type { AIConfig } from './ai.js'

export const DEFAULT_PERPLEXITY_MODEL_PRESET_KEY = 'default_perplexity_model'

export type DefaultPerplexityModelSettings = {
  enabled: boolean
  /** 展示/回传用：可能是 `id::model` 或纯型号 */
  model: string
}

export async function getUserDefaultPerplexityModelSettings(
  userId: number,
): Promise<DefaultPerplexityModelSettings> {
  const row = await userPresetRepo.findUserPreset(userId, DEFAULT_PERPLEXITY_MODEL_PRESET_KEY)
  if (row == null) {
    return { enabled: false, model: '' }
  }
  return {
    enabled: presetRowEnabled(row),
    model: (row.model || '').trim(),
  }
}

export async function isDefaultPerplexityModelActive(userId: number): Promise<boolean> {
  const s = await getUserDefaultPerplexityModelSettings(userId)
  return s.enabled && !!s.model
}

export async function saveUserDefaultPerplexityModelSettings(
  userId: number,
  body: { enabled?: boolean; model?: string },
): Promise<DefaultPerplexityModelSettings> {
  const ts = now()
  const existing = await userPresetRepo.findUserPreset(userId, DEFAULT_PERPLEXITY_MODEL_PRESET_KEY)
  const enabled = typeof body.enabled === 'boolean'
    ? body.enabled
    : (existing ? presetRowEnabled(existing) : false)
  const model = body.model !== undefined
    ? String(body.model || '').trim()
    : (existing?.model || '').trim()

  await userPresetRepo.upsertUserPreset({
    userId,
    presetKey: DEFAULT_PERPLEXITY_MODEL_PRESET_KEY,
    model,
    apiKey: existing?.apiKey || null,
    enabled,
    createdAt: existing?.createdAt || ts,
    updatedAt: ts,
  })
  return getUserDefaultPerplexityModelSettings(userId)
}

/** 解析用户默认困惑度通道；找不到则 null */
export async function resolveDefaultPerplexityAiConfig(
  refRaw: string,
  preferProvider?: string,
): Promise<AIConfig | null> {
  return resolveTextAuditAiConfig(refRaw, preferProvider)
}

export function defaultPerplexityModelName(refRaw: string): string {
  return parseTextAuditModelRef(refRaw).model
}
