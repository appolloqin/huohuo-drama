import { readEpisodeFrameMergedUrl, readProductionPipeline, type ProductionPipeline } from './episode-meta.js'

/** 短剧集「是否已完成」— 以成片（集级合并视频）为准，而非仅有剧本 */

export function isDramaEpisodeMerged(videoUrl: string | null | undefined): boolean {
  return !!(videoUrl || '').trim()
}

export function isDramaEpisodeMergedForPipeline(
  episode: { videoUrl?: string | null; metadata?: string | null },
  pipeline?: ProductionPipeline,
): boolean {
  const resolved = pipeline || readProductionPipeline(episode.metadata)
  if (resolved === 'frame_slideshow') {
    return !!readEpisodeFrameMergedUrl(episode.metadata)
  }
  return isDramaEpisodeMerged(episode.videoUrl)
}

/** 数字导演 / 列表「待处理」：尚未出片（无集级合并视频） */
export function isDramaEpisodePending(
  videoUrl: string | null | undefined,
  metadata?: string | null,
): boolean {
  return !isDramaEpisodeMergedForPipeline({ videoUrl, metadata })
}
