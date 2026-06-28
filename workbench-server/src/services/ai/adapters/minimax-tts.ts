/**
 * 火火 — MiniMax 语音合成（hex 音频响应）
 */
import type { TTSProviderAdapter } from './types.js'
import { joinProviderUrl } from './url.js'

export interface MiniMaxUtteranceSpec {
  text: string
  voice: string
  speed?: number
  model?: string
  emotion?: string
}

export class MiniMaxTTSAdapter implements TTSProviderAdapter {
  readonly provider = 'minimax'

  buildGenerateRequest(cfg: any, utterance: MiniMaxUtteranceSpec) {
    return {
      url: joinProviderUrl(cfg.baseUrl, '/v1', '/t2a_v2'),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: utterance.model || 'speech-2.8-hd',
        text: utterance.text,
        stream: false,
        voice_setting: this.composeVoiceTuningBlock(utterance),
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        subtitle_enable: false,
      },
    }
  }

  parseResponse(vendorJson: any) {
    return this.decodeHexAudioChunk(vendorJson)
  }

  private composeVoiceTuningBlock(utterance: MiniMaxUtteranceSpec) {
    return {
      voice_id: utterance.voice,
      speed: utterance.speed ?? 1,
      vol: 1,
      pitch: 0,
      emotion: utterance.emotion || 'happy',
    }
  }

  private decodeHexAudioChunk(vendorJson: any) {
    if (vendorJson?.base_resp?.status_code !== 0) {
      throw new Error(vendorJson?.base_resp?.status_msg || 'TTS generation failed')
    }

    const chunk = vendorJson?.data
    if (!chunk?.audio) throw new Error('No audio data in response')

    const meta = chunk.extra_info || {}
    return {
      audioHex: chunk.audio,
      audioLength: meta.audio_length || 0,
      sampleRate: meta.audio_sample_rate || 32000,
      bitrate: meta.bitrate || 128000,
      format: meta.audio_format || 'mp3',
      channel: meta.audio_channel || 1,
    }
  }
}
