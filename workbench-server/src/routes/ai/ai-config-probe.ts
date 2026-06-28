/**
 * AI 厂商连通性探测请求构造
 */
import { joinProviderUrl } from '../../services/ai/adapters/url.js'
import { logTaskError, logTaskProgress, logTaskSuccess, redactUrl } from '../../common/task/task-logger.js'

export type ConnectivityProbeSpec = {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

function bearerAuthHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiApiKeyHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function viduBearerTokenHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Token ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function resolveAliTtsProbeModel(model?: string) {
  const raw = String(model || '').trim()
  if (!raw) return 'qwen-tts-latest'
  const lower = raw.toLowerCase()
  if (lower.includes('realtime')) return 'qwen-tts-latest'
  if (!lower.includes('tts')) return 'qwen-tts-latest'
  return raw
}

export function buildProviderProbeSpec(
  serviceType: string,
  provider: string,
  baseUrl: string,
  model?: string,
  apiKey?: string,
): ConnectivityProbeSpec {
  const p = provider.toLowerCase()
  const m = model || ''
  const textModel = m || 'gpt-4o-mini'
  const imageModel = m || 'qwen-image-max'
  const videoModel = m || 'wan2.6-i2v-flash'
  const demoImageUrl = 'https://picsum.photos/640/360'

  if (p === 'gemini') {
    const geminiModel = m || (serviceType === 'image' ? 'gemini-2.5-flash-image-preview' : 'gemini-2.5-flash')
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${geminiModel}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return {
      method: 'POST',
      url: url.toString(),
      headers: geminiApiKeyHeaders(apiKey, true),
      body: serviceType === 'image'
        ? {
            contents: [{ role: 'user', parts: [{ text: 'A cinematic portrait, high quality.' }] }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
              imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
            },
          }
        : {
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          },
    }
  }

  if (p === 'openai' || p === 'openrouter' || p === 'huohuo' || p === 'deepseek') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerAuthHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'ali') {
    const isText = serviceType === 'text'
    const isVideo = serviceType === 'video'
    const isAudio = serviceType === 'audio'
    if (isText) {
      return {
        method: 'GET',
        url: joinProviderUrl(baseUrl, '/compatible-mode/v1', '/models'),
        headers: bearerAuthHeaders(apiKey),
        body: undefined,
      }
    }
    if (isAudio) {
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/multimodal-generation/generation'),
        headers: bearerAuthHeaders(apiKey, true),
        body: {
          model: resolveAliTtsProbeModel(m),
          input: {
            text: '测试语音',
            voice: 'Cherry',
            language_type: 'Chinese',
          },
        },
      }
    }
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', isVideo
        ? '/services/aigc/video-generation/video-synthesis'
        : '/services/aigc/multimodal-generation/generation'),
      headers: {
        ...bearerAuthHeaders(apiKey, true),
        ...(isVideo ? { 'X-DashScope-Async': 'enable' } : {}),
      },
      body: isVideo
        ? {
            model: videoModel,
            input: {
              prompt: 'A calm ocean wave at sunset.',
              img_url: demoImageUrl,
            },
            parameters: { resolution: '720P', duration: 5, watermark: false },
          }
        : {
            model: imageModel,
            input: {
              messages: [
                {
                  role: 'user',
                  content: [{ text: 'A cinematic portrait, high quality.' }],
                },
              ],
            },
            parameters: { size: '1280*1280', n: 1, watermark: false },
          },
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerAuthHeaders(apiKey, true),
      body: serviceType === 'video'
        ? {
            model: videoModel,
            content: [{ type: 'text', text: 'A cinematic city night shot.' }],
            duration: 5,
          }
        : {
            model: imageModel,
            prompt: 'A cinematic portrait, high quality.',
          },
    }
  }

  if (p === 'minimax') {
    if (serviceType === 'text') {
      return {
        method: 'GET',
        url: joinProviderUrl(baseUrl, '/v1', '/models'),
        headers: bearerAuthHeaders(apiKey),
        body: undefined,
      }
    }
    const path = serviceType === 'audio'
      ? '/t2a_v2'
      : serviceType === 'video'
        ? '/video_generation'
        : '/image_generation'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v1', path),
      headers: bearerAuthHeaders(apiKey, true),
      body: serviceType === 'audio'
        ? {
            model: m || 'speech-2.8-hd',
            text: '测试语音',
            stream: false,
            voice_setting: {
              voice_id: 'female-tianmei',
              speed: 1,
              vol: 1,
              pitch: 0,
              emotion: 'happy',
            },
            audio_setting: {
              sample_rate: 32000,
              bitrate: 128000,
              format: 'mp3',
              channel: 1,
            },
          }
        : serviceType === 'video'
          ? {
              model: videoModel,
              content: [{ type: 'text', text: 'A cinematic shot of mountains at sunrise. --ratio 16:9 --dur 5' }],
            }
          : {
              model: imageModel,
              prompt: 'A cinematic portrait, high quality.',
              size: '1024x1024',
              n: 1,
            },
    }
  }

  if (p === 'vidu') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '', '/ent/v2/img2video'),
      headers: viduBearerTokenHeaders(apiKey, true),
      body: {
        model: m || 'viduq3-turbo',
        prompt: 'A cinematic shot, smooth camera motion.',
        images: [demoImageUrl],
        duration: 4,
        resolution: '720p',
        audio: false,
      },
    }
  }

  return {
    method: 'POST',
    url: joinProviderUrl(baseUrl, '/v1', '/chat/completions'),
    headers: bearerAuthHeaders(apiKey, true),
    body: {
      model: textModel,
      messages: [{ role: 'user', content: 'ping' }],
    },
  }
}

