/**
 * 宫格/角色/场景图片提示词 Mastra 工具集
 */
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import {
  buildCharacterImagePrompt,
  buildSceneImagePrompt,
  composeDramaImagePromptBundle,
  listActiveCharacters,
  listActiveScenes,
  listShotsForEpisode,
  resolveDramaStyleById,
} from '../helpers/image-prompt-builder.js'

export function buildDramaImagePromptToolkit(episodeId: number, dramaId: number) {
  const pullCastRowsTool = createTool({
    id: 'read_characters',
    description: '读取当前剧集中的所有角色信息，用于生成角色图片提示词。',
    inputSchema: z.object({}),
    execute: async () => ({ characters: await listActiveCharacters(dramaId) }),
  })

  const synthesizeCastPromptTool = createTool({
    id: 'generate_character_prompt',
    description: '为角色生成 AI 图片生成的英文提示词。',
    inputSchema: z.object({ character_id: z.number() }),
    execute: async ({ character_id }) => {
      const castRow = await charactersRepo.findCharacterById(character_id)
      if (!castRow) return { error: 'Character not found' }
      const dramaStyle = await resolveDramaStyleById(dramaId)

      return {
        character_id: castRow.id,
        character_name: castRow.name,
        prompt: buildCharacterImagePrompt(castRow, dramaStyle),
        drama_style: dramaStyle,
      }
    },
  })

  const pullLocationRowsTool = createTool({
    id: 'read_scenes',
    description: '读取当前剧集中的所有场景信息，用于生成场景图片提示词。',
    inputSchema: z.object({}),
    execute: async () => ({ scenes: await listActiveScenes(dramaId) }),
  })

  const synthesizeLocationPromptTool = createTool({
    id: 'generate_scene_prompt',
    description: '为场景生成 AI 图片生成的英文提示词。',
    inputSchema: z.object({ scene_id: z.number() }),
    execute: async ({ scene_id }) => {
      const locationRow = await scenesRepo.findSceneById(scene_id)
      if (!locationRow) return { error: 'Scene not found' }
      const dramaStyle = await resolveDramaStyleById(dramaId)

      return {
        scene_id: locationRow.id,
        location: locationRow.location,
        prompt: buildSceneImagePrompt(locationRow, dramaStyle),
        drama_style: dramaStyle,
      }
    },
  })

  const pullShotRowsForGridTool = createTool({
    id: 'read_shots_for_grid',
    description: '读取选中镜头的详细信息，用于生成宫格图提示词。',
    inputSchema: z.object({ shot_ids: z.array(z.number()) }),
    execute: async ({ shot_ids }) => ({
      shots: await listShotsForEpisode(episodeId, shot_ids),
    }),
  })

  const assembleGridPromptBundleTool = createTool({
    id: 'generate_grid_prompt',
    description: '为宫格图生成整体画面描述和每个格子的独立提示词。遵循 drama_image_prompt SKILL.md 的三种模式规范。',
    inputSchema: z.object({
      shots: z.array(z.object({
        shot_number: z.number(),
        description: z.string(),
        shot_type: z.string().optional(),
        dialogue: z.string().optional(),
        location: z.string().optional(),
        time: z.string().optional(),
      })),
      rows: z.number(),
      cols: z.number(),
      mode: z.string(),
      reference_legend: z.string().optional(),
    }),
    execute: async (gridSpec) => {
      const dramaStyle = await resolveDramaStyleById(dramaId)
      return composeDramaImagePromptBundle({ ...gridSpec, dramaStyle })
    },
  })

  return {
    pullCastRows: pullCastRowsTool,
    synthesizeCastPrompt: synthesizeCastPromptTool,
    pullLocationRows: pullLocationRowsTool,
    synthesizeLocationPrompt: synthesizeLocationPromptTool,
    pullShotRowsForGrid: pullShotRowsForGridTool,
    assembleGridPromptBundle: assembleGridPromptBundleTool,
  }
}
