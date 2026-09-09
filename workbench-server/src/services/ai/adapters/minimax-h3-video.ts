/**
 * MiniMax-H3 视频 — /v2/video_generation（与 Hailuo v1 适配器分离）
 */
import { parseConfigSettings } from '../../credits/credits.js'
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { VideoGenResponse, VideoPollResponse, VideoProviderAdapter } from './video-contracts.js'
import type { VideoGenerationRecord } from './video-contracts.js'
import { joinProviderUrl } from './url.js'

type ContentBlock = Record<string, unknown>

function clampDuration(raw?: number | null): number {
  const n = Math.round(Number(raw) || 5)
  return Math.min(15, Math.max(4, Number.isFinite(n) ? n : 5))
}

function resolveResolution(cfg: AIConfig): string {
  const settings = parseConfigSettings(cfg.settings)
  const raw = String(settings.resolution || '').trim().toUpperCase()
  return raw === '2K' ? '2K' : '768P'
}

function collectImageBlocks(clip: VideoGenerationRecord): ContentBlock[] {
  const refKind = clip.referenceMode || 'none'

  if (refKind === 'single' && clip.imageUrl) {
    return [{ type: 'image_url', image_url: { url: clip.imageUrl }, role: 'reference_image' }]
  }

  if (refKind === 'first_last') {
    const blocks: ContentBlock[] = []
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

function bearerHeaders(apiKey: string, json = true): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function extractTaskId(vendorJson: unknown): string | undefined {
  if (!vendorJson || typeof vendorJson !== 'object') return undefined
  const envelope = vendorJson as Record<string, unknown>
  const nested = envelope.data
  const nestedKey = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>).task_id || (nested as Record<string, unknown>).id
    : undefined
  const key = envelope.task_id || envelope.id || nestedKey
  return typeof key === 'string' || typeof key === 'number' ? String(key) : undefined
}

function extractVideoUrl(vendorJson: unknown): string | undefined {
  if (!vendorJson || typeof vendorJson !== 'object') return undefined
  const envelope = vendorJson as Record<string, unknown>
  if (typeof envelope.video_url === 'string' && envelope.video_url) return envelope.video_url
  if (typeof envelope.file_url === 'string' && envelope.file_url) return envelope.file_url
  const dataNode = envelope.data as Record<string, unknown> | undefined
  if (dataNode && typeof dataNode.video_url === 'string') return dataNode.video_url
  const fileNode = envelope.file as Record<string, unknown> | undefined
  if (fileNode && typeof fileNode.download_url === 'string') return fileNode.download_url
  return undefined
}

function phaseOf(vendorJson: any): string {
  return String(
    vendorJson?.status
    || vendorJson?.state
    || vendorJson?.data?.status
    || '',
  ).toLowerCase()
}

export class MiniMaxH3VideoAdapter implements VideoProviderAdapter {
  readonly provider = 'minimax-h3'

  buildGenerateRequest(cfg: AIConfig, clip: VideoGenerationRecord): ProviderRequest {
    const refBlocks = collectImageBlocks(clip)
    const body: Record<string, unknown> = {
      model: clip.model || cfg.model || 'MiniMax-H3',
      content: [{ type: 'text', text: clip.prompt || '' }, ...refBlocks],
      resolution: resolveResolution(cfg),
      duration: clampDuration(clip.duration),
    }
    if (!refBlocks.length) {
      body.ratio = clip.aspectRatio || '16:9'
    }

    return {
      url: joinProviderUrl(cfg.baseUrl, '/v2', '/video_generation'),
      method: 'POST',
      headers: bearerHeaders(cfg.apiKey),
      body,
    }
  }

  parseGenerateResponse(vendorJson: any): VideoGenResponse {
    const asyncKey = extractTaskId(vendorJson)
    if (asyncKey) return { isAsync: true, taskId: asyncKey }
    const inline = extractVideoUrl(vendorJson)
    if (inline) return { isAsync: false, videoUrl: inline }
    throw new Error('No task_id or video_url in MiniMax-H3 response')
  }

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/v2', `/query/video_generation/${asyncKey}`),
      method: 'GET',
      headers: bearerHeaders(cfg.apiKey, false),
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): VideoPollResponse {
    const phase = phaseOf(vendorJson)
    if (phase === 'completed' || phase === 'succeeded' || phase === 'success') {
      const href = extractVideoUrl(vendorJson)
      return href
        ? { status: 'completed', videoUrl: href }
        : { status: 'failed', error: 'MiniMax-H3 missing video_url' }
    }
    if (phase === 'failed' || phase === 'fail' || phase === 'error') {
      return {
        status: 'failed',
        error: vendorJson?.error_msg || vendorJson?.base_resp?.status_msg || vendorJson?.error || 'MiniMax-H3 failed',
      }
    }
    return { status: (phase === 'pending' ? 'pending' : 'processing') }
  }

  extractVideoUrl(vendorJson: any): string | null {
    return extractVideoUrl(vendorJson) || null
  }
}
