/**
 * 火山 Seedance 图生视频 — /api/v3/contents/generations/tasks
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { VideoGenResponse, VideoPollResponse, VideoProviderAdapter } from './video-contracts.js'
import type { VideoGenerationRecord } from './video-contracts.js'
import { joinProviderUrl } from './url.js'

const SEEDANCE_DEFAULT_MODEL = 'doubao-seedance-1-5-pro-251215'
const SEEDANCE_V3_TASKS = '/contents/generations/tasks'

type SeedanceContentBlock = Record<string, unknown>

function extractSeedanceVideoUrl(vendorJson: unknown): string | undefined {
  if (!vendorJson || typeof vendorJson !== 'object') return undefined
  const envelope = vendorJson as Record<string, unknown>
  const top = envelope.video_url
  if (typeof top === 'string' && top) return top
  const nestedContent = envelope.content as Record<string, unknown> | undefined
  if (nestedContent && typeof nestedContent.video_url === 'string') return nestedContent.video_url
  const nestedData = envelope.data as Record<string, unknown> | undefined
  if (nestedData && typeof nestedData.video_url === 'string') return nestedData.video_url
  return undefined
}

function boundSeedanceDuration(requested?: number | null): number {
  const rounded = Math.round(Number(requested || 5))
  if (!Number.isFinite(rounded)) return 5
  return Math.min(12, Math.max(4, rounded))
}

function collectSeedanceImageSegments(clip: VideoGenerationRecord): SeedanceContentBlock[] {
  const refKind = clip.referenceMode || 'none'

  if (refKind === 'single' && clip.imageUrl) {
    return [{ type: 'image_url', image_url: { url: clip.imageUrl } }]
  }

  if (refKind === 'first_last') {
    const frames: SeedanceContentBlock[] = []
    if (clip.firstFrameUrl) {
      frames.push({ type: 'image_url', image_url: { url: clip.firstFrameUrl }, role: 'first_frame' })
    }
    if (clip.lastFrameUrl) {
      frames.push({ type: 'image_url', image_url: { url: clip.lastFrameUrl }, role: 'last_frame' })
    }
    return frames
  }

  if (refKind === 'multiple' && clip.referenceImageUrls) {
    try {
      const urlList: string[] = JSON.parse(clip.referenceImageUrls)
      return urlList.map((href) => ({ type: 'image_url', image_url: { url: href } }))
    } catch {
      return []
    }
  }

  return []
}

function assembleSeedanceContent(clip: VideoGenerationRecord): SeedanceContentBlock[] {
  const segments: SeedanceContentBlock[] = [{ type: 'text', text: clip.prompt || '' }]
  segments.push(...collectSeedanceImageSegments(clip))
  return segments
}

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'volcengine'

  buildGenerateRequest(cfg: AIConfig, clip: VideoGenerationRecord): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/api/v3', SEEDANCE_V3_TASKS),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: {
        model: clip.model || cfg.model || SEEDANCE_DEFAULT_MODEL,
        content: assembleSeedanceContent(clip),
        generate_audio: clip.generateAudio !== false,
        ratio: clip.aspectRatio || 'adaptive',
        duration: boundSeedanceDuration(clip.duration),
        watermark: false,
      },
    }
  }

  parseGenerateResponse(vendorJson: any): VideoGenResponse {
    if (vendorJson?.id) return { isAsync: true, taskId: vendorJson.id }
    const inline = extractSeedanceVideoUrl(vendorJson)
    if (inline) return { isAsync: false, videoUrl: inline }
    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(cfg: AIConfig, remoteTaskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/api/v3', `${SEEDANCE_V3_TASKS}/${remoteTaskId}`),
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): VideoPollResponse {
    const lifecycle = vendorJson?.status
    if (lifecycle === 'succeeded') {
      return { status: 'completed', videoUrl: extractSeedanceVideoUrl(vendorJson) }
    }
    if (lifecycle === 'failed') {
      return { status: 'failed', error: vendorJson?.error || 'Video generation failed' }
    }
    return { status: lifecycle || 'processing' }
  }

  extractVideoUrl(vendorJson: any): string | null {
    return extractSeedanceVideoUrl(vendorJson) || null
  }
}
