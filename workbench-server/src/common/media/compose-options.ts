/** Episode-level compose defaults (volume only). Per-shot BGM lives on storyboard.bgm_url. */

import {
  builtinBgmRef,
  DEFAULT_BUILTIN_BGM_ID,
  parseBuiltinBgmId,
} from './builtin-bgm-catalog.js'

export type ComposeOptions = {
  /** Linear gain for BGM under dialogue; kept low so speech stays clear. */
  bgm_volume: number
}

export const DEFAULT_COMPOSE_BGM_VOLUME = 0.14

/** @deprecated Prefer builtin:<id>; kept for older rows / UI imports. */
export const STORYBOARD_BGM_BUILTIN = builtinBgmRef(DEFAULT_BUILTIN_BGM_ID)

export const DEFAULT_COMPOSE_OPTIONS: ComposeOptions = {
  bgm_volume: DEFAULT_COMPOSE_BGM_VOLUME,
}

export function normalizeComposeOptions(raw: unknown): ComposeOptions {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COMPOSE_OPTIONS }
  const src = raw as Record<string, unknown>
  const volumeRaw = Number(src.bgm_volume)
  const bgmVolume = Number.isFinite(volumeRaw) && volumeRaw > 0
    ? Math.min(volumeRaw, 1)
    : DEFAULT_COMPOSE_BGM_VOLUME
  return { bgm_volume: bgmVolume }
}

export function readComposeOptionsFromMetadata(raw: string | null | undefined): ComposeOptions {
  if (!raw) return { ...DEFAULT_COMPOSE_OPTIONS }
  try {
    const parsed = JSON.parse(raw)
    return normalizeComposeOptions(parsed?.compose_options)
  } catch {
    return { ...DEFAULT_COMPOSE_OPTIONS }
  }
}

/** Resolve whether a storyboard should mix BGM and which asset to use. */
export function resolveStoryboardBgmSelection(bgmUrl: string | null | undefined): {
  enabled: boolean
  mode: 'none' | 'builtin' | 'custom'
  builtinId: string | null
  customPath: string | null
} {
  const raw = (bgmUrl || '').trim()
  if (!raw) return { enabled: false, mode: 'none', builtinId: null, customPath: null }
  const builtinId = parseBuiltinBgmId(raw)
  if (builtinId) return { enabled: true, mode: 'builtin', builtinId, customPath: null }
  return { enabled: true, mode: 'custom', builtinId: null, customPath: raw }
}
