import type { ComfyMode } from './comfyui-workflow.js'
import { UserAiConfigError } from '../user-ai-config-resolve.js'

/** Minimal config shape for pure reconcile helpers (id/serviceType optional on adapter-shared AIConfig). */
export type ComfyConfigLike = {
  id?: number
  provider: string
  baseUrl: string
  serviceType?: string
}

export type ComfySiblingCandidate = {
  id: number
  provider: string
  baseUrl: string
  isActive?: boolean | number
  serviceType?: string
}

export type ComfyReconcileDecision =
  | { action: 'keep' }
  | { action: 'switch'; id: number }
  | { action: 'error'; message: string }

export function isComfyFamilyProvider(provider: string): boolean {
  const p = (provider || '').toLowerCase()
  return p === 'comfyui' || p.startsWith('comfyui-')
}

export function contentRefUrls(
  urls: string[] | undefined,
  styleReferenceUrl?: string | null,
): string[] {
  const list = (urls || []).filter(Boolean)
  if (!styleReferenceUrl) return list
  return list.filter((u) => u !== styleReferenceUrl)
}

/** First non-style reference URL for i2i / i2v conditioning uploads. */
export function firstContentImageRef(
  urls: string[] | undefined,
  styleReferenceUrl?: string | null,
): string | undefined {
  return contentRefUrls(urls, styleReferenceUrl)[0]
}

export type ComfyVideoUploadSources = {
  firstFrame?: string
  lastFrame?: string
  /** Set when first frame comes from imageUrl / content ref (not explicit firstFrameUrl). */
  loadImage?: string
}

/** Pure source URLs for i2v uploads (before Comfy /upload). */
export function resolveComfyVideoUploadSources(input: {
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string[]
  styleReferenceUrl?: string | null
}): ComfyVideoUploadSources {
  const out: ComfyVideoUploadSources = {}
  if (input.firstFrameUrl) {
    out.firstFrame = input.firstFrameUrl
  } else {
    const src = input.imageUrl || firstContentImageRef(input.referenceImageUrls, input.styleReferenceUrl)
    if (src) {
      out.firstFrame = src
      out.loadImage = src
    }
  }
  if (input.lastFrameUrl) {
    out.lastFrame = input.lastFrameUrl
  }
  return out
}

export function detectComfyImageMode(
  referenceImages: string[] | undefined,
  styleReferenceUrl?: string | null,
): 't2i' | 'i2i' {
  return contentRefUrls(referenceImages, styleReferenceUrl).length > 0 ? 'i2i' : 't2i'
}

export function detectComfyVideoMode(input: {
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string[]
  styleReferenceUrl?: string | null
}): 't2v' | 'i2v' {
  if (input.firstFrameUrl || input.lastFrameUrl || input.imageUrl) return 'i2v'
  if (contentRefUrls(input.referenceImageUrls, input.styleReferenceUrl).length > 0) return 'i2v'
  return 't2v'
}

export function preferredComfyProvider(
  serviceType: 'image' | 'video',
  mode: ComfyMode,
): string {
  if (serviceType === 'image') return mode === 'i2i' ? 'comfyui-i2i' : 'comfyui-t2i'
  return mode === 'i2v' ? 'comfyui-i2v' : 'comfyui-t2v'
}

export function pickComfySiblingConfig(
  current: ComfyConfigLike,
  mode: ComfyMode,
  candidates: ComfySiblingCandidate[],
): ComfySiblingCandidate | null {
  const want = preferredComfyProvider(
    current.serviceType === 'video' ? 'video' : 'image',
    mode,
  )
  const active = candidates.filter(
    (r) => r.provider === want && (r.isActive === undefined || r.isActive === true || r.isActive === 1),
  )
  if (!active.length) return null
  return active.find((r) => r.baseUrl === current.baseUrl) || active[0]
}

/** Pure decision: keep | switch-id | error message */
export function reconcileComfyDecision(
  current: ComfyConfigLike,
  mode: ComfyMode,
  sibling: { id: number } | null,
): ComfyReconcileDecision {
  const want = preferredComfyProvider(
    current.serviceType === 'video' ? 'video' : 'image',
    mode,
  )
  const p = current.provider.toLowerCase()
  if (p === want) return { action: 'keep' }
  if (sibling) return { action: 'switch', id: sibling.id }
  if (p === 'comfyui') return { action: 'keep' }
  return {
    action: 'error',
    message: `当前 ComfyUI 配置为 ${current.provider}，任务需要 ${want}。请在设置中启用对应模式的服务配置。`,
  }
}

export function throwIfReconcileError(decision: ComfyReconcileDecision): void {
  if (decision.action === 'error') throw new UserAiConfigError(decision.message)
}

/** Mode for workflow/upload: mode slugs from provider; legacy from job detection. */
export function resolveRuntimeComfyMode(
  provider: string,
  detected: ComfyMode,
): ComfyMode {
  const p = provider.toLowerCase()
  if (p === 'comfyui-t2i') return 't2i'
  if (p === 'comfyui-i2i') return 'i2i'
  if (p === 'comfyui-t2v') return 't2v'
  if (p === 'comfyui-i2v') return 'i2v'
  if (p === 'comfyui') return detected // legacy dual-mode
  return detected
}
