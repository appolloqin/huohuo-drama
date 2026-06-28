/**
 * 剧本格式化 Mastra 工具集 — episodeId 在工厂阶段注入
 */
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import {
  composeDramaScriptFormatDirective,
  fetchEpisodeDraftContent,
  writeEpisodeScreenplayContent,
} from '../helpers/drama-script-formatter-repository.js'

export function buildDramaScriptFormatterToolkit(episodeId: number) {
  const pullDraftSegmentTool = createTool({
    id: 'read_episode_draft',
    description: 'Read the script content of the current episode.',
    inputSchema: z.object({}),
    execute: async () => {
      const draftPayload = await fetchEpisodeDraftContent(episodeId)
      if (!draftPayload.ok) return { error: draftPayload.error }
      return {
        content: draftPayload.content,
        word_count: draftPayload.wordCount,
        episode_id: episodeId,
      }
    },
  })

  const buildRewriteBriefTool = createTool({
    id: 'compose_format_brief',
    description: 'Read the original content for AI rewriting. Returns the source text with formatting instructions.',
    inputSchema: z.object({
      instructions: z.string().optional().describe('Additional rewrite instructions'),
    }),
    execute: async ({ instructions }) => {
      const draftPayload = await fetchEpisodeDraftContent(episodeId)
      if (!draftPayload.ok) return { error: draftPayload.error }
      const formatBrief = composeDramaScriptFormatDirective(draftPayload.content, instructions)
      return {
        source_content: draftPayload.content,
        instruction: formatBrief,
      }
    },
  })

  const commitScreenplayDraftTool = createTool({
    id: 'save_formatted_script',
    description: 'Save the rewritten screenplay content to the current episode.',
    inputSchema: z.object({
      content: z.string().describe('The formatted screenplay content to save'),
    }),
    execute: async ({ content }) => {
      const writeResult = await writeEpisodeScreenplayContent(episodeId, content)
      return { message: 'Script saved', word_count: writeResult.wordCount }
    },
  })

  return {
    pullDraftSegment: pullDraftSegmentTool,
    buildRewriteBrief: buildRewriteBriefTool,
    commitScreenplayDraft: commitScreenplayDraftTool,
  }
}
