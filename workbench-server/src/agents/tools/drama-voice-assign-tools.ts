/**
 * 角色音色分配 Mastra 工具集
 */
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import * as aiServiceConfigsRepo from '../../db/repos/ai-service-configs/index.js'
import * as aiVoicesRepo from '../../db/repos/ai-voices/index.js'
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { joinProviderUrl } from '../../services/ai/adapters/url.js'
import { inferVoiceLanguage, shouldKeepVoice } from '../../services/media/voice-catalog-service.js'
import { logTaskProgress, logTaskSuccess } from '../../common/task/task-logger.js'
import { now } from '../../common/http/response.js'

function normalizeVoiceIdentity(provider: string, voiceId: string, voiceName?: string) {
  const idRaw = String(voiceId || '').trim()
  const nameRaw = String(voiceName || '').trim()
  if (provider !== 'ali') {
    return { id: idRaw, name: nameRaw || idRaw }
  }
  const raw = (idRaw || nameRaw).trim()
  if (!raw) return { id: 'Cherry', name: 'Cherry' }
  if (['Cherry', 'Serena', 'Ethan', 'Chelsie', 'Dylan', 'Jada', 'Sunny'].includes(raw)) {
    return { id: raw, name: raw }
  }
  const lower = raw.toLowerCase()
  if (lower === 'echo' || lower === 'onyx') return { id: 'Ethan', name: 'Ethan' }
  if (lower === 'fable') return { id: 'Dylan', name: 'Dylan' }
  if (lower === 'nova' || lower === 'shimmer') return { id: 'Serena', name: 'Serena' }
  if (lower === 'alloy') return { id: 'Sunny', name: 'Sunny' }
  return { id: 'Cherry', name: 'Cherry' }
}

function staticVoiceFallbackRows(provider: string) {
  if (provider === 'ali') {
    return [
      { id: 'Ethan', name: 'Ethan', gender: '男声', traits: '沉稳自然', suitable_for: '成熟男性、旁白', language: '中文', provider },
      { id: 'Dylan', name: 'Dylan', gender: '男声', traits: '年轻清晰', suitable_for: '青年男性、叙述', language: '中文', provider },
      { id: 'Serena', name: 'Serena', gender: '女声', traits: '温柔亲和', suitable_for: '女主、温柔角色', language: '中文', provider },
      { id: 'Chelsie', name: 'Chelsie', gender: '女声', traits: '明亮活泼', suitable_for: '少女、活泼角色', language: '中文', provider },
      { id: 'Jada', name: 'Jada', gender: '女声', traits: '成熟干练', suitable_for: '御姐、职场角色', language: '中文', provider },
      { id: 'Cherry', name: 'Cherry', gender: '中性', traits: '平衡通用', suitable_for: '通用角色', language: '中文', provider },
      { id: 'Sunny', name: 'Sunny', gender: '中性', traits: '轻快自然', suitable_for: '轻松风格', language: '中文', provider },
    ]
  }
  return [
    { id: 'alloy', name: 'Alloy', gender: '中性', traits: '平衡自然', suitable_for: '旁白、通用', language: '多语言', provider },
    { id: 'echo', name: 'Echo', gender: '男声', traits: '低沉稳重', suitable_for: '成熟男性、旁白', language: '多语言', provider },
    { id: 'fable', name: 'Fable', gender: '男声', traits: '温暖富有表现力', suitable_for: '年轻男性、故事叙述', language: '多语言', provider },
    { id: 'onyx', name: 'Onyx', gender: '男声', traits: '深沉有力', suitable_for: '权威角色、反派', language: '多语言', provider },
    { id: 'nova', name: 'Nova', gender: '女声', traits: '温柔甜美', suitable_for: '年轻女性、女主', language: '多语言', provider },
    { id: 'shimmer', name: 'Shimmer', gender: '女声', traits: '明亮活泼', suitable_for: '活泼女性、少女', language: '多语言', provider },
  ]
}

