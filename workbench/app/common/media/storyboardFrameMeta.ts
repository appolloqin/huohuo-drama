/** 分镜 reference_images 解析（与 workbench-server storyboard-frame-meta 对齐） */

export type StoryboardReferenceMeta = {
  refs: string[]
  frameVideoUrl?: string
  frameComposedVideoUrl?: string
}

function normalizePathList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && !!item.trim())
}

export function parseStoryboardReferenceMeta(raw: string | null | undefined): StoryboardReferenceMeta {
  if (!raw?.trim()) return { refs: [] }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return { refs: normalizePathList(parsed) }
    if (parsed && typeof parsed === 'object') {
      const frameVideoUrl = typeof parsed.frame_video_url === 'string'
        ? parsed.frame_video_url
        : typeof parsed.frameVideoUrl === 'string'
          ? parsed.frameVideoUrl
          : undefined
      const frameComposedVideoUrl = typeof parsed.frame_composed_video_url === 'string'
        ? parsed.frame_composed_video_url
        : typeof parsed.frameComposedVideoUrl === 'string'
          ? parsed.frameComposedVideoUrl
          : undefined
      const refs = normalizePathList(parsed.refs ?? parsed.reference_image_urls)
      return { refs, frameVideoUrl: frameVideoUrl || undefined, frameComposedVideoUrl: frameComposedVideoUrl || undefined }
    }
  } catch {
    // ignore invalid JSON
  }
  return { refs: [] }
}

export function readShotSlideshowUrlFromMeta(raw: string | null | undefined): string | null {
  return parseStoryboardReferenceMeta(raw).frameVideoUrl || null
}

export function readShotFrameComposedUrlFromMeta(raw: string | null | undefined): string | null {
  return parseStoryboardReferenceMeta(raw).frameComposedVideoUrl || null
}

export function readStoryboardSequenceRefs(storyboard: {
  reference_images?: string | null
  referenceImages?: string | null
}): string[] {
  return parseStoryboardReferenceMeta(storyboard.reference_images || storyboard.referenceImages).refs
}

export function collectLegacySlideshowPaths(storyboard: {
  first_frame_image?: string | null
  firstFrameImage?: string | null
  last_frame_image?: string | null
  lastFrameImage?: string | null
  composed_image?: string | null
  composedImage?: string | null
}): string[] {
  const paths: string[] = []
  const push = (value?: string | null) => {
    if (value && !paths.includes(value)) paths.push(value)
  }
  push(storyboard.first_frame_image || storyboard.firstFrameImage)
  push(storyboard.last_frame_image || storyboard.lastFrameImage)
  push(storyboard.composed_image || storyboard.composedImage)
  return paths
}

export function buildReferenceImagesJson(
  storyboard: {
    reference_images?: string | null
    referenceImages?: string | null
  },
  refs: string[],
): string {
  const meta = parseStoryboardReferenceMeta(storyboard.reference_images || storyboard.referenceImages)
  return JSON.stringify({
    refs,
    ...(meta.frameVideoUrl ? { frame_video_url: meta.frameVideoUrl } : {}),
    ...(meta.frameComposedVideoUrl ? { frame_composed_video_url: meta.frameComposedVideoUrl } : {}),
  })
}

export function buildSeededReferenceImagesJson(storyboard: {
  reference_images?: string | null
  referenceImages?: string | null
  first_frame_image?: string | null
  firstFrameImage?: string | null
  last_frame_image?: string | null
  lastFrameImage?: string | null
  composed_image?: string | null
  composedImage?: string | null
}): string | null {
  if (readStoryboardSequenceRefs(storyboard).length) return null
  const legacy = collectLegacySlideshowPaths(storyboard)
  if (!legacy.length) return null
  const meta = parseStoryboardReferenceMeta(storyboard.reference_images || storyboard.referenceImages)
  return JSON.stringify({
    refs: legacy,
    ...(meta.frameVideoUrl ? { frame_video_url: meta.frameVideoUrl } : {}),
    ...(meta.frameComposedVideoUrl ? { frame_composed_video_url: meta.frameComposedVideoUrl } : {}),
  })
}

/** 静帧播放序列：优先 refs，无 refs 时回退首/尾/合成图 */
export function collectSlideshowKeyframePaths(storyboard: {
  first_frame_image?: string | null
  firstFrameImage?: string | null
  last_frame_image?: string | null
  lastFrameImage?: string | null
  composed_image?: string | null
  composedImage?: string | null
  reference_images?: string | null
  referenceImages?: string | null
}): string[] {
  const refs = readStoryboardSequenceRefs(storyboard)
  if (refs.length) return refs
  return collectLegacySlideshowPaths(storyboard)
}

export function resolveSlideshowFrameTargetCount(durationSec?: number | null): number {
  const duration = Math.max(3, Number(durationSec) || 10)
  return Math.max(2, Math.ceil(duration / 3))
}

export function collectStoryboardKeyframePaths(storyboard: {
  first_frame_image?: string | null
  firstFrameImage?: string | null
  last_frame_image?: string | null
  lastFrameImage?: string | null
  composed_image?: string | null
  composedImage?: string | null
  reference_images?: string | null
  referenceImages?: string | null
}): string[] {
  const paths: string[] = []
  const push = (value?: string | null) => {
    if (value && !paths.includes(value)) paths.push(value)
  }
  push(storyboard.first_frame_image || storyboard.firstFrameImage)
  push(storyboard.last_frame_image || storyboard.lastFrameImage)
  push(storyboard.composed_image || storyboard.composedImage)
  for (const ref of parseStoryboardReferenceMeta(storyboard.reference_images || storyboard.referenceImages).refs) {
    push(ref)
  }
  return paths
}

export function shotHasKeyframeAssets(storyboard: Parameters<typeof collectSlideshowKeyframePaths>[0]): boolean {
  return collectSlideshowKeyframePaths(storyboard).length > 0
}
