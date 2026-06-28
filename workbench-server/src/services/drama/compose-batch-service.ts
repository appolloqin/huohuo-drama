import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import { toSnakeCase } from '../../common/http/transform.js'
import type { ProductionPipeline } from '../../common/drama/episode-meta.js'
import { resolveEpisodeMotionPipeline } from '../../common/media/motion-pipeline.js'
import { composeStoryboard } from './ffmpeg-compose.js'
import {
  resolveStoryboardComposedVideoUrl,
  resolveStoryboardMotionVideoUrl,
  storyboardHasComposedVideo,
  storyboardHasMotionVideo,
} from './storyboard-slideshow-service.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

export async function composeSingleStoryboard(storyboardId: number, motionPipeline?: ProductionPipeline) {
  logTaskStart('ComposeAPI', 'single-compose', { storyboardId, motionPipeline })
  const composedUrl = await composeStoryboard(storyboardId, motionPipeline)
  logTaskSuccess('ComposeAPI', 'single-compose', { storyboardId, output: composedUrl })
  return { id: storyboardId, composed_video_url: composedUrl }
}

export async function startEpisodeBatchCompose(episodeId: number, motionPipeline?: ProductionPipeline) {
  const pipeline = await resolveEpisodeMotionPipeline(episodeId, motionPipeline)
  const storyboards = await episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
  if (!storyboards.length) {
    return { ok: false as const, error: 'No storyboards found' }
  }

  const withVideo = storyboards.filter(item => storyboardHasMotionVideo(item, pipeline))
  if (!withVideo.length) {
    return {
      ok: false as const,
      error: pipeline === 'frame_slideshow'
        ? 'No storyboards have slideshow clips yet'
        : 'No storyboards have video yet',
    }
  }

  await storyboardsRepo.updateStoryboardsByEpisode(episodeId, { status: 'compose_processing' })

  void (async () => {
    for (const shot of withVideo) {
      try {
        await composeStoryboard(shot.id, pipeline)
      } catch (err: any) {
        logTaskError('ComposeAPI', 'batch-item', {
          storyboardId: shot.id,
          episodeId,
          error: err.message,
        })
      }
    }
    logTaskSuccess('ComposeAPI', 'batch-compose', { episodeId, total: withVideo.length })
  })()

  logTaskStart('ComposeAPI', 'batch-compose', { episodeId, total: withVideo.length })
  return {
    ok: true as const,
    message: `Started composing ${withVideo.length} storyboards`,
    total: withVideo.length,
  }
}

export async function getEpisodeComposeStatus(episodeId: number, motionPipeline?: ProductionPipeline) {
  const pipeline = await resolveEpisodeMotionPipeline(episodeId, motionPipeline)
  const storyboards = await episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
  const withVideo = storyboards.filter(item => storyboardHasMotionVideo(item, pipeline))
  const completed = withVideo.filter(item =>
    item.status === 'compose_completed' && storyboardHasComposedVideo(item, pipeline),
  )
  const failed = withVideo.filter(item => item.status === 'compose_failed')
  const processing = withVideo.filter(item => item.status === 'compose_processing')
  const idle = withVideo.filter(item => !item.status || !String(item.status).startsWith('compose_'))

  return {
    pipeline,
    total: withVideo.length,
    completed: completed.length,
    failed: failed.length,
    processing: processing.length,
    idle: idle.length,
    items: withVideo.map(item => toSnakeCase({
      id: item.id,
      storyboardNumber: item.storyboardNumber,
      status: item.status || 'pending',
      composedVideoUrl: resolveStoryboardComposedVideoUrl(item, pipeline),
      motionVideoUrl: resolveStoryboardMotionVideoUrl(item, pipeline),
      errorMsg: item.status === 'compose_failed'
        ? '视频合成失败，请检查视频、配音或字幕素材'
        : '',
    })),
  }
}
