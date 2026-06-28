/**
 * MiniMax 图片生成 — /v1/image_generation
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { ImageGenResponse, ImagePollResponse, ImageProviderAdapter } from './image-contracts.js'
import type { ImageGenerationRecord } from './image-contracts.js'
import {
  aspectRatioToSlash,
  isAspectRatioSpec,
  isPixelSizeSpec,
} from '../../../common/media/image-size-spec.js'
import { joinProviderUrl } from './url.js'

const MINIMAX_DEFAULT_SIZE = '1920x1080'

export class MiniMaxImageAdapter implements ImageProviderAdapter {
  readonly provider = 'minimax'

  buildGenerateRequest(cfg: AIConfig, frameJob: ImageGenerationRecord): ProviderRequest {
    const requestBody: Record<string, unknown> = {
      model: frameJob.model || cfg.model,
      prompt: frameJob.prompt,
      n: 1,
    }

    const refs = MiniMaxImageAdapter.parseReferenceGallery(frameJob.referenceImages)
    if (refs) requestBody.image = refs

    if (isAspectRatioSpec(frameJob.size)) {
      requestBody.aspect_ratio = aspectRatioToSlash(frameJob.size)
    } else {
      requestBody.size = frameJob.size || MINIMAX_DEFAULT_SIZE
      const ratio = MiniMaxImageAdapter.canvasToAspectRatio(frameJob.size)
      if (ratio) requestBody.aspect_ratio = ratio
    }

    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', '/image_generation'),
      method: 'POST',
      headers: MiniMaxImageAdapter.bearerHeaders(cfg.apiKey),
      body: requestBody,
    }
  }

  parseGenerateResponse(vendorJson: any): ImageGenResponse {
    const asyncKey = vendorJson?.task_id || vendorJson?.id
    if (asyncKey) return { isAsync: true, taskId: asyncKey }

    const hosted = MiniMaxImageAdapter.extractFirstImageUrl(vendorJson)
    if (hosted) return { isAsync: false, imageUrl: hosted }

    throw new Error('No image URL or task_id in response')
  }

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', `/image_generation/task/${asyncKey}`),
      method: 'GET',
      headers: MiniMaxImageAdapter.bearerHeaders(cfg.apiKey, false),
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): ImagePollResponse {
    return MiniMaxImageAdapter.interpretPollPhase(vendorJson)
  }

  extractImageUrl(vendorJson: any): string | null {
    return MiniMaxImageAdapter.extractFirstImageUrl(vendorJson)
  }

  extractImageBase64(): { data: string; mimeType: string } | null {
    return null
  }

  private static bearerHeaders(apiKey: string, json = true): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
    if (json) headers['Content-Type'] = 'application/json'
    return headers
  }

  private static parseReferenceGallery(raw?: string | null): string[] | undefined {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined
    } catch {
      return undefined
    }
  }

  private static canvasToAspectRatio(size?: string | null): string | undefined {
    if (!size) return undefined
    if (isAspectRatioSpec(size)) return aspectRatioToSlash(size)
    if (!isPixelSizeSpec(size)) return undefined
    const [w, h] = size.split('x')
    return w && h ? `${w}/${h}` : undefined
  }

  private static extractFirstImageUrl(vendorJson: any): string | null {
    return vendorJson?.image_url
      || vendorJson?.data?.image_url
      || vendorJson?.url
      || vendorJson?.data?.url
      || (Array.isArray(vendorJson?.data) ? vendorJson.data[0]?.url : null)
      || null
  }

  private static interpretPollPhase(vendorJson: any): ImagePollResponse {
    const lifecycle = vendorJson?.status || vendorJson?.state
    if (lifecycle === 'completed' || lifecycle === 'succeeded') {
      const href = MiniMaxImageAdapter.extractFirstImageUrl(vendorJson)
      return href
        ? { status: 'completed', imageUrl: href }
        : { status: 'failed', error: 'Missing image URL' }
    }
    if (lifecycle === 'failed' || lifecycle === 'error') {
      return { status: 'failed', error: vendorJson?.error_msg || vendorJson?.error || 'Generation failed' }
    }
    return { status: lifecycle || 'processing' }
  }
}