async function loadOrFetchProviderVoices(provider: string) {
  let rows = await aiVoicesRepo.listAiVoicesByProvider(provider)
  if (rows.length || provider !== 'minimax') return rows

  const configRows = (await aiServiceConfigsRepo.listServiceConfigsByType('audio'))
    .filter(r => r.isActive && r.provider === 'minimax')
  if (!configRows.length || !configRows[0].apiKey) return rows

  const config = configRows[0]
  const resp = await fetch(joinProviderUrl(config.baseUrl, '/v1', '/get_voice'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ voice_type: 'all' }),
  })
  if (!resp.ok) return rows

  const result = await resp.json() as any
  if (result.base_resp?.status_code !== 0) return rows

  const voices = (result.system_voice || []).filter((v: any) => shouldKeepVoice(v))
  if (!voices.length) return rows

  const ts = now()
  await aiVoicesRepo.deleteAiVoicesByProvider('minimax')
  await aiVoicesRepo.insertAiVoices(voices.map((v: any) => ({
    voiceId: v.voice_id,
    voiceName: v.voice_name,
    description: JSON.stringify(v.description || []),
    language: inferVoiceLanguage(v.voice_id, v.voice_name),
    provider: 'minimax',
    createdAt: ts,
  })))

  rows = await aiVoicesRepo.listAiVoicesByProvider(provider)
  return rows
}

async function resolveAudioProviderKey(configId?: number | null) {
  if (configId) {
    const config = await aiServiceConfigsRepo.findServiceConfigById(configId)
    if (config?.provider) return config.provider
  }
  const activeAudioConfigs = (await aiServiceConfigsRepo.listServiceConfigsByType('audio'))
    .filter(r => r.isActive)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  return activeAudioConfigs[0]?.provider || null
}

export async function buildDramaVoiceAssignToolkit(episodeId: number, dramaId: number) {
  async function readEpisodeAudioProvider() {
    const episodeRow = await episodesRepo.findEpisodeById(episodeId)
    return resolveAudioProviderKey(episodeRow?.dramaAudioConfigId)
  }

  const pullCastVoiceStateTool = createTool({
    id: 'pull_cast_voice_state',
    description: 'Get all characters for the current drama with their current voice assignments.',
    inputSchema: z.object({}),
    execute: async () => {
      const chars = await charactersRepo.listCharactersByDrama(dramaId)
      const payload = {
        characters: chars.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          personality: c.personality,
          description: c.description,
          current_voice: c.voiceId || '未分配',
        })),
      }
      logTaskSuccess('VoiceTool', 'pull-cast-voice-state', { episodeId, dramaId, count: payload.characters.length })
      return payload
    },
  })

  const listTtsVoiceCatalogTool = createTool({
    id: 'list_tts_voice_catalog',
    description: 'List all available voice options for TTS.',
    inputSchema: z.object({}),
    execute: async () => {
      const provider = (await readEpisodeAudioProvider()) || 'minimax'
      const rows = await loadOrFetchProviderVoices(provider)
      const voices = rows.length ? rows.map(v => {
        const normalized = normalizeVoiceIdentity(provider, v.voiceId, v.voiceName)
        const desc = v.description ? JSON.parse(v.description) : []
        return {
          id: normalized.id,
          name: normalized.name,
          gender: inferCastGenderBucket(normalized.name, desc),
          traits: Array.isArray(desc) && desc.length ? desc.slice(0, 2).join('、') : `${v.language || '多语言'}音色`,
          suitable_for: Array.isArray(desc) && desc.length > 2 ? desc.slice(2).join('、') : `${v.language || '通用'}角色`,
          language: v.language,
          provider,
        }
      }) : staticVoiceFallbackRows(provider)

      const payload = {
        provider,
        voices: Array.from(new Map(voices.map(v => [v.id, v])).values()),
        instruction: '根据角色的性别、性格、年龄来匹配最合适的音色，并且只能从当前集音频配置可用的音色列表中选择。',
      }
      logTaskSuccess('VoiceTool', 'list-tts-voice-catalog', { episodeId, provider, count: payload.voices.length })
      return payload
    },
  })

  const applyCastVoiceMappingTool = createTool({
    id: 'apply_cast_voice_mapping',
    description: 'Assign a voice to a character.',
    inputSchema: z.object({
      character_id: z.number().describe('Character ID'),
      voice_id: z.string().describe('Voice ID from list_tts_voice_catalog'),
      reason: z.string().optional().describe('Why this voice fits'),
    }),
    execute: async ({ character_id, voice_id, reason }) => {
      const provider = (await readEpisodeAudioProvider()) || 'minimax'
      logTaskProgress('VoiceTool', 'apply-cast-voice-mapping-begin', { episodeId, dramaId, characterId: character_id, voiceId: voice_id, provider, reason })
      await charactersRepo.updateCharacter(character_id, {
        voiceId: voice_id,
        voiceProvider: provider,
        voicePreviewUrl: null,
        updatedAt: now(),
      })
      logTaskSuccess('VoiceTool', 'apply-cast-voice-mapping-complete', { episodeId, characterId: character_id, voiceId: voice_id, provider })
      return { message: `Assigned voice "${voice_id}" to character ${character_id}`, reason }
    },
  })

  return {
    pullCastVoiceState: pullCastVoiceStateTool,
    listTtsVoiceCatalog: listTtsVoiceCatalogTool,
    applyCastVoiceMapping: applyCastVoiceMappingTool,
  }
}

