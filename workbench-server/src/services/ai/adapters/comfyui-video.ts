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
  comfyAuthHeaders,
  formatComfyNodeErrors,
  joinComfyUrl,
  parseComfyuiHistoryMedia,
  resolveComfyuiWorkflow,
} from './comfyui-workflow.js'
import { consumeComfyUploads, uploadComfyuiImageFromUrl } from './comfyui-upload.js'

function parseRefList(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export class ComfyUIVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'comfyui'

  async prepareGenerate(cfg: AIConfig, record: VideoGenerationRecord): Promise<void> {
    const refs = parseRefList(record.referenceImageUrls)
    const loadSrc = record.imageUrl || refs[0]
    const uploads: { loadImage?: string; firstFrame?: string; lastFrame?: string } = {}
    if (loadSrc) {
      uploads.loadImage = await uploadComfyuiImageFromUrl(cfg, loadSrc, `huohuo-vid-${record.id}.png`)
    }
    if (record.firstFrameUrl) {
      uploads.firstFrame = await uploadComfyuiImageFromUrl(cfg, record.firstFrameUrl, `huohuo-vid-${record.id}-first.png`)
    }
    if (record.lastFrameUrl) {
      uploads.lastFrame = await uploadComfyuiImageFromUrl(cfg, record.lastFrameUrl, `huohuo-vid-${record.id}-last.png`)
    }
    consumeComfyUploads(record.id, uploads, 'write')
  }

  buildGenerateRequest(cfg: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const uploads = consumeComfyUploads(record.id, {}, 'read')
    const graph = applyComfyuiTitleInputs(resolveComfyuiWorkflow(cfg.settings, 'video'), {
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
      body: { prompt: graph, client_id: 'huohuo-drama' },
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
