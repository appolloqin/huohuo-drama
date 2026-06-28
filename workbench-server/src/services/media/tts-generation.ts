/**
 * TTS 语音合成编排
 */
import { logTaskPayload, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { byteLengthFromHex, storeTtsHexAudio } from './tts-audio-persistence.js'
import { callTtsProvider, type TtsSynthesisInput } from './tts-provider-client.js'

export type { TtsSynthesisInput }

export async function generateTTS(params: TtsSynthesisInput): Promise<string> {
  logTaskStart('AudioTask', 'tts-generate', {
    voice: params.voice,
    model: params.model,
    textPreview: params.text.slice(0, 50),
    textLength: params.text.length,
  })
  logTaskPayload('AudioTask', 'tts params', { params })

  const { config, payload } = await callTtsProvider(params)
  const relativePath = storeTtsHexAudio(payload)

  logTaskSuccess('AudioTask', 'tts-saved', {
    provider: config.provider,
    voice: params.voice,
    path: relativePath,
    bytes: byteLengthFromHex(payload.audioHex),
    audioMs: payload.audioLength,
  })

  return relativePath
}

export function generateVoiceSample(
  characterName: string,
  voiceId: string,
  configId?: number | null,
): Promise<string> {
  const sampleText = `你好，我是${characterName}。很高兴认识你，这是我的声音试听。`
  return generateTTS({ text: sampleText, voice: voiceId, configId })
}