export async function assignDramaVoicesByHeuristic(episodeId: number, dramaId: number) {
  const episodeRow = await episodesRepo.findEpisodeById(episodeId)
  const provider = (await resolveAudioProviderKey(episodeRow?.dramaAudioConfigId)) || 'minimax'

  const voices = await loadOrFetchProviderVoices(provider)
  const candidates = voices.length
    ? voices.map(v => ({
        ...normalizeVoiceIdentity(provider, v.voiceId, v.voiceName),
        gender: inferCastGenderBucket(v.voiceName, v.description ? JSON.parse(v.description) : []),
      }))
    : staticVoiceFallbackRows(provider).map(v => ({ id: v.id, name: v.name, gender: v.gender }))
  const uniqueVoiceCandidates = Array.from(new Map(candidates.map(v => [v.id, v])).values())

  const male = uniqueVoiceCandidates.filter(v => v.gender === '男声')
  const female = uniqueVoiceCandidates.filter(v => v.gender === '女声')
  const neutral = uniqueVoiceCandidates.filter(v => v.gender === '中性')
  const all = uniqueVoiceCandidates.length ? uniqueVoiceCandidates : [{ id: 'alloy', name: 'Alloy', gender: '中性' }]

  const chars = await charactersRepo.listCharactersByDrama(dramaId)
  let maleIdx = 0
  let femaleIdx = 0
  let neutralIdx = 0
  let allIdx = 0

  const assignments = []
  for (const char of chars) {
    const profile = `${char.name || ''} ${char.role || ''} ${char.personality || ''} ${char.description || ''}`
    const inferredCastGender = inferCastGenderBucket(profile, [])

    const picked = inferredCastGender === '男声' && male.length
      ? male[maleIdx++ % male.length]
      : inferredCastGender === '女声' && female.length
        ? female[femaleIdx++ % female.length]
        : neutral.length
          ? neutral[neutralIdx++ % neutral.length]
          : all[allIdx++ % all.length]

    const reason = `根据角色特征判定为${inferredCastGender}，匹配${picked.gender}音色`
    await charactersRepo.updateCharacter(char.id, {
      voiceId: picked.id,
      voiceProvider: provider,
      voicePreviewUrl: null,
      updatedAt: now(),
    })

    assignments.push({
      character_id: char.id,
      character_name: char.name,
      voice_id: picked.id,
      voice_name: picked.name,
      reason,
    })
  }

  return { provider, assignments, count: assignments.length }
}

function inferCastGenderBucket(name: string, desc: unknown) {
  const description = Array.isArray(desc) ? desc.join(' ') : ''
  const text = `${name} ${description}`
  if (/[男|青年|大爷|学长|boy|man|male]/i.test(text)) return '男声'
  if (/[女|少女|御姐|奶奶|girl|woman|female]/i.test(text)) return '女声'
  return '中性'
}