function urlPathEndsWithModels(urlStr: string) {
  try {
    const p = new URL(urlStr).pathname.replace(/\/+$/, '')
    return p.endsWith('/models')
  } catch {
    return false
  }
}

/** 部分网关（如 /doubao 前缀）未实现 GET /v1/models，但仍支持 OpenAI 式图片接口。 */
export function buildOpenAiImagePathProbe(baseUrl: string, model: string | undefined, apiKey?: string): ConnectivityProbeSpec {
  const imageModel = String(model || '').trim() || 'gpt-4o-mini'
  return {
    method: 'POST',
    url: joinProviderUrl(baseUrl, '/v1', '/images/generations'),
    headers: bearerAuthHeaders(apiKey, true),
    body: { model: imageModel, n: 1 },
  }
}

export function needsImageProbeFallbackOn404(
  serviceType: string,
  provider: string,
  probe: ConnectivityProbeSpec,
  status: number,
) {
  if (serviceType !== 'image') return false
  const p = provider.toLowerCase()
  if (!['openai', 'openrouter', 'huohuo', 'deepseek'].includes(p)) return false
  if (status !== 404) return false
  if (probe.method !== 'GET') return false
  return urlPathEndsWithModels(probe.url)
}

export function probeHttpStatusLooksReachable(status: number) {
  return [200, 204, 400, 401, 403, 422].includes(status)
}

export async function runProviderConnectivityProbe(input: {
  service_type: string
  provider: string
  base_url: string
  model?: string | string[]
  api_key?: string
}) {
  const model = Array.isArray(input.model) ? input.model[0] : input.model
  let probe = buildProviderProbeSpec(input.service_type, input.provider, input.base_url, model, input.api_key)
  let probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: input.service_type,
    provider: input.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    let resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    let text = await resp.text()
    let reachable = probeHttpStatusLooksReachable(resp.status)
    let probeNote: string | undefined

    if (!reachable && needsImageProbeFallbackOn404(input.service_type, input.provider, probe, resp.status)) {
      probe = buildOpenAiImagePathProbe(input.base_url, model, input.api_key)
      probeUrl = redactUrl(probe.url)
      logTaskProgress('AIConfig', 'probe-retry-openai-image', {
        serviceType: input.service_type,
        provider: input.provider,
        method: probe.method,
        url: probeUrl,
      })
      resp = await fetch(probe.url, {
        method: probe.method,
        headers: probe.headers,
        body: probe.body ? JSON.stringify(probe.body) : undefined,
      })
      text = await resp.text()
      reachable = probeHttpStatusLooksReachable(resp.status)
      if (reachable) {
        probeNote = 'GET /v1/models 返回 404 时仍可能正常：部分代理未实现 models 列表，已用 POST /v1/images/generations（缺参数）校验路径；若此处为 400/401/403 通常表示 Base URL 与鉴权可用。'
      }
    }

    const payload = {
      ok: resp.ok,
      reachable,
      status: resp.status,
      status_text: resp.statusText,
      method: probe.method,
      url: probeUrl,
      message: reachable
        ? (probeNote || (resp.ok ? '端点可访问，认证与路径基本正常' : '端点已响应，请根据状态码判断认证或路径是否正确'))
        : '端点未按预期响应，请检查 Base URL 和代理前缀',
      response_preview: text.slice(0, 240),
    }
    if (reachable) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider: input.provider,
        status: resp.status,
        url: probeUrl,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider: input.provider,
        status: resp.status,
        url: probeUrl,
      })
    }
    return payload
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', {
      provider: input.provider,
      url: probeUrl,
      error: error.message,
    })
    return {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      message: error.message || '请求失败',
      response_preview: '',
    }
  }
}
