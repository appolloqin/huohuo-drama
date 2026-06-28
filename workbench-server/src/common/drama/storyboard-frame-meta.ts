/** 分镜 reference_images 扩展：兼容纯数组与 { refs, frame_video_url } 包装 */

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
    if (Array.isArray(parsed)) {
      return { refs: normalizePathList(parsed) }
    }
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

export function getFrameVideoUrl(raw: string | null | undefined): string | null {
  return parseStoryboardReferenceMeta(raw).frameVideoUrl || null
}

export function getFrameComposedVideoUrl(raw: string | null | undefined): string | null {
  return parseStoryboardReferenceMeta(raw).frameComposedVideoUrl || null
}

export function mergeFrameComposedVideoUrl(raw: string | null | undefined, composedVideoUrl: string): string {
  const meta = parseStoryboardReferenceMeta(raw)
  return JSON.stringify({
    refs: meta.refs,
    ...(meta.frameVideoUrl ? { frame_video_url: meta.frameVideoUrl } : {}),
    frame_composed_video_url: composedVideoUrl,
  })
}

export function listReferenceImagePaths(raw: string | null | undefined): string[] {
  return parseStoryboardReferenceMeta(raw).refs
}

export function mergeFrameVideoUrl(raw: string | null | undefined, frameVideoUrl: string): string {
  const meta = parseStoryboardReferenceMeta(raw)
  return JSON.stringify({
    refs: meta.refs,
    frame_video_url: frameVideoUrl,
    ...(meta.frameComposedVideoUrl ? { frame_composed_video_url: meta.frameComposedVideoUrl } : {}),
  })
}

export function appendReferenceImagePath(raw: string | null | undefined, imagePath: string): string {
  const meta = parseStoryboardReferenceMeta(raw)
  if (!imagePath || meta.refs.includes(imagePath)) {
    return meta.frameComposedVideoUrl || meta.frameVideoUrl
      ? JSON.stringify({
          refs: meta.refs,
          ...(meta.frameVideoUrl ? { frame_video_url: meta.frameVideoUrl } : {}),
          ...(meta.frameComposedVideoUrl ? { frame_composed_video_url: meta.frameComposedVideoUrl } : {}),
        })
      : JSON.stringify(meta.refs)
  }
  const refs = [...meta.refs, imagePath]
  return JSON.stringify({
    refs,
    ...(meta.frameVideoUrl ? { frame_video_url: meta.frameVideoUrl } : {}),
    ...(meta.frameComposedVideoUrl ? { frame_composed_video_url: meta.frameComposedVideoUrl } : {}),
  })
}

export function mergeReferenceImagesRefs(
  raw: string | null | undefined,
  refs: string[],
): string {
  const meta = parseStoryboardReferenceMeta(raw)
  return JSON.stringify({
    refs,
    ...(meta.frameVideoUrl ? { frame_video_url: meta.frameVideoUrl } : {}),
    ...(meta.frameComposedVideoUrl ? { frame_composed_video_url: meta.frameComposedVideoUrl } : {}),
  })
}

export function collectLegacySlideshowPaths(storyboard: {
  firstFrameImage?: string | null
  lastFrameImage?: string | null
  composedImage?: string | null
}): string[] {
  const paths: string[] = []
  const push = (value?: string | null) => {
    if (value && !paths.includes(value)) paths.push(value)
  }
  push(storyboard.firstFrameImage)
  push(storyboard.lastFrameImage)
  push(storyboard.composedImage)
  return paths
}

/** 将旧版首/尾/合成图迁入 refs（保留静帧视频等 metadata） */
export function seedSlideshowReferenceImages(
  raw: string | null | undefined,
  storyboard: {
    firstFrameImage?: string | null
    lastFrameImage?: string | null
    composedImage?: string | null
  },
): string | null {
  const meta = parseStoryboardReferenceMeta(raw)
  if (meta.refs.length) return null
  const legacy = collectLegacySlideshowPaths(storyboard)
  if (!legacy.length) return null
  return mergeReferenceImagesRefs(raw, legacy)
}

/** 静帧播放序列：优先 reference_images.refs；无 refs 时回退首/尾/合成图（兼容旧数据） */
export function collectSlideshowKeyframePaths(storyboard: {
  firstFrameImage?: string | null
  lastFrameImage?: string | null
  composedImage?: string | null
  referenceImages?: string | null
}): string[] {
  const refs = listReferenceImagePaths(storyboard.referenceImages)
  if (refs.length) return refs
  return collectLegacySlideshowPaths(storyboard)
}

export function collectStoryboardKeyframePaths(storyboard: {
  firstFrameImage?: string | null
  lastFrameImage?: string | null
  composedImage?: string | null
  referenceImages?: string | null
}): string[] {
  const paths: string[] = []
  const push = (value?: string | null) => {
    if (value && !paths.includes(value)) paths.push(value)
  }
  push(storyboard.firstFrameImage)
  push(storyboard.lastFrameImage)
  push(storyboard.composedImage)
  for (const ref of listReferenceImagePaths(storyboard.referenceImages)) push(ref)
  return paths
}

export function resolveSlideshowFrameTargetCount(durationSec?: number | null): number {
  const duration = Math.max(3, Number(durationSec) || 10)
  return Math.max(2, Math.ceil(duration / 3))
}
