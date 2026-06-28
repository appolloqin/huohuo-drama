/**
 * 角色/场景提取 Mastra 工具集 — episodeId + dramaId 工厂注入
 */
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import { logTaskProgress, logTaskSuccess } from '../../common/task/task-logger.js'
import {
  fetchScreenplayForCastSceneExtract,
  queryProjectCastCatalog,
  queryProjectLocationCatalog,
  upsertCastWithDedup,
  upsertLocationsWithDedup,
} from '../helpers/drama-cast-scene-extract-repository.js'

export function buildDramaCastSceneExtractToolkit(episodeId: number, dramaId: number) {
  const pullScreenplayForExtractTool = createTool({
    id: 'read_formatted_script',
    description: 'Read the formatted screenplay for character/scene extraction.',
    inputSchema: z.object({}),
    execute: async () => {
      const screenplay = await fetchScreenplayForCastSceneExtract(episodeId)
      if (!screenplay.ok) return { error: screenplay.error }
      logTaskSuccess('DramaCastSceneExtract', 'read-script', {
        episodeId,
        dramaId,
        scriptLength: screenplay.script.length,
      })
      return { script: screenplay.script }
    },
  })

  const pullProjectCastCatalogTool = createTool({
    id: 'read_existing_characters',
    description: 'Read all characters already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const catalog = await queryProjectCastCatalog(dramaId, episodeId)
      logTaskSuccess('DramaCastSceneExtract', 'read-characters', {
        episodeId,
        dramaId,
        projectCharacters: catalog.count,
        episodeCharacters: catalog.currentEpisodeCharacters.length,
      })
      return catalog
    },
  })

  const pullProjectLocationCatalogTool = createTool({
    id: 'read_existing_scenes',
    description: 'Read all scenes already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const catalog = await queryProjectLocationCatalog(dramaId, episodeId)
      logTaskSuccess('DramaCastSceneExtract', 'read-scenes', {
        episodeId,
        dramaId,
        projectScenes: catalog.count,
        episodeScenes: catalog.currentEpisodeScenes.length,
      })
      return catalog
    },
  })

  const mergeCastRowsTool = createTool({
    id: 'save_dedup_characters',
    description:
      'Save extracted characters with deduplication. Existing characters (same name) are merged/updated; new ones are created. All are linked to the current episode. Include named pets/animals (e.g. 黑猫) as their own rows when they matter to the episode; do not merge them into human characters.',
    inputSchema: z.object({
      characters: z.array(z.object({
        name: z.string(),
        role: z.string().optional(),
        description: z.string().optional(),
        appearance: z.string().optional(),
        personality: z.string().optional(),
      })),
    }),
    execute: async ({ characters }) => {
      logTaskProgress('DramaCastSceneExtract', 'save-characters-begin', {
        episodeId,
        dramaId,
        names: characters.map(row => row.name).join(','),
      })
      const outcome = await upsertCastWithDedup(episodeId, dramaId, characters)
      logTaskSuccess('DramaCastSceneExtract', 'save-characters-complete', { episodeId, ...outcome })
      return outcome
    },
  })

  const mergeLocationRowsTool = createTool({
    id: 'save_dedup_scenes',
    description: 'Save extracted scenes with deduplication. Existing scenes (same location+time) are reused; new ones are created. All are linked to the current episode.',
    inputSchema: z.object({
      scenes: z.array(z.object({
        location: z.string(),
        time: z.string().optional(),
        prompt: z.string().optional(),
      })),
    }),
    execute: async ({ scenes }) => {
      logTaskProgress('DramaCastSceneExtract', 'save-scenes-begin', {
        episodeId,
        dramaId,
        scenes: scenes.map(row => `${row.location}@${row.time || ''}`).join(','),
      })
      const outcome = await upsertLocationsWithDedup(episodeId, dramaId, scenes)
      logTaskSuccess('DramaCastSceneExtract', 'save-scenes-complete', { episodeId, ...outcome })
      return outcome
    },
  })

  return {
    pullScreenplayForExtract: pullScreenplayForExtractTool,
    pullProjectCastCatalog: pullProjectCastCatalogTool,
    pullProjectLocationCatalog: pullProjectLocationCatalogTool,
    mergeCastRows: mergeCastRowsTool,
    mergeLocationRows: mergeLocationRowsTool,
  }
}
