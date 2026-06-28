// ── Adapter 层共享类型（HTTP 出站与 AI 配置快照）────────────────

export type AsyncTaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ProviderRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: any
}

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface TtsAudioPayload {
  audioHex: string
  audioLength: number
  sampleRate: number
  bitrate: number
  format: string
  channel: number
}
