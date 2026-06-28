import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import { now } from '../../common/http/response.js'
import { linkCharactersToEpisode } from '../../common/drama/episode-links.js'
import { validateStoryboardBindings } from '../../common/drama/storyboard-bindings.js'

export async function replaceShotCharacterLinks(storyboardId: number, characterIds: number[]) {
  await storyboardsRepo.replaceStoryboardCharacters(storyboardId, characterIds)
}

export async function assembleBreakdownContext(episodeId: number, dramaId: number) {
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode) return { ok: false as const, error: 'Episode not found' }

  const script = episode.formattedScript || episode.content
  if (!script) return { ok: false as const, error: 'Episode has no script' }

  const linkedCharacterIds = new Set(
    (await episodesRepo.listEpisodeCharacterLinks(episodeId)).map(link => link.characterId),
  )
  const linkedSceneIds = new Set(
    (await episodesRepo.listEpisodeSceneLinks(episodeId)).map(link => link.sceneId),
  )

  const storyboardIds = new Set(await storyboardsRepo.listStoryboardIdsByEpisode(episodeId))
  if (storyboardIds.size) {
    for (const link of await episodesRepo.listAllStoryboardCharacterLinks()) {
      if (storyboardIds.has(link.storyboardId)) linkedCharacterIds.add(link.characterId)
    }
  }

  const characters = (await dramasRepo.listCharactersByDrama(dramaId))
    .filter(item => !item.deletedAt)
    .filter(item => !linkedCharacterIds.size || linkedCharacterIds.has(item.id))
    .map(item => ({
      id: item.id,
      name: item.name,
      role: item.role || '',
      description: item.description || '',
      appearance: item.appearance || '',
      personality: item.personality || '',
      voice_id: item.voiceId || '',
      image_url: item.imageUrl || '',
      reference_images: item.referenceImages || '',
    }))

  const scenes = (await scenesRepo.listActiveScenesByDrama(dramaId))
    .filter(item => !linkedSceneIds.size || linkedSceneIds.has(item.id))
    .map(item => ({
      id: item.id,
      location: item.location,
      time: item.time,
      prompt: item.prompt || '',
      image_url: item.imageUrl || '',
      storyboard_count: item.storyboardCount || 0,
    }))

  const existingStoryboards = (await storyboardsRepo.listActiveStoryboardsByEpisode(episodeId))
    .map(item => ({
      id: item.id,
      shot_number: item.storyboardNumber,
      title: item.title || '',
      scene_id: item.sceneId,
      character_ids: [] as number[],
      shot_type: item.shotType || '',
      duration: item.duration || 0,
    }))

  for (const item of existingStoryboards) {
    item.character_ids = await storyboardsRepo.listStoryboardCharacterIds(item.id)
  }

  return {
    ok: true as const,
    payload: {
      episode: {
        id: episode.id,
        title: episode.title,
        episode_number: episode.episodeNumber,
        description: episode.description || '',
      },
      script,
      characters,
      scenes,
      existing_storyboards: existingStoryboards,
    },
  }
}

