import * as episodesRepo from '../../db/repos/episodes/index.js'
import { readProductionPipeline } from '../../common/drama/episode-meta.js'
import { getFrameVideoUrl } from '../../common/drama/storyboard-frame-meta.js'
import { toSnakeCase } from '../../common/http/transform.js'
import {
  assertFrameSlideshowEpisode,
  generateStoryboardSlideshow,
  storyboardHasSlideshowClip,
} from './storyboard-slideshow-service.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import path from 'path'
import { fileURLToPath } from 'url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const STATIC_ROOT = process.env.STORAGE_PATH || path.resolve(moduleDir, '../../../workbench-data/static')
const DATA_ROOT = path.resolve(moduleDir, '../../../workbench-data')
const PATHS = { staticRoot: STATIC_ROOT, dataRoot: DATA_ROOT }

export async function renderSingleStoryboardSlideshow(storyboardId: number) {
  logTaskStart('SlideshowAPI', 'single-slideshow', { storyboardId })
  const frameVideoUrl = await generateStoryboardSlideshow(storyboardId, PATHS)
  logTaskSuccess('SlideshowAPI', 'single-slideshow', { storyboardId, output: frameVideoUrl })
  return { id: storyboardId, frame_video_url: frameVideoUrl }
}

export async function startEpisodeBatchSlideshow(episodeId: number) {
  await assertFrameSlideshowEpisode(episodeId)
  const storyboards = await episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
  if (!storyboards.length) {
    return { ok: false as const, error: 'No storyboards found' }
  }

  const eligible = storyboards.filter(item => !storyboardHasSlideshowClip(item.referenceImages))
  if (!eligible.length) {
    return { ok: false as const, error: 'All storyboards already have slideshow clips' }
  }

  void (async () => {
    for (const shot of eligible) {
      try {
        await generateStoryboardSlideshow(shot.id, PATHS)
      } catch (err: unknown) {
        logTaskError('SlideshowAPI', 'batch-item', {
          storyboardId: shot.id,
          episodeId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    logTaskSuccess('SlideshowAPI', 'batch-slideshow', { episodeId, total: eligible.length })
  })()

  logTaskStart('SlideshowAPI', 'batch-slideshow', { episodeId, total: eligible.length })
  return {
    ok: true as const,
    message: `Started slideshow for ${eligible.length} storyboards`,
    total: eligible.length,
  }
}

export async function getEpisodeSlideshowStatus(episodeId: number) {
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode) throw new Error(`Episode ${episodeId} not found`)
  const pipeline = readProductionPipeline(episode.metadata)
  const storyboards = await episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
  const withClip = storyboards.filter(item => storyboardHasSlideshowClip(item.referenceImages))
  const pending = storyboards.filter(item => !storyboardHasSlideshowClip(item.referenceImages))

  return {
    pipeline,
    total: storyboards.length,
    completed: withClip.length,
    pending: pending.length,
    items: storyboards.map(item => toSnakeCase({
      id: item.id,
      storyboardNumber: item.storyboardNumber,
      frameVideoUrl: getFrameVideoUrl(item.referenceImages),
      ready: storyboardHasSlideshowClip(item.referenceImages),
    })),
  }
}
