import * as aiConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import type { AIConfig } from './ai.js'
import type { ComfyMode } from './adapters/comfyui-workflow.js'
import {
  isComfyFamilyProvider,
  pickComfySiblingConfig,
  preferredComfyProvider,
  reconcileComfyDecision,
  throwIfReconcileError,
} from './adapters/comfyui-mode-resolve.js'
import { rowToAiConfig, UserAiConfigError } from './user-ai-config-resolve.js'

export async function reconcileComfyServiceConfig(
  current: AIConfig,
  mode: ComfyMode,
): Promise<AIConfig> {
  if (!isComfyFamilyProvider(current.provider)) return current
  const serviceType = current.serviceType === 'video' ? 'video' : 'image'
  const rows = await aiConfigsRepo.listServiceConfigsByType(serviceType)
  const sibling = pickComfySiblingConfig(
    { ...current, serviceType },
    mode,
    rows,
  )
  const decision = reconcileComfyDecision(
    { ...current, serviceType },
    mode,
    sibling,
  )
  throwIfReconcileError(decision)
  if (decision.action === 'keep') return current
  const row = await aiConfigsRepo.findServiceConfigById(decision.id)
  if (!row || !row.isActive) {
    throw new UserAiConfigError(
      `ComfyUI 模式配置不可用：${preferredComfyProvider(serviceType, mode)}`,
    )
  }
  return rowToAiConfig(row, serviceType)
}
