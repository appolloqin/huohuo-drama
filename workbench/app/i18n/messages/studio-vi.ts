import { studioEn } from './studio'
import type { StudioMessages } from './studio'
import { deepMergeLocale } from './deepMergeLocale'
import { studioViPatchCore } from './studio-vi-patch-core'
import { studioViPatchFlow } from './studio-vi-patch-flow'

const studioViPatch: Record<string, unknown> = { ...studioViPatchCore, ...studioViPatchFlow }

export const studioVi: StudioMessages = deepMergeLocale(studioEn as unknown as StudioMessages, studioViPatch)
