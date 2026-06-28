import type { AIConfig, AsyncTaskStatus, ProviderRequest } from './adapter-shared.js'

// ── 图像生成任务快照（DB 行 → adapter 入参）────────────────────

export interface ImageGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  size?: string | null
  frameType?: string | null
  referenceImages?: string | null
}

// ── 厂商响应解析结果 ───────────────────────────────────────────

export interface ImageGenResponse {
  isAsync: boolean
  taskId?: string
  imageUrl?: string
}

export interface ImagePollResponse {
  status: AsyncTaskStatus
  imageUrl?: string
  error?: string
}

// ── 图像 Provider 适配器契约 ───────────────────────────────────

export interface ImageProviderAdapter {
  provider: string
  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest
  parseGenerateResponse(result: any): ImageGenResponse
  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest
  parsePollResponse(result: any): ImagePollResponse
  extractImageUrl(result: any): string | null
  extractImageBase64(result: any): { data: string; mimeType: string } | null
}
