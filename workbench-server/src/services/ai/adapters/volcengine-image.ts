/**
 * 火山 Seedream 文生图 — /api/v3/images/generations
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { ImageGenResponse, ImagePollResponse, ImageProviderAdapter } from './image-contracts.js'
import type { ImageGenerationRecord } from './image-contracts.js'
import {
  isAspectRatioSpec,
  isPixelSizeSpec,
  mapAspectRatioToPixelDims,
  splitPixelSizeSpec,
} from '../../../common/media/image-size-spec.js'
import { joinProviderUrl } from './url.js'

const SEEDREAM_FALLBACK_MODEL = 'doubao-seedream-5-0-lite'
const SEEDREAM_V3_IMAGES = '/images/generations'

export class VolcEngineImageAdapter implements ImageProviderAdapter {
  readonly provider = 'volcengine'

  // ── 提交生成 ───────────────────────────────────────────────

  buildGenerateRequest(cfg: AIConfig, frameJob: ImageGenerationRecord): ProviderRequest {
    const dims = VolcEngineImageAdapter.resolveCanvasDims(frameJob.size)
    const refs = VolcEngineImageAdapter.parseReferenceGallery(frameJob.referenceImages)
    const basePrompt = String(frameJob.prompt || '').trim()
    const prompt = refs?.length
      ? [
          '请严格参考提供的人物/场景参考图，保持人物脸型、发型、五官、服装与场景风格一致。',
          '不要生成与参考图明显不同的新角色或环境。',
          basePrompt,
        ].join('\n')
      : basePrompt

    const body: Record<string, unknown> = {
      model: frameJob.model || cfg.model || SEEDREAM_FALLBACK_MODEL,
      prompt,
      ...dims,
    }
    if (refs?.length) {
      body.image = refs.length === 1 ? refs[0] : refs
    }

    return {
      url: joinProviderUrl(cfg.baseUrl, '/api/v3', SEEDREAM_V3_IMAGES),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(vendorJson: any): ImageGenResponse {
    const asyncKey = VolcEngineImageAdapter.pickAsyncTaskId(vendorJson)
    if (asyncKey) return { isAsync: true, taskId: asyncKey }

    const hosted = VolcEngineImageAdapter.pickHostedImageUrl(vendorJson)
    if (hosted) return { isAsync: false, imageUrl: hosted }

    throw new Error('No image URL in response')
  }

  // ── 异步轮询 ───────────────────────────────────────────────

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/api/v3', `${SEEDREAM_V3_IMAGES}/${asyncKey}`),
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): ImagePollResponse {
    return VolcEngineImageAdapter.translateSeedreamPhase(vendorJson)
  }

  extractImageUrl(vendorJson: any): string | null {
    return VolcEngineImageAdapter.pickHostedImageUrl(vendorJson) || null
  }

  extractImageBase64(): { data: string; mimeType: string } | null {
    return null
  }

  private static pickHostedImageUrl(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined
    const envelope = payload as Record<string, unknown>
    const gallery = envelope.data
    if (Array.isArray(gallery) && gallery[0] && typeof gallery[0] === 'object') {
      const href = (gallery[0] as Record<string, unknown>).url
      if (typeof href === 'string' && href) return href
    }
    if (typeof envelope.image_url === 'string' && envelope.image_url) return envelope.image_url
    if (typeof envelope.url === 'string' && envelope.url) return envelope.url
    return undefined
  }

  private static resolveCanvasDims(size?: string | null): { width?: number; height?: number } {
    if (isAspectRatioSpec(size)) return mapAspectRatioToPixelDims(size)
    if (size && isPixelSizeSpec(size)) return splitPixelSizeSpec(size)
    return mapAspectRatioToPixelDims('16:9')
  }

  private static splitCanvasPixels(size?: string | null): { width?: number; height?: number } {
    return VolcEngineImageAdapter.resolveCanvasDims(size)
  }

  private static pickAsyncTaskId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined
    const envelope = payload as Record<string, unknown>
    const key = envelope.task_id || envelope.id
    return typeof key === 'string' || typeof key === 'number' ? String(key) : undefined
  }

  private static parseReferenceGallery(raw?: string | null): string[] | undefined {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return undefined
      const refs = parsed.map(item => String(item || '').trim()).filter(Boolean).slice(0, 14)
      return refs.length ? refs : undefined
    } catch {
      return undefined
    }
  }

  private static translateSeedreamPhase(payload: any): ImagePollResponse {
    const lifecycle = payload?.status
    if (lifecycle === 'succeeded') {
      return { status: 'completed', imageUrl: VolcEngineImageAdapter.pickHostedImageUrl(payload) }
    }
    if (lifecycle === 'failed') {
      return { status: 'failed', error: payload?.error || 'Generation failed' }
    }
    return { status: lifecycle || 'processing' }
  }
}
