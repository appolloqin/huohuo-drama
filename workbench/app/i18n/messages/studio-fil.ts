import { studioEn } from './studio'
import type { StudioMessages } from './studio'
import { deepMergeLocale } from './deepMergeLocale'
import { studioFilPatchCore } from './studio-fil-patch-core'
import { studioFilPatchFlow } from './studio-fil-patch-flow'

const studioFilPatch: Record<string, unknown> = { ...studioFilPatchCore, ...studioFilPatchFlow }

export const studioFil: StudioMessages = deepMergeLocale(studioEn as unknown as StudioMessages, studioFilPatch)
