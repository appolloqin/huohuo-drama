import type { AIConfig, AsyncTaskStatus, ProviderRequest } from './adapter-shared.js'

// ── 视频生成任务快照（分镜/镜头 → adapter 入参）────────────────

export interface VideoGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  referenceMode?: string | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string | null
  duration?: number | null
  aspectRatio?: string | null
  generateAudio?: boolean | null
  generateSubtitles?: boolean | null
}

// ── 厂商响应解析结果 ───────────────────────────────────────────

export interface VideoGenResponse {
  isAsync: boolean
  taskId?: string
  videoUrl?: string
}

export interface VideoPollResponse {
  status: AsyncTaskStatus
  videoUrl?: string
  error?: string
}

// ── 视频 Provider 适配器契约 ───────────────────────────────────

export interface VideoProviderAdapter {
  provider: string
  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest
  parseGenerateResponse(result: any): VideoGenResponse
  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest
  parsePollResponse(result: any): VideoPollResponse
  extractVideoUrl(result: any): string | null
}
