import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import { now } from '../../common/http/response.js'
import { toSnakeCase } from '../../common/http/transform.js'
import { generateTTS } from '../media/tts-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { validateStoryboardBindings } from '../../common/drama/storyboard-bindings.js'
import { linkCharactersToEpisode } from '../../common/drama/episode-links.js'
import { parseDialogueForTTS } from './compose-dialogue.js'

const STORYBOARD_FIELD_MAP: Record<string, string> = {
  title: 'title',
  description: 'description',
  shot_type: 'shotType',
  angle: 'angle',
  movement: 'movement',
  action: 'action',
  dialogue: 'dialogue',
  duration: 'duration',
  video_prompt: 'videoPrompt',
  image_prompt: 'imagePrompt',
  scene_id: 'sceneId',
  location: 'location',
  time: 'time',
  atmosphere: 'atmosphere',
  result: 'result',
  bgm_prompt: 'bgmPrompt',
  sound_effect: 'soundEffect',
  reference_images: 'referenceImages',
}

export async function listStoryboardCharacterIds(storyboardId: number) {
  return storyboardsRepo.listStoryboardCharacterIds(storyboardId)
}

export async function createStoryboardRecord(body: {
  episode_id: number
  storyboard_number?: number
  title?: string
  description?: string
  action?: string
  dialogue?: string
  scene_id?: number
  duration?: number
  character_ids?: number[]
}) {
  logTaskStart('StoryboardAPI', 'create', {
    episodeId: body.episode_id,
    shotNumber: body.storyboard_number || 1,
    sceneId: body.scene_id,
    characterIds: body.character_ids,
  })
  logTaskPayload('StoryboardAPI', 'create body', body)
  await validateStoryboardBindings(body.episode_id, body.scene_id, body.character_ids)

  const ts = now()
  const res = await storyboardsRepo.insertStoryboard({
    episodeId: body.episode_id,
    storyboardNumber: body.storyboard_number || 1,
    title: body.title,
    description: body.description,
    action: body.action,
    dialogue: body.dialogue,
    sceneId: body.scene_id,
    duration: body.duration || 10,
    createdAt: ts,
    updatedAt: ts,
  })

  const storyboardId = res.lastInsertRowid
  await storyboardsRepo.replaceStoryboardCharacters(storyboardId, body.character_ids || [])
  await linkCharactersToEpisode(body.episode_id, body.character_ids || [])

  const result = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!result) throw new Error('创建分镜失败')
  logTaskSuccess('StoryboardAPI', 'create', {
    storyboardId: result.id,
    episodeId: result.episodeId,
    shotNumber: result.storyboardNumber,
  })

  return {
    ...toSnakeCase(result),
    character_ids: await listStoryboardCharacterIds(result.id),
  }
}

export async function updateStoryboardRecord(
  storyboardId: number,
  episodeId: number,
  currentSceneId: number | null | undefined,
  body: Record<string, any>,
) {
  logTaskStart('StoryboardAPI', 'update', {
    storyboardId,
    episodeId,
    fields: Object.keys(body),
  })
  logTaskPayload('StoryboardAPI', 'update body', body)

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(STORYBOARD_FIELD_MAP)) {
    if (snakeKey in body) updates[camelKey] = body[snakeKey]
  }

  if ('dialogue' in body) {
    updates.ttsAudioUrl = null
    updates.subtitleUrl = null
  }

  await validateStoryboardBindings(
    episodeId,
    'scene_id' in body ? body.scene_id : currentSceneId,
    'character_ids' in body ? body.character_ids : await listStoryboardCharacterIds(storyboardId),
  )

  await storyboardsRepo.updateStoryboard(storyboardId, updates)

  if ('character_ids' in body) {
    await storyboardsRepo.replaceStoryboardCharacters(storyboardId, body.character_ids || [])
    await linkCharactersToEpisode(episodeId, body.character_ids || [])
  }

  logTaskSuccess('StoryboardAPI', 'update', {
    storyboardId,
    updatedFields: Object.keys(updates),
    characterIds: body.character_ids,
  })
}

async function resolveVoiceForSpeaker(episodeId: number, speaker: string): Promise<string> {
  let voiceId = 'alloy'
  if (!speaker || /^(旁白|画外音|narrator)$/i.test(speaker)) return voiceId

  const ep = await episodesRepo.findEpisodeById(episodeId)
  if (!ep) return voiceId

  const chars = await dramasRepo.listCharactersByDrama(ep.dramaId)
  const found = chars.find((char) => char.name === speaker)
  return found?.voiceId || voiceId
}

export async function synthesizeStoryboardTTS(
  storyboard: {
    id: number
    episodeId: number
    dialogue?: string | null
  },
  configOpts?: { userId: number; role: string },
) {
  const parsedDialogue = parseDialogueForTTS(storyboard.dialogue)
  if (parsedDialogue.ignorable) {
    throw new Error('该镜头没有可生成的对白或旁白')
  }

  logTaskStart('StoryboardAPI', 'generate-tts', {
    storyboardId: storyboard.id,
    episodeId: storyboard.episodeId,
    dialoguePreview: (storyboard.dialogue || '').slice(0, 40),
  })
  logTaskPayload('StoryboardAPI', 'generate-tts input', {
    storyboardId: storyboard.id,
    episodeId: storyboard.episodeId,
    dialogue: storyboard.dialogue,
  })

  const voiceId = await resolveVoiceForSpeaker(storyboard.episodeId, parsedDialogue.speaker)
  const pureDialogue = parsedDialogue.pureText
  if (!pureDialogue) throw new Error('未提取到可合成的文本')

  const ep = await episodesRepo.findEpisodeById(storyboard.episodeId)
  try {
    const audioPath = await generateTTS({
      text: pureDialogue,
      voice: voiceId,
      configId: ep?.dramaAudioConfigId || null,
      configOpts,
    })

    await storyboardsRepo.updateStoryboard(storyboard.id, { ttsAudioUrl: audioPath, updatedAt: now() })

    logTaskSuccess('StoryboardAPI', 'generate-tts', {
      storyboardId: storyboard.id,
      voiceId,
      path: audioPath,
      textLength: pureDialogue.length,
    })

    return { tts_audio_url: audioPath, voice_id: voiceId, text: pureDialogue }
  } catch (err: any) {
    logTaskError('StoryboardAPI', 'generate-tts', {
      storyboardId: storyboard.id,
      voiceId,
      error: err.message,
    })
    throw err
  }
}

export async function removeStoryboardRecord(storyboardId: number) {
  logTaskStart('StoryboardAPI', 'delete', { storyboardId })
  await storyboardsRepo.deleteStoryboardCharactersByStoryboard(storyboardId)
  await storyboardsRepo.deleteStoryboard(storyboardId)
  logTaskSuccess('StoryboardAPI', 'delete', { storyboardId })
}
