/**
 * ComfyUI 官方 HTTP：POST /prompt + GET /history/{id} 生图
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type {
  ImageGenResponse,
  ImageGenerationRecord,
  ImagePollResponse,
  ImageProviderAdapter,
} from './image-contracts.js'
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

export class ComfyUIImageAdapter implements ImageProviderAdapter {
  readonly provider = 'comfyui'

  async prepareGenerate(cfg: AIConfig, record: ImageGenerationRecord): Promise<void> {
    const refs = parseRefList(record.referenceImages)
    if (!refs[0]) return
    const name = await uploadComfyuiImageFromUrl(cfg, refs[0], `huohuo-img-${record.id}.png`)
    consumeComfyUploads(record.id, { loadImage: name }, 'write')
  }

  buildGenerateRequest(cfg: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const uploads = consumeComfyUploads(record.id, {}, 'read')
    const graph = applyComfyuiTitleInputs(resolveComfyuiWorkflow(cfg.settings, 'image'), {
      prompt: record.prompt || '',
      loadImage: uploads.loadImage,
    })
    return {
      url: joinComfyUrl(cfg.baseUrl, '/prompt'),
      method: 'POST',
      headers: comfyAuthHeaders(cfg.apiKey, true),
      body: { prompt: graph, client_id: 'huohuo-drama' },
    }
  }

  parseGenerateResponse(vendorJson: any): ImageGenResponse {
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

  parsePollResponse(vendorJson: any): ImagePollResponse {
    const promptId = vendorJson && typeof vendorJson === 'object' ? Object.keys(vendorJson)[0] : ''
    const parsed = parseComfyuiHistoryMedia(vendorJson, promptId, '')
    if (parsed.status === 'completed') return { status: 'completed', imageUrl: parsed.mediaUrl }
    if (parsed.status === 'failed') return { status: 'failed', error: parsed.error }
    return { status: 'processing' }
  }

  extractImageUrl(result: any): string | null {
    const promptId = result && typeof result === 'object' ? Object.keys(result)[0] : ''
    return parseComfyuiHistoryMedia(result, promptId, '').mediaUrl || null
  }

  extractImageBase64(): { data: string; mimeType: string } | null {
    return null
  }
}
