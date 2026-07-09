/**
 * 角色/场景提取 Mastra 工具集 — episodeId + dramaId 工厂注入
 */
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import { logTaskProgress, logTaskSuccess } from '../../common/task/task-logger.js'
import {
  fetchScreenplayForCastSceneExtract,
  queryProjectCastCatalog,
  queryProjectCharacterFormsCatalog,
  queryProjectLocationCatalog,
  queryProjectPropsCatalog,
  upsertCastWithDedup,
  upsertCharacterFormsWithDedup,
  upsertLocationsWithDedup,
  upsertPropsWithDedup,
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

  const pullProjectCharacterFormsCatalogTool = createTool({
    id: 'read_existing_character_forms',
    description: 'Read derivative character forms (transformations/outfits) already in this drama project.',
    inputSchema: z.object({}),
    execute: async () => {
      const catalog = await queryProjectCharacterFormsCatalog(dramaId, episodeId)
      logTaskSuccess('DramaCastSceneExtract', 'read-character-forms', {
        episodeId,
        dramaId,
        projectForms: catalog.count,
        episodeForms: catalog.current_episode_forms.length,
      })
      return catalog
    },
  })

  const pullProjectPropsCatalogTool = createTool({
    id: 'read_existing_props',
    description: 'Read props (weapons, items, decor) already in this drama project.',
    inputSchema: z.object({}),
    execute: async () => {
      const catalog = await queryProjectPropsCatalog(dramaId, episodeId)
      logTaskSuccess('DramaCastSceneExtract', 'read-props', {
        episodeId,
        dramaId,
        projectProps: catalog.count,
        episodeProps: catalog.current_episode_props.length,
      })
      return catalog
    },
  })

  const mergeCharacterFormsTool = createTool({
    id: 'save_dedup_character_forms',
    description:
      'Save derivative character forms (觉醒态, 战甲, 便装等). Requires base character_name that already exists in cast. Dedup by character + form name.',
    inputSchema: z.object({
      character_forms: z.array(z.object({
        character_name: z.string(),
        name: z.string(),
        appearance: z.string().optional(),
        description: z.string().optional(),
        prompt: z.string().optional(),
      })),
    }),
    execute: async ({ character_forms }) => {
      logTaskProgress('DramaCastSceneExtract', 'save-character-forms-begin', {
        episodeId,
        dramaId,
        count: character_forms.length,
      })
      const outcome = await upsertCharacterFormsWithDedup(episodeId, dramaId, character_forms)
      logTaskSuccess('DramaCastSceneExtract', 'save-character-forms-complete', { episodeId, ...outcome })
      return outcome
    },
  })

  const mergePropsTool = createTool({
    id: 'save_dedup_props',
    description:
      'Save props (weapons, handheld items, key decor). Optional character_name / character_form_name for exclusive ownership. Dedup by prop name within drama.',
    inputSchema: z.object({
      props: z.array(z.object({
        name: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
        prompt: z.string().optional(),
        character_name: z.string().optional(),
        character_form_name: z.string().optional(),
      })),
    }),
    execute: async ({ props }) => {
      logTaskProgress('DramaCastSceneExtract', 'save-props-begin', {
        episodeId,
        dramaId,
        count: props.length,
      })
      const outcome = await upsertPropsWithDedup(episodeId, dramaId, props)
      logTaskSuccess('DramaCastSceneExtract', 'save-props-complete', { episodeId, ...outcome })
      return outcome
    },
  })

  return {
    pullScreenplayForExtract: pullScreenplayForExtractTool,
    pullProjectCastCatalog: pullProjectCastCatalogTool,
    pullProjectLocationCatalog: pullProjectLocationCatalogTool,
    pullProjectCharacterFormsCatalog: pullProjectCharacterFormsCatalogTool,
    pullProjectPropsCatalog: pullProjectPropsCatalogTool,
    mergeCastRows: mergeCastRowsTool,
    mergeLocationRows: mergeLocationRowsTool,
    mergeCharacterForms: mergeCharacterFormsTool,
    mergeProps: mergePropsTool,
  }
}
