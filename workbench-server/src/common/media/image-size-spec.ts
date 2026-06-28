/**
 * 图片 size 字段语义：
 * - 比例：如 "3:4"、"16:9"（用户选择与分集记忆）
 * - 像素：如 "1920x1080"（分镜拼图等需精确画布的场景）
 */
import {
  type ImageAspectRatio,
  isValidAspectRatio,
} from './image-aspect-presets.js'

export function isPixelSizeSpec(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false
  return /^\d+x\d+$/i.test(value.trim())
}

export function isAspectRatioSpec(value?: string | null): value is ImageAspectRatio {
  return !!value && isValidAspectRatio(value)
}

export function aspectRatioToSlash(ratio: ImageAspectRatio): string {
  return ratio.replace(':', '/')
}

/** wan 仅支持少量固定分辨率，按比例映射到最近可用项 */
export function mapAspectRatioToWanPixels(ratio: ImageAspectRatio): string {
  switch (ratio) {
    case '16:9':
    case '4:3':
      return '1696*960'
    case '9:16':
    case '3:4':
    case '2:3':
      return '960*1696'
    case '1:1':
    default:
      return '1280*1280'
  }
}

/** DALL·E 3 仅支持三种固定尺寸 */
export function mapAspectRatioToDalleSize(ratio: ImageAspectRatio): string {
  switch (ratio) {
    case '1:1':
      return '1024x1024'
    case '9:16':
    case '3:4':
    case '2:3':
      return '1024x1792'
    case '16:9':
    case '4:3':
    default:
      return '1792x1024'
  }
}

/** 火山 Seedream 等需要 width/height 时，按比例给出合理默认值 */
export function mapAspectRatioToPixelDims(ratio: ImageAspectRatio): { width: number; height: number } {
  switch (ratio) {
    case '1:1':
      return { width: 1280, height: 1280 }
    case '2:3':
      return { width: 1024, height: 1536 }
    case '3:4':
      return { width: 960, height: 1280 }
    case '4:3':
      return { width: 1280, height: 960 }
    case '9:16':
      return { width: 1080, height: 1920 }
    case '16:9':
    default:
      return { width: 1920, height: 1080 }
  }
}

export function splitPixelSizeSpec(value: string): { width?: number; height?: number } {
  const [w, h] = value.split('x').map(Number)
  if (!w || !h) return {}
  return { width: w, height: h }
}
