/**
 * Vidu image-to-video — Webhook-driven; no HTTP polling endpoint
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { VideoGenResponse, VideoPollResponse, VideoProviderAdapter } from './video-contracts.js'
import type { VideoGenerationRecord } from './video-contracts.js'
import { joinProviderUrl } from './url.js'

const VIDU_NO_POLL_STUB: ProviderRequest = {
  url: 'vidu://no-polling-endpoint',
  method: 'GET',
  headers: {},
  body: undefined,
}

const VIDU_ASPECT_TO_RESOLUTION: Record<string, string> = {
  '16:9': '720p',
  '9:16': '720p',
  '1:1': '720p',
  '4:3': '720p',
  '3:4': '720p',
  '2:3': '720p',
}

function gatherViduReferenceFrames(clip: VideoGenerationRecord): string[] {
  const refKind = clip.referenceMode || 'none'

  if (refKind === 'single' && clip.imageUrl) return [clip.imageUrl]

  if (refKind === 'first_last') {
    return [clip.firstFrameUrl, clip.lastFrameUrl].filter(Boolean) as string[]
  }

  if (refKind === 'multiple' && clip.referenceImageUrls) {
    try {
      const parsed = JSON.parse(clip.referenceImageUrls)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function decodeViduCallbackPayload(body: any): {
  status: 'completed' | 'failed'
  videoUrl?: string
  error?: string
} {
  if (body?.state === 'success') return { status: 'completed', videoUrl: body.video_url }
  if (body?.state === 'failed') return { status: 'failed', error: body.error || 'Vidu generation failed' }
  return { status: 'failed', error: `Unknown state: ${body?.state}` }
}

export class ViduVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'vidu'

  // ── Submit img2video job ───────────────────────────────────

  buildGenerateRequest(cfg: AIConfig, clip: VideoGenerationRecord): ProviderRequest {
    const body: Record<string, unknown> = {
      model: clip.model || cfg.model || 'viduq3-turbo',
      images: gatherViduReferenceFrames(clip),
      prompt: clip.prompt,
    }

    if (clip.duration) body.duration = clip.duration
    if (clip.aspectRatio) {
      body.resolution = VIDU_ASPECT_TO_RESOLUTION[clip.aspectRatio] || '720p'
    }

    return {
      url: joinProviderUrl(cfg.baseUrl, '', '/ent/v2/img2video'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${cfg.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(vendorJson: any): VideoGenResponse {
    if (vendorJson?.task_id) return { isAsync: true, taskId: vendorJson.task_id }
    if (vendorJson?.video_url) return { isAsync: false, videoUrl: vendorJson.video_url }
    throw new Error('No task_id in Vidu response')
  }

  // ── Polling stub (real status via Webhook) ─────────────────

  buildPollRequest(): ProviderRequest {
    return VIDU_NO_POLL_STUB
  }

  parsePollResponse(): VideoPollResponse {
    return { status: 'processing' }
  }

  extractVideoUrl(vendorJson: any): string | null {
    return vendorJson?.video_url || null
  }

  static parseCallbackState = decodeViduCallbackPayload
}
