/**
 * 快活马网关视频 — DashScope 协议外壳 + 快活马扩展字段（token plan 透传）
 * 提交：POST /api/v1/services/aigc/video-generation/video-synthesis（X-DashScope-Async: enable）
 * 查询：GET  /api/v1/tasks/{task_id}?model={model}   ← 网关要求必须带 model 参数
 *
 * 快活马 i2v 请求体（经网关实测校准，非官方万相 img_url 格式）：
 *   input.media = [{ url: 'https://...' | 'data:image/...;base64,...', type: 'first_frame' }]
 *   - media 每项必须是 { url, type? } 字典；type 目前仅接受 'first_frame'（尾帧会报
 *     Input should be 'first_frame'，多张无 type 会报 Multiple first_frame items）
 *   - url 支持 data URL（网关会转存自有 OSS），但图片分辨率必须 ≥ 300x300
 */
import type { AIConfig, ProviderRequest } from './adapter-shared.js'
import type { VideoGenResponse, VideoPollResponse, VideoProviderAdapter } from './video-contracts.js'
import type { VideoGenerationRecord } from './video-contracts.js'
import { WAN_NO_SUBTITLE_NEGATIVE_PROMPT } from '../../../common/media/video-gen-options.js'
import { joinProviderUrl } from './url.js'

const HUOHUO_VIDEO_DEFAULT_HOST = 'https://huo.hcpzy.com'
const HUOHUO_VIDEO_DEFAULT_MODEL = 'happyhorse-1.1-i2v'
const VIDEO_SYNTH_PATH = '/services/aigc/video-generation/video-synthesis'

/** 剥离 baseUrl 中的 OpenAI 风格段（/v1、/v1beta 等），得到网关源站 */
function gatewayOrigin(baseUrl: string, fallback: string): string {
  const raw = String(baseUrl || '').trim()
  if (!raw) return fallback
  try {
    const parsed = new URL(raw.replace(/\/+$/, ''))
    parsed.pathname = ''
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return raw.replace(/\/+(v\d+\w*|beta|api)$/i, '').replace(/\/+$/, '')
  }
}

function joinDashScopeUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/api/v1${path}`
}

/** data URL 标记（网关支持 data URL，会自动转存自有 OSS） */
function isDataUrl(value: string): boolean {
  return /^data:/i.test(value)
}

function pickLeadFrameUrl(clip: VideoGenerationRecord): string {
  let refs: string[] = []
  try {
    const parsed = JSON.parse(String(clip.referenceImageUrls || ''))
    if (Array.isArray(parsed)) refs = parsed.map((v) => String(v || '').trim()).filter(Boolean)
  } catch {
    /* referenceImageUrls 非 JSON 时忽略 */
  }
  const candidates = [clip.imageUrl, clip.firstFrameUrl, refs[0]]
  return candidates.map((v) => String(v || '').trim()).find(Boolean) || ''
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

export class HuohuoVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'huohuo'

  // ── 提交图生视频（快活马 media 列表 JSON 体）────────────────

  buildGenerateRequest(cfg: AIConfig, clip: VideoGenerationRecord): ProviderRequest {
    const origin = gatewayOrigin(cfg.baseUrl, HUOHUO_VIDEO_DEFAULT_HOST)
    const model = clip.model || cfg.model || HUOHUO_VIDEO_DEFAULT_MODEL
    const leadFrame = pickLeadFrameUrl(clip)
    if (!leadFrame) {
      throw new Error(
        '图生视频缺少首帧图：请为镜头生成首帧/尾帧，或提供 image_url / first_frame_url；多参考图模式下需至少一张可访问的图片 URL',
      )
    }
    // 网关实测：data URL 可用（自动转存 OSS），但分辨率必须 ≥ 300x300。
    // 项目内首帧统一压缩为 768x768 内的 data URL，满足要求；仅拒绝空引用。
    if (!isDataUrl(leadFrame) && !/^https?:\/\//i.test(leadFrame)) {
      throw new Error(`快活马视频模型首帧必须是可访问的图片 URL 或 data URL，当前值非法：${leadFrame.slice(0, 60)}`)
    }

    // 快活马 media.type 目前仅支持 first_frame（尾帧/无 type 多张均会被网关拒绝），
    // 因此只上报首帧 + 文本；尾帧通过提示词描述衔接，避免触发 Multiple first_frame 校验失败。
    const media: Array<Record<string, unknown>> = [{ url: leadFrame, type: 'first_frame' }]

    return {
      url: joinDashScopeUrl(origin, VIDEO_SYNTH_PATH),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: {
        model,
        input: {
          prompt: clip.prompt,
          media,
        },
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
    throw new Error(`Unexpected Huohuo video response: ${JSON.stringify(vendorJson).slice(0, 200)}`)
  }

  // ── 轮询异步任务（网关要求 ?model= 参数）────────────────────

  buildPollRequest(cfg: AIConfig, asyncKey: string): ProviderRequest {
    const origin = gatewayOrigin(cfg.baseUrl, HUOHUO_VIDEO_DEFAULT_HOST)
    const model = cfg.model || HUOHUO_VIDEO_DEFAULT_MODEL
    return {
      url: `${joinDashScopeUrl(origin, `/tasks/${asyncKey}`)}?model=${encodeURIComponent(model)}`,
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
