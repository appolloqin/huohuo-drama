/**
 * OpenAI 兼容图片生成 — DALL·E / 网关转发 /images/generations
 */
import type {
  AIConfig,
  ImageGenResponse,
  ImageGenerationRecord,
  ImagePollResponse,
  ImageProviderAdapter,
  ProviderRequest,
} from './types.js'
import {
  isAspectRatioSpec,
  isPixelSizeSpec,
  isSeedreamLikeImageModel,
  mapAspectRatioToDalleSize,
  resolveSeedreamSizeSpec,
} from '../../../common/media/image-size-spec.js'
import { joinProviderUrl } from './url.js'

const DALLE_FALLBACK_DIMENSION = '1024x1024'

export class OpenAIImageAdapter implements ImageProviderAdapter {
  readonly provider = 'openai'

  // ── 提交生成 ───────────────────────────────────────────────

  buildGenerateRequest(cfg: AIConfig, frameJob: ImageGenerationRecord): ProviderRequest {
    const model = frameJob.model || cfg.model || 'dall-e-3'
    const sizeSpec = frameJob.size
    const seedream = isSeedreamLikeImageModel(model)
    const size = seedream
      ? resolveSeedreamSizeSpec(sizeSpec)
      : isAspectRatioSpec(sizeSpec)
        ? mapAspectRatioToDalleSize(sizeSpec)
        : (isPixelSizeSpec(sizeSpec) ? sizeSpec : DALLE_FALLBACK_DIMENSION)

    const refs = seedream
      ? OpenAIImageAdapter.parseReferenceGallery(frameJob.referenceImages)
      : undefined
    const basePrompt = String(frameJob.prompt || '').trim()
    const prompt = refs?.length
      ? [
          `请严格参考提供的 ${refs.length} 张参考图（按顺序为图1…图${refs.length}）。`,
          '人物外貌以角色形象参考图为准（通常靠前），保持脸型、发型、五官、服装一致；场景/道具图只约束环境，不得改变人物长相。',
          '不要生成与角色形象参考图明显不同的新面孔。',
          basePrompt,
        ].join('\n')
      : basePrompt

    const body: Record<string, unknown> = {
      model,
      prompt,
      size,
      n: 1,
      response_format: 'url',
    }
    // Seedream i2i / multi-ref (huohuo gateway): extension field beyond OpenAI DALL·E.
    if (refs?.length) {
      body.image = refs.length === 1 ? refs[0] : refs
      body.sequential_image_generation = 'disabled'
    }

    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(vendorJson: any): ImageGenResponse {
    const asyncKey = vendorJson?.task_id || vendorJson?.id
    if (asyncKey) return { isAsync: true, taskId: asyncKey }

    const hosted = this.resolveHostedImageHref(vendorJson)
    if (hosted) return { isAsync: false, imageUrl: hosted }

    if (this.resolveEmbeddedB64Blob(vendorJson)) {
      return { isAsync: false, imageUrl: undefined }
    }

    throw new Error('No image URL in response')
  }

  // ── 异步轮询 ───────────────────────────────────────────────

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', `/images/task/${asyncKey}`),
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): ImagePollResponse {
    const lifecycle = vendorJson?.status
    if (lifecycle === 'completed') {
      const href = vendorJson.image_url || vendorJson.data?.[0]?.url || null
      return { status: 'completed', imageUrl: href || undefined }
    }
    if (lifecycle === 'failed') {
      const reason = vendorJson?.error?.message || 'Generation failed'
      return { status: 'failed', error: reason }
    }
    return { status: lifecycle || 'processing' }
  }

  // ── 结果提取 ───────────────────────────────────────────────

  extractImageUrl(vendorJson: any): string | null {
    return this.resolveHostedImageHref(vendorJson)
  }

  extractImageBase64(vendorJson: any): { data: string; mimeType: string } | null {
    const inline = this.resolveEmbeddedB64Blob(vendorJson)
    return inline ? { data: inline, mimeType: 'image/png' } : null
  }

  private resolveHostedImageHref(vendorJson: any): string | null {
    const fromArray = vendorJson?.data?.[0]?.url
    if (fromArray) return fromArray
    return vendorJson?.image_url || vendorJson?.url || null
  }

  private resolveEmbeddedB64Blob(vendorJson: any): string | null {
    return vendorJson?.data?.[0]?.b64_json || null
  }

  private static parseReferenceGallery(raw?: string | null): string[] | undefined {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return undefined
      const refs = parsed.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 10)
      return refs.length ? refs : undefined
    } catch {
      return undefined
    }
  }
}
