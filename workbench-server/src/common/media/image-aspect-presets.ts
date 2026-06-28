/** 图片生成比例预设（仅存比例，像素由各模型适配器映射） */

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

const DEFAULT_RATIO_BY_SCOPE: Record<ImageAspectScope, ImageAspectRatio> = {
  character: '3:4',
  scene: '16:9',
  shot: '16:9',
  video: '16:9',
}

export function isValidAspectRatio(value: string): value is ImageAspectRatio {
  return IMAGE_ASPECT_PRESETS.some((item) => item.ratio === value)
}

export function defaultAspectRatioForScope(scope: ImageAspectScope): ImageAspectRatio {
  return DEFAULT_RATIO_BY_SCOPE[scope]
}

export function parsePixelSize(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d+x\d+$/i.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/** 解析生成任务 size：优先显式像素（拼图等），否则返回比例字符串 */
export function resolveImageAspectRatio(input: {
  bodySize?: string | null
  bodyAspectRatio?: string | null
  episodeMetadata?: string | null
  scope: ImageAspectScope
}): string {
  const explicitSize = parsePixelSize(input.bodySize)
  if (explicitSize) return explicitSize

  if (input.bodyAspectRatio && isValidAspectRatio(input.bodyAspectRatio)) {
    return input.bodyAspectRatio
  }

  let metadataRatio: string | undefined
  if (input.episodeMetadata) {
    try {
      const parsed = JSON.parse(input.episodeMetadata)
      const sizes = parsed?.image_sizes
      if (sizes && typeof sizes === 'object' && typeof sizes[input.scope] === 'string') {
        metadataRatio = sizes[input.scope]
      }
    } catch {}
  }

  if (metadataRatio && isValidAspectRatio(metadataRatio)) {
    return metadataRatio
  }

  return defaultAspectRatioForScope(input.scope)
}

export function resolveVideoAspectRatio(input: Omit<Parameters<typeof resolveImageAspectRatio>[0], 'scope'>): string {
  return resolveImageAspectRatio({ ...input, scope: 'video' })
}
