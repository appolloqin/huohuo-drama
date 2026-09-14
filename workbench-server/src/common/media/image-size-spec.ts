/**
 * 图片 size 字段语义：
 * - 比例：如 "3:4"、"16:9"（用户选择与分集记忆）
 * - 像素：如 "1920x1080"（分镜拼图等需精确画布的场景）
 */
import {
  type ImageAspectRatio,
  isValidAspectRatio,
} from './image-aspect-presets.js'

/** 豆包 Seedream 要求总像素 ≥ 3686400（约 1920²） */
export const SEEDREAM_MIN_PIXELS = 3_686_400

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

function evenCeil(n: number): number {
  const v = Math.ceil(n)
  return v % 2 === 0 ? v : v + 1
}

/** Scale width/height up so area meets Seedream minimum, keeping aspect ratio. */
export function ensureMinPixelArea(
  width: number,
  height: number,
  minPixels = SEEDREAM_MIN_PIXELS,
): { width: number; height: number } {
  const w = Math.max(1, Math.floor(width))
  const h = Math.max(1, Math.floor(height))
  const area = w * h
  if (area >= minPixels) return { width: w, height: h }
  const scale = Math.sqrt(minPixels / area)
  return {
    width: evenCeil(w * scale),
    height: evenCeil(h * scale),
  }
}

/** 火山 Seedream / 火火网关豆包：按比例给出满足最小像素的默认值 */
export function mapAspectRatioToPixelDims(ratio: ImageAspectRatio): { width: number; height: number } {
  let base: { width: number; height: number }
  switch (ratio) {
    case '1:1':
      base = { width: 1920, height: 1920 }
      break
    case '2:3':
      base = { width: 1536, height: 2304 }
      break
    case '3:4':
      base = { width: 1728, height: 2304 }
      break
    case '4:3':
      base = { width: 2304, height: 1728 }
      break
    case '9:16':
      base = { width: 1440, height: 2560 }
      break
    case '16:9':
    default:
      base = { width: 2560, height: 1440 }
      break
  }
  return ensureMinPixelArea(base.width, base.height)
}

/** OpenAI-compatible `size` string for Seedream via huohuo gateway */
export function mapAspectRatioToSeedreamSize(ratio: ImageAspectRatio): string {
  const dims = mapAspectRatioToPixelDims(ratio)
  return `${dims.width}x${dims.height}`
}

export function resolveSeedreamSizeSpec(size?: string | null): string {
  if (isAspectRatioSpec(size)) return mapAspectRatioToSeedreamSize(size)
  if (size && isPixelSizeSpec(size)) {
    const { width, height } = splitPixelSizeSpec(size)
    if (width && height) {
      const dims = ensureMinPixelArea(width, height)
      return `${dims.width}x${dims.height}`
    }
  }
  return mapAspectRatioToSeedreamSize('16:9')
}

export function isSeedreamLikeImageModel(model?: string | null): boolean {
  const m = String(model || '').toLowerCase()
  return m.includes('seedream') || m.includes('doubao')
}

export function splitPixelSizeSpec(value: string): { width?: number; height?: number } {
  const [w, h] = value.split(/[x*]/i).map(Number)
  if (!w || !h) return {}
  return { width: w, height: h }
}
