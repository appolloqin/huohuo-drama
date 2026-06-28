import type { AIConfig, ProviderRequest, TtsAudioPayload } from './adapter-shared.js'

// ── TTS Provider 适配器契约（同步音频字节流）──────────────────

export interface TTSProviderAdapter {
  provider: string
  buildGenerateRequest(config: AIConfig, params: any): ProviderRequest
  parseHttpResponse?(resp: Response): Promise<TtsAudioPayload>
  parseResponse(result: any): TtsAudioPayload
}
