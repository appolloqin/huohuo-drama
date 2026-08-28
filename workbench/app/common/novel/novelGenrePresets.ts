// 小说题材预设：SSOT 见 workbench-server/src/common/novel/novel-genre-registry.ts

import {
  getActiveNovelGenrePresets,
  getNovelGenreEntryByValue,
  type NovelGenreRegistryEntry,
} from '@huohuo-shared/novel-genre-registry'

export type NovelGenrePreset = Pick<
  NovelGenreRegistryEntry,
  'value' | 'skillKey' | 'keywords' | 'premise'
>

export const NOVEL_GENRE_PRESETS: NovelGenrePreset[] = getActiveNovelGenrePresets()

export function getNovelGenrePreset(genre: string): NovelGenrePreset | undefined {
  const entry = getNovelGenreEntryByValue(genre)
  if (!entry || entry.status !== 'active') return undefined
  return entry
}

export function novelGenreSelectOptions() {
  return NOVEL_GENRE_PRESETS.map(p => ({ label: p.value, value: p.value }))
}

export function applyNovelGenrePreset(
  genre: string,
): { keywords: string; premise: string; skillKey: string } | null {
  const preset = getNovelGenrePreset(genre)
  if (!preset) return null
  return { keywords: preset.keywords, premise: preset.premise, skillKey: preset.skillKey }
}
