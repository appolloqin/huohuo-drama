export type ScreenOrientation = 'portrait' | 'landscape'

export function normalizeScreenOrientation(input: unknown): ScreenOrientation {
  const raw = String(input ?? '').trim().toLowerCase()
  return raw === 'landscape' ? 'landscape' : 'portrait'
}

export function readDramaScreenOrientation(drama: { metadata?: string | null; screen_orientation?: string | null } | null | undefined): ScreenOrientation {
  if (drama?.screen_orientation) {
    return normalizeScreenOrientation(drama.screen_orientation)
  }
  const raw = drama?.metadata
  if (!raw) return 'portrait'
  try {
    const parsed = JSON.parse(raw)
    return normalizeScreenOrientation(parsed?.screen_orientation)
  } catch {
    return 'portrait'
  }
}

export const SCREEN_ORIENTATION_OPTIONS: Array<{ value: ScreenOrientation; labelZh: string; labelEn: string }> = [
  { value: 'portrait', labelZh: '竖屏', labelEn: 'Portrait' },
  { value: 'landscape', labelZh: '横屏', labelEn: 'Landscape' },
]

export function screenOrientationLabel(value: ScreenOrientation, lang: string): string {
  const found = SCREEN_ORIENTATION_OPTIONS.find((item) => item.value === value)
  if (!found) return value
  return lang === 'en' ? found.labelEn : found.labelZh
}
