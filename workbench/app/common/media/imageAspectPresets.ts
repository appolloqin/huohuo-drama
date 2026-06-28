/** 图片生成比例预设（与 workbench-server image-aspect-presets 对齐） */

export type ImageAspectScope = 'character' | 'scene' | 'shot' | 'video'

export const IMAGE_ASPECT_PRESETS = [
  { ratio: '1:1', label: '1:1 正方形，头像', help: '正方形，头像' },
  { ratio: '2:3', label: '2:3 社交媒体，自拍', help: '社交媒体，自拍' },
  { ratio: '3:4', label: '3:4 经典比例，拍照', help: '经典比例，拍照' },
  { ratio: '4:3', label: '4:3 文章配图，插画', help: '文章配图，插画' },
  { ratio: '9:16', label: '9:16 手机壁纸，人像', help: '手机壁纸，人像' },
  { ratio: '16:9', label: '16:9 桌面壁纸，风景', help: '桌面壁纸，风景' },
] as const

export type ImageAspectRatio = (typeof IMAGE_ASPECT_PRESETS)[number]['ratio']

export type EpisodeImageSizes = Partial<Record<ImageAspectScope, ImageAspectRatio>>

const DEFAULT_RATIO_BY_SCOPE: Record<ImageAspectScope, ImageAspectRatio> = {
  character: '3:4',
  scene: '16:9',
  shot: '16:9',
  video: '16:9',
}

export function defaultAspectRatioForScope(scope: ImageAspectScope): ImageAspectRatio {
  return DEFAULT_RATIO_BY_SCOPE[scope]
}

export function imageAspectSelectOptions() {
  return IMAGE_ASPECT_PRESETS.map((item) => ({ label: item.label, value: item.ratio }))
}

export function imageAspectHelpText(): string {
  return IMAGE_ASPECT_PRESETS.map((item) => `${item.ratio} ${item.help}`).join('；')
}

export function videoAspectHelpText(): string {
  return '视频成片比例；竖屏短剧常用 9:16，横屏常用 16:9。' + imageAspectHelpText()
}

export function readEpisodeImageSizes(metadata?: string | null): EpisodeImageSizes {
  if (!metadata) return {}
  try {
    const parsed = JSON.parse(metadata)
    const sizes = parsed?.image_sizes
    if (!sizes || typeof sizes !== 'object') return {}
    const next: EpisodeImageSizes = {}
    for (const scope of ['character', 'scene', 'shot', 'video'] as const) {
      const ratio = sizes[scope]
      if (typeof ratio === 'string' && IMAGE_ASPECT_PRESETS.some((item) => item.ratio === ratio)) {
        next[scope] = ratio as ImageAspectRatio
      }
    }
    return next
  } catch {
    return {}
  }
}

export function mergeEpisodeImageSizes(
  metadata: string | null | undefined,
  patch: EpisodeImageSizes,
): string {
  let base: Record<string, unknown> = {}
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>
    } catch {}
  }
  const current = (base.image_sizes && typeof base.image_sizes === 'object')
    ? { ...(base.image_sizes as EpisodeImageSizes) }
    : {}
  const next = { ...current, ...patch }
  return JSON.stringify({ ...base, image_sizes: next })
}
