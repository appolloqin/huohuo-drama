/**
 * MiniMax 图生视频 — /v1/video_generation 异步任务
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { VideoGenResponse, VideoPollResponse, VideoProviderAdapter } from './video-contracts.js'
import type { VideoGenerationRecord } from './video-contracts.js'
import { joinProviderUrl } from './url.js'

type MinimaxContentBlock = Record<string, unknown>

function buildMinimaxPromptSuffix(clip: VideoGenerationRecord): string {
  const ratio = clip.aspectRatio || '16:9'
  const seconds = clip.duration || 5
  return `${clip.prompt || ''}  --ratio ${ratio}  --dur ${seconds}`
}

function collectMinimaxImageBlocks(clip: VideoGenerationRecord): MinimaxContentBlock[] {
  const refKind = clip.referenceMode || 'none'

  if (refKind === 'single' && clip.imageUrl) {
    return [{ type: 'image_url', image_url: { url: clip.imageUrl }, role: 'reference_image' }]
  }

  if (refKind === 'first_last') {
    const blocks: MinimaxContentBlock[] = []
    if (clip.firstFrameUrl) {
      blocks.push({ type: 'image_url', image_url: { url: clip.firstFrameUrl }, role: 'first_frame' })
    }
    if (clip.lastFrameUrl) {
      blocks.push({ type: 'image_url', image_url: { url: clip.lastFrameUrl }, role: 'last_frame' })
    }
    return blocks
  }

  if (refKind === 'multiple' && clip.referenceImageUrls) {
    try {
      const hrefs: string[] = JSON.parse(clip.referenceImageUrls)
      return hrefs.map((href) => ({
        type: 'image_url',
        image_url: { url: href },
        role: 'reference_image',
      }))
    } catch {
      return []
    }
  }

  return []
}

function extractMinimaxTaskKey(vendorJson: unknown): string | undefined {
  if (!vendorJson || typeof vendorJson !== 'object') return undefined
  const envelope = vendorJson as Record<string, unknown>
  const nested = envelope.data
  const nestedKey = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>).id
    : undefined
  const key = envelope.task_id || envelope.id || nestedKey
  return typeof key === 'string' || typeof key === 'number' ? String(key) : undefined
}

function resolveMinimaxVideoUrl(vendorJson: unknown): string | undefined {
  if (!vendorJson || typeof vendorJson !== 'object') return undefined
  const envelope = vendorJson as Record<string, unknown>
  if (typeof envelope.video_url === 'string' && envelope.video_url) return envelope.video_url
  const dataNode = envelope.data as Record<string, unknown> | undefined
  if (dataNode && typeof dataNode.video_url === 'string') return dataNode.video_url
  const contentNode = envelope.content as Record<string, unknown> | undefined
  if (contentNode && typeof contentNode.video_url === 'string') return contentNode.video_url
  return undefined
}

function interpretMinimaxPollBody(vendorJson: any): VideoPollResponse {
  const phase = vendorJson?.status || vendorJson?.state || vendorJson?.data?.status
  if (phase === 'completed' || phase === 'succeeded') {
    return { status: 'completed', videoUrl: resolveMinimaxVideoUrl(vendorJson) || undefined }
  }
  if (phase === 'failed' || phase === 'error') {
    return { status: 'failed', error: vendorJson?.error_msg || vendorJson?.error || 'Video generation failed' }
  }
  return { status: phase || 'processing' }
}

export class MiniMaxVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'minimax'

  buildGenerateRequest(cfg: AIConfig, clip: VideoGenerationRecord): ProviderRequest {
    const promptCue = buildMinimaxPromptSuffix(clip)
    const refBlocks = collectMinimaxImageBlocks(clip)

    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: {
        model: clip.model || cfg.model,
        content: [{ type: 'text', text: promptCue }, ...refBlocks],
      },
    }
  }

  parseGenerateResponse(vendorJson: any): VideoGenResponse {
    const asyncKey = extractMinimaxTaskKey(vendorJson)
    if (asyncKey) return { isAsync: true, taskId: asyncKey }

    const inline = resolveMinimaxVideoUrl(vendorJson)
    if (inline) return { isAsync: false, videoUrl: inline }

    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', `/video_generation/task/${asyncKey}`),
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): VideoPollResponse {
    return interpretMinimaxPollBody(vendorJson)
  }

  extractVideoUrl(vendorJson: any): string | null {
    return resolveMinimaxVideoUrl(vendorJson) || null
  }
}
