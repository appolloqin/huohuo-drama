/**
 * 阿里云 DashScope Qwen-TTS — multimodal-generation 同步返回音频 URL
 * API: POST /api/v1/services/aigc/multimodal-generation/generation
 */
import type { TTSProviderAdapter } from './types.js'
import { joinProviderUrl } from './url.js'

const QWEN_TTS_VOICE_PRESETS = ['Cherry', 'Serena', 'Ethan', 'Chelsie', 'Dylan', 'Jada', 'Sunny'] as const

function pickQwenTtsModel(model?: string) {
  const raw = String(model || '').trim()
  if (!raw) return 'qwen-tts-latest'
  const lower = raw.toLowerCase()
  if (lower.includes('realtime')) return 'qwen-tts-latest'
  if (!lower.includes('tts')) return 'qwen-tts-latest'
  return raw
}

function mapVoiceToAliPreset(voice?: string) {
  const raw = String(voice || '').trim()
  if (!raw) return 'Cherry'
  if (QWEN_TTS_VOICE_PRESETS.includes(raw as any)) return raw

  const lower = raw.toLowerCase()
  return (
    lower === 'echo' || lower === 'onyx' ? 'Ethan'
      : lower === 'fable' ? 'Dylan'
        : lower === 'nova' || lower === 'shimmer' ? 'Serena'
          : lower === 'alloy' ? 'Sunny'
            : 'Cherry'
  )
}

function sniffAudioFormat(contentType: string): 'wav' | 'aac' | 'mp3' {
  const ct = contentType.toLowerCase()
  if (ct.includes('wav')) return 'wav'
  if (ct.includes('aac')) return 'aac'
  return 'mp3'
}

function packHexAudio(buffer: Buffer, format: string) {
  return {
    audioHex: buffer.toString('hex'),
    audioLength: 0,
    sampleRate: 32000,
    bitrate: 128000,
    format,
    channel: 1,
  }
}

export class AliTTSAdapter implements TTSProviderAdapter {
  readonly provider = 'ali'

  buildGenerateRequest(config: any, params: any) {
    const url = joinProviderUrl(config.baseUrl, '/api/v1', '/services/aigc/multimodal-generation/generation')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    }

    const body = {
      model: pickQwenTtsModel(params.model || config.model),
      input: {
        text: params.text,
        voice: mapVoiceToAliPreset(params.voice),
        language_type: 'Chinese',
      },
    }

    return { url, method: 'POST', headers, body }
  }

  async parseHttpResponse(resp: Response) {
    const vendorJson = await resp.json()
    const remoteAudioUrl = vendorJson?.output?.audio?.url
    if (!remoteAudioUrl || typeof remoteAudioUrl !== 'string') {
      const code = vendorJson?.code || 'UnknownError'
      const message = vendorJson?.message || 'No output.audio.url in response'
      throw new Error(`${code}: ${message}`)
    }

    const audioResp = await fetch(remoteAudioUrl)
    if (!audioResp.ok) {
      const text = await audioResp.text()
      throw new Error(`Download audio failed ${audioResp.status}: ${text.slice(0, 200)}`)
    }

    const contentType = audioResp.headers.get('content-type') || ''
    const audioBuffer = Buffer.from(await audioResp.arrayBuffer())
    if (!audioBuffer.length) {
      throw new Error('No audio data in response')
    }

    return packHexAudio(audioBuffer, sniffAudioFormat(contentType))
  }

  parseResponse(vendorJson: any) {
    const inlineBase64 = vendorJson?.output?.audio?.data
    if (!inlineBase64 || typeof inlineBase64 !== 'string') {
      throw new Error('Unsupported TTS response format')
    }

    return packHexAudio(Buffer.from(inlineBase64, 'base64'), 'mp3')
  }
}
