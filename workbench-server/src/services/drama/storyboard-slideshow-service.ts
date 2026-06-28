import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import {
  collectSlideshowKeyframePaths,
  getFrameComposedVideoUrl,
  getFrameVideoUrl,
  mergeFrameComposedVideoUrl,
  mergeFrameVideoUrl,
} from '../../common/drama/storyboard-frame-meta.js'
import type { ProductionPipeline } from '../../common/drama/episode-meta.js'
import { now } from '../../common/http/response.js'
import { parseDialogueForTTS } from './compose-dialogue.js'
import { probeMediaDuration, renderSlideshowFromImages } from './compose-ffmpeg.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

export interface SlideshowPaths {
  staticRoot: string
  dataRoot: string
}

function resolvePath(relativePath: string, paths: SlideshowPaths): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(paths.dataRoot, relativePath)
  return path.join(paths.staticRoot, relativePath)
}

export function storyboardHasSlideshowClip(referenceImages: string | null | undefined): boolean {
  return !!getFrameVideoUrl(referenceImages)
}

export async function assertFrameSlideshowEpisode(episodeId: number) {
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode) throw new Error(`Episode ${episodeId} not found`)
  return episode
}

const SLIDESHOW_DURATION_TOLERANCE_SEC = 0.35

type StoryboardRow = NonNullable<Awaited<ReturnType<typeof storyboardsRepo.findStoryboardById>>>

async function resolveSlideshowTargetDuration(storyboard: StoryboardRow, paths: SlideshowPaths): Promise<number> {
  const parsed = parseDialogueForTTS(storyboard.dialogue)
  if (!parsed.ignorable && parsed.pureText && storyboard.ttsAudioUrl) {
    const audioPath = resolvePath(storyboard.ttsAudioUrl, paths)
    if (fs.existsSync(audioPath)) {
      const audioDurationSec = await probeMediaDuration(audioPath)
      if (audioDurationSec > 0) return Math.max(3, audioDurationSec)
    }
  }
  return Math.max(3, storyboard.duration || 10)
}

async function renderStoryboardSlideshowAtDuration(
  storyboard: StoryboardRow,
  durationSec: number,
  paths: SlideshowPaths,
): Promise<string> {
  const keyframes = collectSlideshowKeyframePaths(storyboard)
  if (!keyframes.length) throw new Error(`Storyboard ${storyboard.id} has no keyframe images`)

  const absolutePaths = keyframes
    .map(relative => resolvePath(relative, paths))
    .filter(relative => fs.existsSync(relative))
  if (!absolutePaths.length) throw new Error(`Storyboard ${storyboard.id} keyframe files are missing on disk`)

  const outputDir = path.join(paths.staticRoot, 'slideshow')
  const tempRoot = path.join(paths.staticRoot, 'temp')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(tempRoot, { recursive: true })

  const tempDir = path.join(tempRoot, randomUUID())
  fs.mkdirSync(tempDir, { recursive: true })

  const outputFilename = `${randomUUID()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  try {
    await renderSlideshowFromImages({
      imagePaths: absolutePaths,
      durationSec,
      outputPath,
      tempDir,
    })

    return `static/slideshow/${outputFilename}`
  } finally {
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Regenerate slideshow clip when its length does not match the target (e.g. TTS duration). */
export async function ensureStoryboardSlideshowDuration(
  storyboardId: number,
  targetDurationSec: number,
  paths: SlideshowPaths,
): Promise<string> {
  const storyboard = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!storyboard) throw new Error(`Storyboard ${storyboardId} not found`)

  const durationSec = Math.max(3, targetDurationSec)
  const currentUrl = getFrameVideoUrl(storyboard.referenceImages)
  if (currentUrl) {
    const currentPath = resolvePath(currentUrl, paths)
    if (fs.existsSync(currentPath)) {
      const currentDurationSec = await probeMediaDuration(currentPath)
      if (Math.abs(currentDurationSec - durationSec) <= SLIDESHOW_DURATION_TOLERANCE_SEC) {
        return currentUrl
      }
    }
  }

  logTaskStart('SlideshowTask', 'storyboard-slideshow-resync', {
    storyboardId,
    storyboardNumber: storyboard.storyboardNumber,
    durationSec,
  })

  const relative = await renderStoryboardSlideshowAtDuration(storyboard, durationSec, paths)
  await storyboardsRepo.updateStoryboard(storyboardId, {
    referenceImages: mergeFrameVideoUrl(storyboard.referenceImages, relative),
    updatedAt: now(),
  })

  logTaskSuccess('SlideshowTask', 'storyboard-slideshow-resync', {
    storyboardId,
    output: relative,
    durationSec,
  })
  return relative
}

/** 已有静帧片段时，按对白/TTS 目标时长重新对齐（数字导演配音阶段后调用） */
export async function alignStoryboardSlideshowToTargetDuration(
  storyboardId: number,
  paths: SlideshowPaths,
): Promise<string | null> {
  const storyboard = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!storyboard || !getFrameVideoUrl(storyboard.referenceImages)) return null
  const durationSec = await resolveSlideshowTargetDuration(storyboard, paths)
  return ensureStoryboardSlideshowDuration(storyboardId, durationSec, paths)
}

export async function generateStoryboardSlideshow(storyboardId: number, paths: SlideshowPaths): Promise<string> {
  const storyboard = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!storyboard) throw new Error(`Storyboard ${storyboardId} not found`)

  await assertFrameSlideshowEpisode(storyboard.episodeId)

  logTaskStart('SlideshowTask', 'storyboard-slideshow', {
    storyboardId,
    storyboardNumber: storyboard.storyboardNumber,
    frames: collectSlideshowKeyframePaths(storyboard).length,
  })

  const durationSec = await resolveSlideshowTargetDuration(storyboard, paths)

  try {
    const relative = await renderStoryboardSlideshowAtDuration(storyboard, durationSec, paths)
    await storyboardsRepo.updateStoryboard(storyboardId, {
      referenceImages: mergeFrameVideoUrl(storyboard.referenceImages, relative),
      updatedAt: now(),
    })

    logTaskSuccess('SlideshowTask', 'storyboard-slideshow', {
      storyboardId,
      output: relative,
      durationSec,
    })
    return relative
  } catch (err) {
    logTaskError('SlideshowTask', 'storyboard-slideshow', {
      storyboardId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

export function resolveStoryboardMotionVideoUrl(storyboard: {
  videoUrl?: string | null
  referenceImages?: string | null
}, pipeline: ProductionPipeline): string | null {
  if (pipeline === 'frame_slideshow') {
    return getFrameVideoUrl(storyboard.referenceImages)
  }
  return storyboard.videoUrl || null
}

export function resolveStoryboardComposedVideoUrl(storyboard: {
  composedVideoUrl?: string | null
  referenceImages?: string | null
}, pipeline: ProductionPipeline): string | null {
  if (pipeline === 'frame_slideshow') {
    return getFrameComposedVideoUrl(storyboard.referenceImages)
  }
  return storyboard.composedVideoUrl || null
}

export function storyboardHasMotionVideo(storyboard: {
  videoUrl?: string | null
  referenceImages?: string | null
}, pipeline: ProductionPipeline): boolean {
  return !!resolveStoryboardMotionVideoUrl(storyboard, pipeline)
}

export function storyboardHasComposedVideo(storyboard: {
  composedVideoUrl?: string | null
  referenceImages?: string | null
}, pipeline: ProductionPipeline): boolean {
  return !!resolveStoryboardComposedVideoUrl(storyboard, pipeline)
}
