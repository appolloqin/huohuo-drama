import type { AgentConfigRow, EpisodeRow, StoryboardRow } from '../../db/repos/types.js'
import { persistNovelChapterContentToDisk } from '../novel/novel-chapter-content-storage.js'
import {
  persistInlineOrBlob,
  resolveInlineOrBlob,
} from './text-blob-storage.js'

export type EpisodeTextPatchOptions = {
  /** 小说正文只落盘，DB 不存 inline content */
  novelContentDiskOnly?: boolean
  dramaId?: number
}

export function hydrateEpisodeRow<T extends EpisodeRow>(row: T): T {
  return {
    ...row,
    content: resolveInlineOrBlob(row.content, row.contentBlobPath),
    scriptContent: resolveInlineOrBlob(row.scriptContent, row.scriptBlobPath),
    formattedScript: resolveInlineOrBlob(row.formattedScript, row.formattedScriptBlobPath),
  }
}

export function applyEpisodeTextPatch(
  id: number,
  patch: Record<string, unknown>,
  options?: EpisodeTextPatchOptions,
): Record<string, unknown> {
  const next = { ...patch }
  if ('content' in patch) {
    const p = options?.novelContentDiskOnly && options.dramaId
      ? persistNovelChapterContentToDisk(options.dramaId, id, patch.content as string | null)
      : persistInlineOrBlob('episodes', id, 'content', patch.content as string | null)
    next.content = p.inline
    next.contentBlobPath = p.blobPath
  }
  if ('scriptContent' in patch) {
    const p = persistInlineOrBlob('episodes', id, 'script_content', patch.scriptContent as string | null)
    next.scriptContent = p.inline
    next.scriptBlobPath = p.blobPath
  }
  if ('formattedScript' in patch) {
    const p = persistInlineOrBlob('episodes', id, 'formatted_script', patch.formattedScript as string | null)
    next.formattedScript = p.inline
    next.formattedScriptBlobPath = p.blobPath
  }
  return next
}

export function hydrateStoryboardRow<T extends StoryboardRow>(row: T): T {
  return {
    ...row,
    imagePrompt: resolveInlineOrBlob(row.imagePrompt, row.imagePromptBlobPath),
    videoPrompt: resolveInlineOrBlob(row.videoPrompt, row.videoPromptBlobPath),
    dialogue: resolveInlineOrBlob(row.dialogue, row.dialogueBlobPath),
  }
}

export function applyStoryboardTextPatch(id: number, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch }
  if ('imagePrompt' in patch) {
    const p = persistInlineOrBlob('storyboards', id, 'image_prompt', patch.imagePrompt as string | null)
    next.imagePrompt = p.inline
    next.imagePromptBlobPath = p.blobPath
  }
  if ('videoPrompt' in patch) {
    const p = persistInlineOrBlob('storyboards', id, 'video_prompt', patch.videoPrompt as string | null)
    next.videoPrompt = p.inline
    next.videoPromptBlobPath = p.blobPath
  }
  if ('dialogue' in patch) {
    const p = persistInlineOrBlob('storyboards', id, 'dialogue', patch.dialogue as string | null)
    next.dialogue = p.inline
    next.dialogueBlobPath = p.blobPath
  }
  return next
}

export function hydrateAgentConfigRow<T extends AgentConfigRow>(row: T): T {
  return {
    ...row,
    systemPrompt: resolveInlineOrBlob(row.systemPrompt, row.systemPromptBlobPath),
  }
}

export function applyAgentConfigTextPatch(id: number, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...patch }
  if ('systemPrompt' in patch) {
    const p = persistInlineOrBlob('agent_configs', id, 'system_prompt', patch.systemPrompt as string | null)
    next.systemPrompt = p.inline
    next.systemPromptBlobPath = p.blobPath
  }
  return next
}
