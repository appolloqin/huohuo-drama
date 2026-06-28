// ── 共享基础类型（自 adapter-shared 再导出）──────────────────
export type {
  AIConfig,
  AsyncTaskStatus,
  ProviderRequest,
  TtsAudioPayload,
} from './adapter-shared.js'

// ── 图片生成契约 ─────────────────────────────────────────────
export type {
  ImageGenResponse,
  ImageGenerationRecord,
  ImagePollResponse,
  ImageProviderAdapter,
} from './image-contracts.js'

// ── 视频生成契约 ─────────────────────────────────────────────
export type {
  VideoGenResponse,
  VideoGenerationRecord,
  VideoPollResponse,
  VideoProviderAdapter,
} from './video-contracts.js'

// ── 语音合成契约 ─────────────────────────────────────────────
export type { TTSProviderAdapter } from './tts-contracts.js'
