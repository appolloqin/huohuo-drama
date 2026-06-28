/**
 * 百炼万相图生视频 — DashScope 异步 video-synthesis 任务
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { VideoGenResponse, VideoPollResponse, VideoProviderAdapter } from './video-contracts.js'
import type { VideoGenerationRecord } from './video-contracts.js'
import { WAN_NO_SUBTITLE_NEGATIVE_PROMPT } from '../../../common/media/video-gen-options.js'
import { joinProviderUrl } from './url.js'

const WAN_HOST = 'https://dashscope.aliyuncs.com'
const WAN_I2V_MODEL = 'wan2.6-i2v-flash'
const WAN_I2V_SYNTH_PATH = '/services/aigc/video-generation/video-synthesis'

function pickLeadFrameUrl(clip: VideoGenerationRecord): string {
  const multi = coerceUrlArray(clip.referenceImageUrls)
  const candidates = [clip.imageUrl, clip.firstFrameUrl, multi[0]]
  return candidates.map((v) => String(v || '').trim()).find(Boolean) || ''
}

function coerceUrlArray(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((v) => String(v || '').trim()).filter(Boolean)
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed)
      ? parsed.map((v) => String(v || '').trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function tierFromAspectRatio(ratio?: string | null): string {
  if (ratio === '9:16' || ratio === '1:1' || ratio === '3:4' || ratio === '2:3') return '720P'
  return '1080P'
}

function flattenWanFailure(payload: any): string {
  const out = payload?.output || {}
  return [out.message, out.code, payload?.message, payload?.code]
    .map((line) => (typeof line === 'string' ? line.trim() : ''))
    .filter(Boolean)
    .join(' | ')
}

function translateWanTaskPhase(
  raw?: string,
): 'completed' | 'failed' | 'processing' | 'pending' {
  if (raw === 'SUCCEEDED') return 'completed'
  if (raw === 'FAILED') return 'failed'
  if (raw === 'PENDING' || raw === 'RUNNING') return 'processing'
  return 'pending'
}

export class AliVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'ali'

  // ── 提交图生视频 ───────────────────────────────────────────

  buildGenerateRequest(cfg: AIConfig, clip: VideoGenerationRecord): ProviderRequest {
    const host = cfg.baseUrl || WAN_HOST
    const leadFrame = pickLeadFrameUrl(clip)
    if (!leadFrame) {
      throw new Error(
        '图生视频缺少首帧图：请为镜头生成首帧/尾帧，或提供 image_url / first_frame_url；多参考图模式下需至少一张可访问的图片 URL',
      )
    }

    const inputNode: Record<string, unknown> = { prompt: clip.prompt, img_url: leadFrame }
    if (clip.lastFrameUrl) inputNode.last_img_url = clip.lastFrameUrl

    return {
      url: joinProviderUrl(host, '/api/v1', WAN_I2V_SYNTH_PATH),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: {
        model: clip.model || WAN_I2V_MODEL,
        input: inputNode,
        parameters: {
          resolution: tierFromAspectRatio(clip.aspectRatio ?? '16:9'),
          duration: clip.duration || 5,
          watermark: false,
          seed: Math.floor(Math.random() * 2147483647),
          ...(clip.generateAudio === false ? { audio: false } : {}),
          ...(clip.generateSubtitles === false
            ? {
              prompt_extend: false,
              negative_prompt: WAN_NO_SUBTITLE_NEGATIVE_PROMPT,
            }
            : {}),
        },
      },
    }
  }

  parseGenerateResponse(vendorJson: any): VideoGenResponse {
    const output = vendorJson?.output
    const asyncKey = output?.task_id

    if (output?.task_status === 'PENDING' && asyncKey) {
      return { isAsync: true, taskId: asyncKey }
    }
    if (output?.video_url) {
      return { isAsync: false, videoUrl: output.video_url }
    }
    throw new Error(`Unexpected Ali video response: ${JSON.stringify(vendorJson).slice(0, 200)}`)
  }

  // ── 轮询异步任务 ───────────────────────────────────────────

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    const host = cfg.baseUrl || WAN_HOST
    return {
      url: joinProviderUrl(host, '/api/v1', `/tasks/${asyncKey}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: undefined,
    }
  }

  parsePollResponse(vendorJson: any): VideoPollResponse {
    const output = vendorJson?.output
    const phase = translateWanTaskPhase(output?.task_status)

    if (phase === 'completed') {
      return { status: 'completed', videoUrl: output?.video_url }
    }
    if (phase === 'failed') {
      return { status: 'failed', error: flattenWanFailure(vendorJson) || 'Video generation failed' }
    }
    return { status: phase }
  }

  extractVideoUrl(vendorJson: any): string | null {
    return vendorJson?.output?.video_url || null
  }
}
