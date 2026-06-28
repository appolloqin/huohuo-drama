/**
 * 分镜拆解 Mastra 工具集 — episodeId + dramaId 工厂注入
 */
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import { logTaskProgress, logTaskSuccess } from '../../common/task/task-logger.js'
import {
  assembleBreakdownContext,
  composeInlineDramaImagePromptBundle,
  applyShotPatch,
  overwriteEpisodeShots,
} from '../helpers/storyboard-repository.js'

export function buildDramaStoryboardBreakdownToolkit(episodeId: number, dramaId: number) {
  const pullBreakdownContextTool = createTool({
    id: 'read_storyboard_context',
    description: 'Read the screenplay, characters, and scenes for storyboard breakdown.',
    inputSchema: z.object({}),
    execute: async () => {
      const ctx = await assembleBreakdownContext(episodeId, dramaId)
      if (!ctx.ok) return { error: ctx.error }
      logTaskSuccess('DramaStoryboardBreakdown', 'read-context', {
        episodeId,
        dramaId,
        characters: ctx.payload.characters.length,
        scenes: ctx.payload.scenes.length,
        existingStoryboards: ctx.payload.existing_storyboards.length,
        scriptLength: ctx.payload.script.length,
      })
      return ctx.payload
    },
  })

  const replaceEpisodeShotsTool = createTool({
    id: 'save_storyboards',
    description: 'Save generated storyboards. Replaces all existing storyboards for this episode.',
    inputSchema: z.object({
      storyboards: z.array(z.object({
        shot_number: z.number(),
        title: z.string().optional(),
        shot_type: z.string().optional(),
        angle: z.string().optional(),
        movement: z.string().optional(),
        location: z.string().optional(),
        time: z.string().optional(),
        action: z.string().optional(),
        dialogue: z.string().optional(),
        description: z.string().optional(),
        result: z.string().optional(),
        atmosphere: z.string().optional(),
        image_prompt: z.string().optional(),
        video_prompt: z.string().optional(),
        bgm_prompt: z.string().optional(),
        sound_effect: z.string().optional(),
        duration: z.number().optional(),
        scene_id: z.number().nullable().optional(),
        character_ids: z.array(z.number()).optional(),
      })),
    }),
    execute: async ({ storyboards }) => {
      logTaskProgress('DramaStoryboardBreakdown', 'save-begin', {
        episodeId,
        dramaId,
        count: storyboards.length,
        shotNumbers: storyboards.map(row => row.shot_number).join(','),
      })
      const saved = await overwriteEpisodeShots(episodeId, storyboards)
      logTaskSuccess('DramaStoryboardBreakdown', 'save-complete', {
        episodeId,
        count: saved.count,
        totalDuration: saved.total_duration,
      })
      return saved
    },
  })

  const patchSingleShotTool = createTool({
    id: 'update_storyboard',
    description: 'Update a specific storyboard shot.',
    inputSchema: z.object({
      storyboard_id: z.number(),
      title: z.string().optional(),
      shot_type: z.string().optional(),
      angle: z.string().optional(),
      movement: z.string().optional(),
      location: z.string().optional(),
      time: z.string().optional(),
      action: z.string().optional(),
      result: z.string().optional(),
      atmosphere: z.string().optional(),
      image_prompt: z.string().optional(),
      video_prompt: z.string().optional(),
      bgm_prompt: z.string().optional(),
      sound_effect: z.string().optional(),
      description: z.string().optional(),
      dialogue: z.string().optional(),
      scene_id: z.number().nullable().optional(),
      character_ids: z.array(z.number()).optional(),
      duration: z.number().optional(),
    }),
    execute: async ({ storyboard_id, ...patchFields }) => {
      logTaskProgress('DramaStoryboardBreakdown', 'update-begin', {
        episodeId,
        storyboardId: storyboard_id,
        fields: Object.keys(patchFields),
      })
      const patched = await applyShotPatch(episodeId, storyboard_id, patchFields)
      if (!patched.ok) return { error: patched.error }
      logTaskSuccess('DramaStoryboardBreakdown', 'update-complete', {
        episodeId,
        storyboardId: storyboard_id,
        updatedFields: patched.updatedFields,
        characterIds: 'character_ids' in patchFields
          ? (patchFields.character_ids || []).join(',')
          : undefined,
      })
      return { message: `Storyboard ${storyboard_id} updated` }
    },
  })

  const synthesizeInlineGridBriefTool = createTool({
    id: 'generate_grid_prompt',
    description: '为宫格图生成整体画面描述。根据选中的镜头列表及其描述，生成一个连贯的宫格图提示词，用于一次性生成完整的宫格拼图。',
    inputSchema: z.object({
      shots: z.array(z.object({
        shot_number: z.number(),
        description: z.string(),
        shot_type: z.string().optional(),
        dialogue: z.string().optional(),
      })),
      rows: z.number(),
      cols: z.number(),
      mode: z.string(),
    }),
    execute: async (gridInput) => {
      logTaskProgress('DramaStoryboardBreakdown', 'image-prompt-begin', {
        episodeId,
        shots: gridInput.shots.length,
        rows: gridInput.rows,
        cols: gridInput.cols,
        mode: gridInput.mode,
      })
      const bundle = composeInlineDramaImagePromptBundle(gridInput)
      if ('error' in bundle) return bundle
      logTaskSuccess('DramaStoryboardBreakdown', 'image-prompt-complete', {
        episodeId,
        cells: bundle.cell_prompts.length,
        mode: gridInput.mode,
      })
      return bundle
    },
  })

  return {
    pullBreakdownContext: pullBreakdownContextTool,
    replaceEpisodeShots: replaceEpisodeShotsTool,
    patchSingleShot: patchSingleShotTool,
    synthesizeInlineGridBrief: synthesizeInlineGridBriefTool,
  }
}
