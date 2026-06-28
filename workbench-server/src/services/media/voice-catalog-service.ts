import * as aiServiceConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import * as aiVoicesRepo from '../../db/repos/ai-voices/index.js'
import { now } from '../../common/http/response.js'
import { joinProviderUrl } from '../../common/http/provider-url.js'

const LANGUAGE_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /cantonese|粤/i, label: '粤语' },
  { pattern: /english|aussie/i, label: '英语' },
  { pattern: /japanese|日语/i, label: '日语' },
  { pattern: /korean|韩/i, label: '韩语' },
  { pattern: /spanish/i, label: '西班牙语' },
  { pattern: /portuguese/i, label: '葡萄牙语' },
  { pattern: /french/i, label: '法语' },
  { pattern: /indonesian/i, label: '印尼语' },
  { pattern: /german/i, label: '德语' },
  { pattern: /russian/i, label: '俄语' },
  { pattern: /italian/i, label: '意大利语' },
  { pattern: /arabic/i, label: '阿拉伯语' },
  { pattern: /turkish/i, label: '土耳其语' },
  { pattern: /ukrainian/i, label: '乌克兰语' },
  { pattern: /dutch/i, label: '荷兰语' },
  { pattern: /vietnamese/i, label: '越南语' },
  { pattern: /chinese|mandarin|中文/i, label: '中文' },
]

const EXCLUDED_VOICE_PATTERNS = [
  'jingpin',
  '-beta',
  'cartoon_pig',
  'cute_boy',
  'lovely_girl',
  'clever_boy',
  'robot_armor',
  'news_anchor',
  'male_announcer',
  'radio_host',
  'hk_flight_attendant',
]

export function inferVoiceLanguage(voiceId: string, voiceName: string): string {
  const haystack = `${voiceId} ${voiceName}`
  for (const hint of LANGUAGE_HINTS) {
    if (hint.pattern.test(haystack)) return hint.label
  }
  return '其他'
}

export function shouldKeepVoice(voice: { voice_id: string; voice_name: string }) {
  const language = inferVoiceLanguage(voice.voice_id, voice.voice_name)
  if (language !== '中文' && language !== '粤语') return false

  const text = `${voice.voice_id} ${voice.voice_name}`.toLowerCase()
  return !EXCLUDED_VOICE_PATTERNS.some(pattern => text.includes(pattern))
}

export async function listVoicesByProvider(provider: string) {
  const rows = await aiVoicesRepo.listAiVoicesByProvider(provider)
  return rows.map(row => ({
    voice_id: row.voiceId,
    voice_name: row.voiceName,
    description: row.description ? JSON.parse(row.description) : [],
    language: row.language,
    provider: row.provider,
  }))
}

export async function syncMiniMaxVoices() {
  const configs = await aiServiceConfigsRepo.listServiceConfigsByType('audio')
  const config = configs.find(row => row.isActive && row.provider === 'minimax')

  if (!config) {
    return { ok: false as const, error: 'No active minimax audio config found' }
  }
  if (!config.apiKey) {
    return { ok: false as const, error: 'MiniMax API key not configured' }
  }

  const response = await fetch(joinProviderUrl(config.baseUrl, '/v1', '/get_voice'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ voice_type: 'all' }),
  })

  if (!response.ok) {
    return { ok: false as const, error: `MiniMax API error: ${response.status}` }
  }

  const payload = await response.json() as any
  if (payload.base_resp?.status_code !== 0) {
    return { ok: false as const, error: payload.base_resp?.status_msg || 'Failed to fetch voices' }
  }

  const voices = (payload.system_voice || []).filter((voice: any) => shouldKeepVoice(voice))
  const timestamp = now()

  await aiVoicesRepo.deleteAiVoicesByProvider('minimax')

  const rows = voices.map((voice: any) => ({
    voiceId: voice.voice_id,
    voiceName: voice.voice_name,
    description: JSON.stringify(voice.description || []),
    language: inferVoiceLanguage(voice.voice_id, voice.voice_name),
    provider: 'minimax',
    createdAt: timestamp,
  }))

  await aiVoicesRepo.insertAiVoices(rows)

  return {
    ok: true as const,
    count: rows.length,
    message: `Synced ${rows.length} voices`,
  }
}
