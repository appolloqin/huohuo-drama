/**
 * Provider Adapter 注册表 — 按 serviceType 懒加载，未知厂商回退 minimax
 */
import { MiniMaxImageAdapter } from './minimax-image.js'
import { MiniMaxVideoAdapter } from './minimax-video.js'
import { MiniMaxTTSAdapter } from './minimax-tts.js'
import { OpenAIImageAdapter } from './openai-image.js'
import { GeminiImageAdapter } from './gemini-image.js'
import { VolcEngineImageAdapter } from './volcengine-image.js'
import { VolcEngineVideoAdapter } from './volcengine-video.js'
import { ViduVideoAdapter } from './vidu-video.js'
import { AliImageAdapter } from './ali-image.js'
import { AliVideoAdapter } from './ali-video.js'
import { AliTTSAdapter } from './ali-tts.js'
import type { ImageProviderAdapter, TTSProviderAdapter, VideoProviderAdapter } from './types.js'

const DEFAULT_VENDOR_SLUG = 'minimax'

class VendorAdapterRegistry {
  private imageMap?: Record<string, ImageProviderAdapter>
  private videoMap?: Record<string, VideoProviderAdapter>
  private ttsMap?: Record<string, TTSProviderAdapter>

  // ── 懒加载实例池 ───────────────────────────────────────────

  getImageAdapterPool() {
    return this.ensureImageAdapterPool()
  }

  getVideoAdapterPool() {
    return this.ensureVideoAdapterPool()
  }

  getTtsAdapterPool() {
    return this.ensureTtsAdapterPool()
  }

  private ensureImageAdapterPool() {
    return (this.imageMap ??= {
      minimax: new MiniMaxImageAdapter(),
      openai: new OpenAIImageAdapter(),
      gemini: new GeminiImageAdapter(),
      volcengine: new VolcEngineImageAdapter(),
      ali: new AliImageAdapter(),
      huohuo: new OpenAIImageAdapter(),
    })
  }

  private ensureVideoAdapterPool() {
    return (this.videoMap ??= {
      minimax: new MiniMaxVideoAdapter(),
      volcengine: new VolcEngineVideoAdapter(),
      vidu: new ViduVideoAdapter(),
      ali: new AliVideoAdapter(),
    })
  }

  private ensureTtsAdapterPool() {
    return (this.ttsMap ??= {
      minimax: new MiniMaxTTSAdapter(),
      ali: new AliTTSAdapter(),
    })
  }

  // ── 按 provider 解析（未知则回退）────────────────────────────

  pickVendorOrFallback<T>(pool: Record<string, T>, vendorKey: string): T {
    const normalized = vendorKey.toLowerCase()
    return pool[normalized] ?? pool[DEFAULT_VENDOR_SLUG]
  }

  image(vendorKey: string) {
    return this.pickVendorOrFallback(this.ensureImageAdapterPool(), vendorKey)
  }

  video(vendorKey: string) {
    return this.pickVendorOrFallback(this.ensureVideoAdapterPool(), vendorKey)
  }

  tts(vendorKey: string) {
    return this.pickVendorOrFallback(this.ensureTtsAdapterPool(), vendorKey)
  }
}

const adapterRegistry = new VendorAdapterRegistry()

export const imageAdapters = adapterRegistry.getImageAdapterPool()
export const videoAdapters = adapterRegistry.getVideoAdapterPool()
export const ttsAdapters = adapterRegistry.getTtsAdapterPool()

export function getImageAdapter(vendorKey: string): ImageProviderAdapter {
  return adapterRegistry.image(vendorKey)
}

export function getVideoAdapter(vendorKey: string): VideoProviderAdapter {
  return adapterRegistry.video(vendorKey)
}

export function getTTSAdapter(vendorKey: string): TTSProviderAdapter {
  return adapterRegistry.tts(vendorKey)
}

export const supportedVendorSlugs = {
  image: Object.keys(imageAdapters),
  video: Object.keys(videoAdapters),
  tts: Object.keys(ttsAdapters),
}
