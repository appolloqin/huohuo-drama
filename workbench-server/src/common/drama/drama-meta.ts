/** 短剧项目 metadata（存于 dramas.metadata JSON） */

import { parseJsonColumnObject, type JsonColumnInput } from '../db/parse-json-column.js'
import type { ImageAspectScope } from '../media/image-aspect-presets.js'
import type { ImageAspectRatio } from '../media/image-aspect-presets.js'

export type ScreenOrientation = 'portrait' | 'landscape'

export type DramaMetadata = {
  screen_orientation?: ScreenOrientation
  style_reference_image?: string
}

const PORTRAIT_IMAGE_SIZES: Record<ImageAspectScope, ImageAspectRatio> = {
  character: '3:4',
  scene: '9:16',
  shot: '9:16',
  video: '9:16',
}

const LANDSCAPE_IMAGE_SIZES: Record<ImageAspectScope, ImageAspectRatio> = {
  character: '3:4',
  scene: '16:9',
  shot: '16:9',
  video: '16:9',
}

export function normalizeScreenOrientation(input: unknown): ScreenOrientation {
  const raw = String(input ?? '').trim().toLowerCase()
  return raw === 'landscape' ? 'landscape' : 'portrait'
}

export function parseDramaMetadata(raw: JsonColumnInput): DramaMetadata {
  const parsed = parseJsonColumnObject(raw)
  if (!Object.keys(parsed).length) return {}
  const orientation = parsed.screen_orientation
  return {
    screen_orientation: orientation === 'landscape' || orientation === 'portrait'
      ? orientation
      : undefined,
    style_reference_image: typeof parsed.style_reference_image === 'string'
      ? parsed.style_reference_image.trim() || undefined
      : undefined,
  }
}

export function mergeDramaMetadata(
  raw: JsonColumnInput,
  patch: Partial<DramaMetadata>,
): string {
  const base = parseJsonColumnObject(raw)
  const next: Record<string, unknown> = { ...base }

  if ('screen_orientation' in patch) {
    if (patch.screen_orientation) next.screen_orientation = patch.screen_orientation
    else delete next.screen_orientation
  }
  if ('style_reference_image' in patch) {
    if (patch.style_reference_image) next.style_reference_image = patch.style_reference_image
    else delete next.style_reference_image
  }

  return JSON.stringify(next)
}

/** 从 drama.metadata 读取画幅；缺省竖屏 */
export function resolveScreenOrientation(raw: JsonColumnInput): ScreenOrientation {
  return parseDramaMetadata(raw).screen_orientation || 'portrait'
}

export function defaultEpisodeImageSizesForOrientation(
  orientation: ScreenOrientation,
): Record<ImageAspectScope, ImageAspectRatio> {
  return orientation === 'landscape'
    ? { ...LANDSCAPE_IMAGE_SIZES }
    : { ...PORTRAIT_IMAGE_SIZES }
}

export function formatScreenOrientationBriefForAgent(orientation: ScreenOrientation): string {
  return orientation === 'landscape'
    ? '项目画幅：横屏 16:9（场景/分镜/视频默认 16:9，角色立绘 3:4）'
    : '项目画幅：竖屏 9:16（场景/分镜/视频默认 9:16，角色立绘 3:4）'
}
