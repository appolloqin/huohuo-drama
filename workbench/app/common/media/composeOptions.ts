export type ComposeOptions = {
  bgm_volume: number
}

export type BuiltinBgmPreset = {
  id: string
  label: string
  description: string
  preview_url: string
}

export const DEFAULT_COMPOSE_BGM_VOLUME = 0.14

export const BUILTIN_BGM_PREFIX = 'builtin:'
export const STORYBOARD_BGM_BUILTIN_LEGACY = '__builtin__'
export const DEFAULT_BUILTIN_BGM_ID = 'soft-pad'

/** Default when enabling BGM without a chosen preset. */
export const STORYBOARD_BGM_BUILTIN = `${BUILTIN_BGM_PREFIX}${DEFAULT_BUILTIN_BGM_ID}`

/** Always available client-side so the picker never renders empty. */
export const FALLBACK_BUILTIN_BGM_PRESETS: BuiltinBgmPreset[] = [
  {
    id: 'soft-pad',
    label: '柔和铺底',
    description: '低沉弦乐感，适合日常对话',
    preview_url: '/static/bgm/builtin/soft-pad.wav',
  },
  {
    id: 'warm-dawn',
    label: '暖意晨光',
    description: '偏亮温暖，适合温情/和解',
    preview_url: '/static/bgm/builtin/warm-dawn.wav',
  },
  {
    id: 'tense-drone',
    label: '压抑低鸣',
    description: '不协和低频，适合对峙/危机',
    preview_url: '/static/bgm/builtin/tense-drone.wav',
  },
  {
    id: 'night-rain',
    label: '夜雨氛围',
    description: '阴郁铺垫，适合悬疑/独处',
    preview_url: '/static/bgm/builtin/night-rain.wav',
  },
  {
    id: 'hope-lift',
    label: '希望抬升',
    description: '明亮推进，适合反转/爽点',
    preview_url: '/static/bgm/builtin/hope-lift.wav',
  },
]

export const DEFAULT_COMPOSE_OPTIONS: ComposeOptions = {
  bgm_volume: DEFAULT_COMPOSE_BGM_VOLUME,
}

export function readEpisodeComposeOptions(metadata?: string | null): ComposeOptions {
  if (!metadata) return { ...DEFAULT_COMPOSE_OPTIONS }
  try {
    const parsed = JSON.parse(metadata)
    const raw = parsed?.compose_options
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_COMPOSE_OPTIONS }
    const volumeRaw = Number(raw.bgm_volume)
    const bgmVolume = Number.isFinite(volumeRaw) && volumeRaw > 0
      ? Math.min(volumeRaw, 1)
      : DEFAULT_COMPOSE_BGM_VOLUME
    return { bgm_volume: bgmVolume }
  } catch {
    return { ...DEFAULT_COMPOSE_OPTIONS }
  }
}

export function mergeEpisodeComposeOptions(
  metadata: string | null | undefined,
  patch: Partial<ComposeOptions>,
): string {
  let base: Record<string, unknown> = {}
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>
    } catch {}
  }
  const current = readEpisodeComposeOptions(JSON.stringify({ compose_options: base.compose_options }))
  const next = { ...current, ...patch }
  return JSON.stringify({ ...base, compose_options: next })
}

export function readShotBgmUrl(sb: { bgm_url?: string | null; bgmUrl?: string | null } | null | undefined): string | null {
  const raw = (sb?.bgm_url || sb?.bgmUrl || '').trim()
  return raw || null
}

export function shotBgmEnabled(sb: { bgm_url?: string | null; bgmUrl?: string | null } | null | undefined): boolean {
  return !!readShotBgmUrl(sb)
}

export function parseShotBuiltinBgmId(sb: { bgm_url?: string | null; bgmUrl?: string | null } | null | undefined): string | null {
  const raw = readShotBgmUrl(sb)
  if (!raw) return null
  if (raw === STORYBOARD_BGM_BUILTIN_LEGACY) return DEFAULT_BUILTIN_BGM_ID
  if (!raw.startsWith(BUILTIN_BGM_PREFIX)) return null
  return raw.slice(BUILTIN_BGM_PREFIX.length) || DEFAULT_BUILTIN_BGM_ID
}

export function shotBgmIsCustom(sb: { bgm_url?: string | null; bgmUrl?: string | null } | null | undefined): boolean {
  const raw = readShotBgmUrl(sb)
  return !!raw && !parseShotBuiltinBgmId(sb)
}

export function builtinBgmRef(id: string): string {
  return `${BUILTIN_BGM_PREFIX}${id}`
}

export function resolveBuiltinBgmPresets(apiPresets?: Array<Partial<BuiltinBgmPreset>> | null): BuiltinBgmPreset[] {
  if (!Array.isArray(apiPresets) || !apiPresets.length) {
    return FALLBACK_BUILTIN_BGM_PRESETS.map(p => ({ ...p }))
  }
  return FALLBACK_BUILTIN_BGM_PRESETS.map((fallback) => {
    const hit = apiPresets.find(p => p?.id === fallback.id)
    return {
      ...fallback,
      label: hit?.label || fallback.label,
      description: hit?.description || fallback.description,
      preview_url: hit?.preview_url || fallback.preview_url,
    }
  })
}

export const composeBgmHelpText =
  '每个镜头可单独开关 BGM，并从内置曲目中选择（可试听），或上传该镜自定义文件。顶栏音量全集共用，默认较低以免压过对白。'