export async function overwriteEpisodeShots(
  episodeId: number,
  storyboards: Array<Record<string, any>>,
) {
  const timestamp = now()
  await storyboardsRepo.deleteAllStoryboardsForEpisode(episodeId)

  let totalDuration = 0
  for (const shot of storyboards) {
    await validateStoryboardBindings(episodeId, shot.scene_id, shot.character_ids)
    const insertResult = await storyboardsRepo.insertStoryboard({
      episodeId,
      storyboardNumber: shot.shot_number,
      title: shot.title,
      shotType: shot.shot_type,
      angle: shot.angle,
      movement: shot.movement,
      location: shot.location,
      time: shot.time,
      action: shot.action,
      dialogue: shot.dialogue,
      description: shot.description,
      result: shot.result,
      atmosphere: shot.atmosphere,
      imagePrompt: shot.image_prompt,
      videoPrompt: shot.video_prompt,
      bgmPrompt: shot.bgm_prompt,
      soundEffect: shot.sound_effect,
      sceneId: shot.scene_id,
      duration: shot.duration || 10,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await replaceShotCharacterLinks(insertResult.lastInsertRowid, shot.character_ids || [])
    await linkCharactersToEpisode(episodeId, shot.character_ids || [])
    totalDuration += shot.duration || 10
  }

  await episodesRepo.updateEpisode(episodeId, {
    duration: totalDuration,
    updatedAt: timestamp,
  })

  return {
    message: `Saved ${storyboards.length} storyboards`,
    count: storyboards.length,
    total_duration: totalDuration,
  }
}

export async function applyShotPatch(
  episodeId: number,
  storyboardId: number,
  fields: Record<string, any>,
) {
  const storyboard = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!storyboard) return { ok: false as const, error: `Storyboard ${storyboardId} not found` }

  await validateStoryboardBindings(
    episodeId,
    'scene_id' in fields ? fields.scene_id : storyboard.sceneId,
    'character_ids' in fields
      ? fields.character_ids
      : await storyboardsRepo.listStoryboardCharacterIds(storyboardId),
  )

  const updates: Record<string, unknown> = { updatedAt: now() }
  const fieldMap: Record<string, string> = {
    title: 'title',
    shot_type: 'shotType',
    angle: 'angle',
    movement: 'movement',
    location: 'location',
    time: 'time',
    action: 'action',
    result: 'result',
    atmosphere: 'atmosphere',
    image_prompt: 'imagePrompt',
    video_prompt: 'videoPrompt',
    bgm_prompt: 'bgmPrompt',
    sound_effect: 'soundEffect',
    description: 'description',
    dialogue: 'dialogue',
    scene_id: 'sceneId',
    duration: 'duration',
  }

  for (const [inputKey, column] of Object.entries(fieldMap)) {
    if (inputKey in fields) updates[column] = fields[inputKey]
  }

  await storyboardsRepo.updateStoryboard(storyboardId, updates)

  if ('character_ids' in fields) {
    await replaceShotCharacterLinks(storyboardId, fields.character_ids || [])
    await linkCharactersToEpisode(episodeId, fields.character_ids || [])
  }

  return { ok: true as const, updatedFields: Object.keys(updates) }
}

export function composeInlineDramaImagePromptBundle(input: {
  shots: Array<{ shot_number: number; description: string; shot_type?: string }>
  rows: number
  cols: number
  mode: string
}) {
  const { shots, rows, cols, mode } = input
  if (!shots.length) return { error: 'No shots provided' }

  if (mode === 'multi_ref') {
    const anchor = shots[0]
    return {
      grid_prompt: `电影级高质量参考图，${anchor.description}，专业摄影，电影质感，4K分辨率，${rows}x${cols} 宫格统一风格参考图`,
      cell_prompts: shots.map(shot => ({
        shot_number: shot.shot_number,
        frame_type: 'reference',
        prompt: `电影级高质量参考图，${shot.description}，专业摄影，电影质感，4K分辨率，统一风格`,
      })),
    }
  }

  if (mode === 'first_last') {
    const cellPrompts = shots.flatMap(shot => ([
      {
        shot_number: shot.shot_number,
        frame_type: 'first_frame',
        prompt: `电影级高质量首帧，${shot.description}，${shot.shot_type || ''}，专业摄影，${rows}x${cols} 宫格风格统一`,
      },
      {
        shot_number: shot.shot_number,
        frame_type: 'last_frame',
        prompt: `电影级高质量尾帧，${shot.description}，${shot.shot_type || ''}，专业摄影，${rows}x${cols} 宫格风格统一`,
      },
    ]))
    return {
      grid_prompt: `${shots.length}个镜头首尾帧拼图，${shots.map(shot => shot.description).join(' | ')}，电影级画面，专业摄影，${rows}行${cols}列风格统一`,
      cell_prompts: cellPrompts,
    }
  }

  const cellPrompts = shots.slice(0, rows * cols).map(shot => ({
    shot_number: shot.shot_number,
    frame_type: 'first_frame',
    prompt: `电影级高质量首帧，${shot.description}，${shot.shot_type || ''}，专业摄影，${rows}x${cols} 宫格风格统一`,
  }))
  return {
    grid_prompt: `${shots.length}个镜头首帧拼图，${shots.map(shot => shot.description).join(' | ')}，电影级画面，专业摄影，${rows}行${cols}列风格统一`,
    cell_prompts: cellPrompts,
  }
}
