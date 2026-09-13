/**
 * ComfyUI 官方 HTTP：POST /prompt + GET /history/{id} 生视频
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type {
  VideoGenResponse,
  VideoGenerationRecord,
  VideoPollResponse,
  VideoProviderAdapter,
} from './video-contracts.js'
import {
  applyComfyuiTitleInputs,
  assertComfyRequiredTitles,
  comfyAuthHeaders,
  formatComfyNodeErrors,
  joinComfyUrl,
  parseComfyuiHistoryMedia,
  resolveComfyuiWorkflow,
} from './comfyui-workflow.js'
import { consumeComfyUploads, uploadComfyuiImageFromUrl } from './comfyui-upload.js'
import {
  detectComfyVideoMode,
  resolveComfyVideoUploadSources,
  resolveRuntimeComfyMode,
} from './comfyui-mode-resolve.js'

function parseRefList(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

function resolveVideoMode(cfg: AIConfig, record: VideoGenerationRecord) {
  const detected = detectComfyVideoMode({
    imageUrl: record.imageUrl,
    firstFrameUrl: record.firstFrameUrl,
    lastFrameUrl: record.lastFrameUrl,
    referenceImageUrls: parseRefList(record.referenceImageUrls),
    styleReferenceUrl: record.styleReferenceUrl,
  })
  return resolveRuntimeComfyMode(cfg.provider, detected)
}

export class ComfyUIVideoAdapter implements VideoProviderAdapter {
  readonly provider: string

  constructor(provider = 'comfyui') {
    this.provider = provider
  }

  async prepareGenerate(cfg: AIConfig, record: VideoGenerationRecord): Promise<void> {
    const mode = resolveVideoMode(cfg, record)
    if (mode === 't2v') return

    const sources = resolveComfyVideoUploadSources({
      imageUrl: record.imageUrl,
      firstFrameUrl: record.firstFrameUrl,
      lastFrameUrl: record.lastFrameUrl,
      referenceImageUrls: parseRefList(record.referenceImageUrls),
      styleReferenceUrl: record.styleReferenceUrl,
    })
    if (!sources.firstFrame && !sources.lastFrame) {
      throw new Error('图生视频需要首帧或内容参考图')
    }

    const uploads: { loadImage?: string; firstFrame?: string; lastFrame?: string } = {}
    if (sources.firstFrame) {
      const name = await uploadComfyuiImageFromUrl(
        cfg,
        sources.firstFrame,
        `huohuo-vid-${record.id}-first.png`,
      )
      uploads.firstFrame = name
      if (sources.loadImage) uploads.loadImage = name
    }
    if (sources.lastFrame) {
      uploads.lastFrame = await uploadComfyuiImageFromUrl(
        cfg,
        sources.lastFrame,
        `huohuo-vid-${record.id}-last.png`,
      )
    }
    consumeComfyUploads(record.id, uploads, 'write')
  }

  buildGenerateRequest(cfg: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const mode = resolveVideoMode(cfg, record)
    const uploads = consumeComfyUploads(record.id, {}, 'read')
    const graph = resolveComfyuiWorkflow(cfg.settings, mode)
    if (cfg.provider.toLowerCase() !== 'comfyui') {
      assertComfyRequiredTitles(graph, mode)
    }
    const promptGraph = applyComfyuiTitleInputs(graph, {
      prompt: record.prompt || '',
      loadImage: uploads.loadImage,
      firstFrame: uploads.firstFrame,
      lastFrame: uploads.lastFrame,
      duration: record.duration ?? undefined,
    })
    return {
      url: joinComfyUrl(cfg.baseUrl, '/prompt'),
      method: 'POST',
      headers: comfyAuthHeaders(cfg.apiKey, true),
      body: { prompt: promptGraph, client_id: 'huohuo-drama' },
    }
  }

  parseGenerateResponse(vendorJson: any): VideoGenResponse {
    const nodeErrors = formatComfyNodeErrors(vendorJson)
    if (nodeErrors) throw new Error(`ComfyUI node_errors: ${nodeErrors}`)
    const promptId = vendorJson?.prompt_id
    if (!promptId) throw new Error('ComfyUI 响应缺少 prompt_id')
    return { isAsync: true, taskId: String(promptId) }
  }

  buildPollRequest(cfg: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinComfyUrl(cfg.baseUrl, `/history/${taskId}`),
      method: 'GET',
      headers: comfyAuthHeaders(cfg.apiKey),
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): VideoPollResponse {
    const promptId = vendorJson && typeof vendorJson === 'object' ? Object.keys(vendorJson)[0] : ''
    const parsed = parseComfyuiHistoryMedia(vendorJson, promptId, '')
    if (parsed.status === 'completed') return { status: 'completed', videoUrl: parsed.mediaUrl }
    if (parsed.status === 'failed') return { status: 'failed', error: parsed.error }
    return { status: 'processing' }
  }

  extractVideoUrl(vendorJson: any): string | null {
    const promptId = vendorJson && typeof vendorJson === 'object' ? Object.keys(vendorJson)[0] : ''
    return parseComfyuiHistoryMedia(vendorJson, promptId, '').mediaUrl || null
  }
}
