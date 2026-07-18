import * as charactersRepo from '../../db/repos/characters/index.js'
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import { applyDramaStyleToPrompt, normalizeDramaStyle } from '../../common/drama/drama-style.js'

const PROMPT_SUFFIX = {
  character: 'portrait, high quality, detailed character concept art, no text, no watermark',
  scene: 'atmospheric lighting, high quality, empty background scene, no people, no figures, no text, no watermark',
} as const

export async function listActiveCharacters(dramaId: number) {
  const characters = await charactersRepo.listActiveCharactersByDrama(dramaId)
  return characters.map(character => ({
    id: character.id,
    name: character.name,
    role: character.role || '',
    description: character.description || '',
    appearance: character.appearance || '',
    personality: character.personality || '',
  }))
}

export async function listActiveScenes(dramaId: number) {
  const scenes = await scenesRepo.listActiveScenesByDrama(dramaId)
  return scenes.map(scene => ({
    id: scene.id,
    location: scene.location,
    time: scene.time || '',
    prompt: scene.prompt || '',
  }))
}

export async function resolveDramaStyleById(dramaId: number) {
  const drama = await dramasRepo.findDramaById(dramaId)
  return normalizeDramaStyle(drama?.style) || null
}

export function buildCharacterImagePrompt(
  character: {
    appearance?: string | null
    description?: string | null
    role?: string | null
    personality?: string | null
  },
  dramaStyle?: string | null,
) {
  const traits = [
    character.appearance,
    character.description,
    character.role ? `role: ${character.role}` : '',
    character.personality ? `personality: ${character.personality}` : '',
  ].filter(Boolean)

  return applyDramaStyleToPrompt(`${traits.join(', ')}, ${PROMPT_SUFFIX.character}`, dramaStyle, 'en')
}

export function buildSceneImagePrompt(
  scene: {
    location?: string | null
    time?: string | null
    prompt?: string | null
  },
  dramaStyle?: string | null,
) {
  const traits = [scene.location, scene.time, scene.prompt].filter(Boolean)
  return applyDramaStyleToPrompt(`${traits.join(', ')}, ${PROMPT_SUFFIX.scene}`, dramaStyle, 'en')
}

export async function listShotsForEpisode(episodeId: number, shotIds: number[]) {
  if (!shotIds.length) return []
  const shots = await episodesRepo.listStoryboardsByEpisode(episodeId)
  return shots.filter(shot => shotIds.includes(shot.id))
    .map(shot => ({
      shot_number: shot.storyboardNumber,
      description: shot.description || shot.title || '',
      shot_type: shot.shotType || '',
      dialogue: shot.dialogue || '',
      location: shot.location || '',
      time: shot.time || '',
    }))
}

interface GridShotInput {
  shot_number: number
  description: string
  shot_type?: string
  dialogue?: string
  location?: string
  time?: string
}

function shotDescriptor(shot: GridShotInput, legend?: string) {
  const legendPrefix = legend ? `参考${legend}，` : ''
  const location = shot.location ? `, ${shot.location}` : ''
  const shotType = shot.shot_type ? `, ${shot.shot_type}` : ''
  return `${legendPrefix}${shot.description}${location}${shotType}`
}

function buildGridShell(
  rows: number,
  cols: number,
  legend?: string,
  descriptions: string[] = [],
  dramaStyle?: string | null,
) {
  const totalCells = rows * cols
  const legendPrefix = legend ? `参考图映射：${legend}, ` : ''
  const summary = descriptions.length ? `${descriptions.join(' | ')}, ` : ''
  return applyDramaStyleToPrompt(
    `${rows}x${cols} grid layout, exactly ${totalCells} visible panels, ${legendPrefix}${summary}no merged panels, no missing panels, no text, no watermark`,
    dramaStyle,
    'en',
  )
}

export function composeDramaImagePromptBundle(input: {
  shots: GridShotInput[]
  rows: number
  cols: number
  mode: string
  reference_legend?: string
  dramaStyle?: string | null
}) {
  const { shots, rows, cols, mode, reference_legend, dramaStyle } = input
  if (!shots.length) {
    return { error: 'No shots provided', grid_prompt: '', cell_prompts: [] as Array<Record<string, unknown>> }
  }

  const totalCells = rows * cols

  if (mode === 'multi_ref') {
    const anchor = shots[0]
    const cellPrompts = Array.from({ length: totalCells }, (_, index) => ({
      shot_number: anchor.shot_number,
      frame_type: 'reference',
      prompt: applyDramaStyleToPrompt(
        `格${index + 1}：${shotDescriptor(anchor, reference_legend)}, consistent with other cells in the ${rows}x${cols} grid`,
        dramaStyle,
        'en',
      ),
    }))
    return {
      grid_prompt: buildGridShell(rows, cols, reference_legend, [anchor.description], dramaStyle),
      cell_prompts: cellPrompts,
    }
  }

  if (mode === 'first_last') {
    const cellPrompts = Array.from({ length: totalCells }, (_, index) => {
      const shot = shots[index % shots.length]
      const isOpening = index % 2 === 0
      const motion = isOpening ? 'opening scene' : 'ending scene, continuous motion'
      return {
        shot_number: shot.shot_number,
        frame_type: isOpening ? 'first_frame' : 'last_frame',
        prompt: applyDramaStyleToPrompt(
          `格${index + 1}：${shotDescriptor(shot, reference_legend)}, ${motion}`,
          dramaStyle,
          'en',
        ),
      }
    })
    return {
      grid_prompt: buildGridShell(rows, cols, reference_legend, shots.map(shot => shot.description), dramaStyle),
      cell_prompts: cellPrompts,
    }
  }

  const cellPrompts = Array.from({ length: totalCells }, (_, index) => {
    const shot = shots[index % shots.length]
    return {
      shot_number: shot.shot_number,
      frame_type: 'first_frame',
      prompt: applyDramaStyleToPrompt(
        `格${index + 1}：${shotDescriptor(shot, reference_legend)}, opening scene`,
        dramaStyle,
        'en',
      ),
    }
  })

  return {
    grid_prompt: buildGridShell(rows, cols, reference_legend, shots.map(shot => shot.description), dramaStyle),
    cell_prompts: cellPrompts,
  }
}
