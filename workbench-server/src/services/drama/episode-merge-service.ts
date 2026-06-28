import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'node:crypto'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as videoMergesRepo from '../../db/repos/video-merges/index.js'
import { configureFfmpegPaths } from '../../common/media/ffmpeg-path.js'
import { now } from '../../common/http/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { formatConcatListLine, normalizeClipForConcat } from './compose-ffmpeg.js'
import { ensureFrameSlideshowBgmLoop } from '../../common/media/frame-slideshow-bgm.js'
import { mergeEpisodeMetadata, readEpisodeFrameMergedUrl, type ProductionPipeline } from '../../common/drama/episode-meta.js'
import { resolveEpisodeMotionPipeline } from '../../common/media/motion-pipeline.js'
import {
  resolveStoryboardComposedVideoUrl,
  resolveStoryboardMotionVideoUrl,
  storyboardHasComposedVideo,
  storyboardHasMotionVideo,
} from './storyboard-slideshow-service.js'

configureFfmpegPaths()

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const STATIC_ROOT = process.env.STORAGE_PATH || path.resolve(moduleDir, '../../../workbench-data/static')
const DATA_ROOT = path.resolve(moduleDir, '../../../workbench-data')

function resolveMediaPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STATIC_ROOT, relativePath)
}

function mergeJobTitle(episodeId: number, pipeline: ProductionPipeline) {
  return `Episode ${episodeId} Merge [${pipeline}]`
}

async function loadComposedClipUrls(episodeId: number, motionPipeline?: ProductionPipeline) {
  const pipeline = await resolveEpisodeMotionPipeline(episodeId, motionPipeline)
  const storyboards = await episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
  const ready = storyboards.filter(item =>
    storyboardHasComposedVideo(item, pipeline) || storyboardHasMotionVideo(item, pipeline),
  )
  if (ready.length !== storyboards.length) {
    throw new Error(`Only storyboards with video can be merged (${ready.length}/${storyboards.length} ready)`)
  }

  const clips = storyboards
    .map(item => resolveStoryboardComposedVideoUrl(item, pipeline) || resolveStoryboardMotionVideoUrl(item, pipeline))
    .filter(Boolean) as string[]
  if (!clips.length) throw new Error('No videos to merge')
  return { clips, pipeline }
}

async function createMergeJob(episodeId: number, dramaId: number, clips: string[], pipeline: ProductionPipeline) {
  const timestamp = now()
  const insertResult = await videoMergesRepo.insertVideoMerge({
    episodeId,
    dramaId,
    title: mergeJobTitle(episodeId, pipeline),
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify(clips),
    motionPipeline: pipeline,
    createdAt: timestamp,
  })

  return Number(insertResult.lastInsertRowid)
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(0)
        return
      }
      resolve(Math.round(metadata.format.duration || 0))
    })
  })
}

async function concatClips(clips: string[], pipeline: ProductionPipeline): Promise<{ outputPath: string; relativePath: string }> {
  const tempDir = path.join(STATIC_ROOT, 'temp')
  const outputDir = path.join(STATIC_ROOT, 'merged')
  fs.mkdirSync(tempDir, { recursive: true })
  fs.mkdirSync(outputDir, { recursive: true })

  const backgroundMusicPath = pipeline === 'frame_slideshow'
    ? ensureFrameSlideshowBgmLoop(STATIC_ROOT)
    : null

  const normalizedPaths: string[] = []
  const cleanupPaths: string[] = []

  try {
    for (const clip of clips) {
      const sourcePath = resolveMediaPath(clip)
      const normalizedPath = path.join(tempDir, `${randomUUID()}.mp4`)
      await normalizeClipForConcat(sourcePath, normalizedPath, { backgroundMusicPath })
      normalizedPaths.push(normalizedPath)
      cleanupPaths.push(normalizedPath)
    }

    const listPath = path.join(tempDir, `${randomUUID()}.txt`)
    cleanupPaths.push(listPath)
    const listContent = normalizedPaths.map(formatConcatListLine).join('\n')
    fs.writeFileSync(listPath, listContent, 'utf-8')

    const outputFilename = `${randomUUID()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-c', 'copy',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })

    return { outputPath, relativePath: `static/merged/${outputFilename}` }
  } finally {
    for (const filePath of cleanupPaths) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

async function finalizeMerge(
  mergeId: number,
  episodeId: number,
  relativePath: string,
  outputPath: string,
  clipCount: number,
  pipeline: ProductionPipeline,
) {
  const duration = await probeDuration(outputPath)
  const timestamp = now()

  await videoMergesRepo.updateVideoMerge(mergeId, {
    status: 'completed',
    mergedUrl: relativePath,
    duration,
    completedAt: timestamp,
  })

  if (pipeline === 'frame_slideshow') {
    const episode = await episodesRepo.findEpisodeById(episodeId)
    await episodesRepo.updateEpisode(episodeId, {
      metadata: mergeEpisodeMetadata(episode?.metadata, {
        frame_merged_url: relativePath,
        frame_merged_duration: duration,
      }),
      updatedAt: timestamp,
    })
  } else {
    await episodesRepo.updateEpisode(episodeId, { videoUrl: relativePath, duration, updatedAt: timestamp })
  }

  logTaskSuccess('MergeTask', 'episode-merge', {
    mergeId,
    episodeId,
    output: relativePath,
    duration,
    clips: clipCount,
  })
}

export async function prepareEpisodeMerge(episodeId: number, dramaId: number, motionPipeline?: ProductionPipeline) {
  const { clips, pipeline } = await loadComposedClipUrls(episodeId, motionPipeline)
  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: clips.length, pipeline })
  const mergeId = await createMergeJob(episodeId, dramaId, clips, pipeline)
  return { mergeId, clips, pipeline }
}

async function runMerge(
  mergeId: number,
  episodeId: number,
  clips: string[],
  pipeline: ProductionPipeline,
) {
  const { outputPath, relativePath } = await concatClips(clips, pipeline)
  await finalizeMerge(mergeId, episodeId, relativePath, outputPath, clips.length, pipeline)
}

export async function mergeEpisodeVideos(episodeId: number, dramaId: number, motionPipeline?: ProductionPipeline): Promise<number> {
  const { mergeId, clips, pipeline } = await prepareEpisodeMerge(episodeId, dramaId, motionPipeline)

  runMerge(mergeId, episodeId, clips, pipeline).catch(async (err: Error) => {
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    await videoMergesRepo.updateVideoMerge(mergeId, { status: 'failed', errorMsg: err.message })
  })

  return mergeId
}

export async function mergeEpisodeVideosAndWait(
  episodeId: number,
  dramaId: number,
  motionPipeline?: ProductionPipeline,
): Promise<string> {
  const { mergeId, clips, pipeline } = await prepareEpisodeMerge(episodeId, dramaId, motionPipeline)
  await runMerge(mergeId, episodeId, clips, pipeline)

  if (pipeline === 'frame_slideshow') {
    const episode = await episodesRepo.findEpisodeById(episodeId)
    const url = readEpisodeFrameMergedUrl(episode?.metadata)
    if (!url) throw new Error('Merge completed but frame_merged_url is empty')
    return url
  }

  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode?.videoUrl) throw new Error('Merge completed but episode video_url is empty')
  return episode.videoUrl
}
