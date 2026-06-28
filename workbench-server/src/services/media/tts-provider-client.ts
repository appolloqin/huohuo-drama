import { getAudioConfigById } from '../ai/ai.js'
import { getTTSAdapter } from '../ai/adapters/registry.js'
import { logTaskError, logTaskPayload, logTaskProgress, redactUrl } from '../../common/task/task-logger.js'

import type { ConfigResolveOpts } from '../ai/ai.js'

export interface TtsSynthesisInput {
  text: string
  voice: string
  model?: string
  speed?: number
  emotion?: string
  configId?: number | null
  configOpts?: ConfigResolveOpts
}

export async function callTtsProvider(params: TtsSynthesisInput) {
  const config = await getAudioConfigById(params.configId, params.configOpts)
  const adapter = getTTSAdapter(config.provider)
  const request = adapter.buildGenerateRequest(config, params)

  logTaskProgress('AudioTask', 'request', {
    provider: config.provider,
    voice: params.voice,
    method: request.method,
    url: redactUrl(request.url),
    model: params.model || config.model,
  })
  logTaskPayload('AudioTask', 'request payload', {
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  })

  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  if (!response.ok) {
    const errText = await response.text()
    logTaskError('AudioTask', 'tts-generate', {
      provider: config.provider,
      voice: params.voice,
      status: response.status,
      error: errText,
    })
    throw new Error(`TTS API error ${response.status}: ${errText}`)
  }

  const payload = adapter.parseHttpResponse
    ? await adapter.parseHttpResponse(response)
    : adapter.parseResponse(await response.json())

  return { config, payload }
}
