import { mergeEpisodeVideos } from './ffmpeg-merge.js'
import * as videoMergesRepo from '../../db/repos/video-merges/index.js'
import { parseMotionPipelineQuery, type ProductionPipeline } from '../../common/drama/episode-meta.js'
import { toSnakeCase } from '../../common/http/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

/**
 * Pick the newest merge job for a given pipeline. Pipeline isolation is enforced
 * via the `motion_pipeline` column so the AI workbench never receives a
 * frame_slideshow merge (and vice versa) — previously a fragile title-substring
 * match plus an AI fallback returned the latest job of ANY pipeline, which made
 * the frame workbench's export cover the AI workbench's export.
 *
 * Legacy rows created before the `motion_pipeline` column existed have a null
 * value; for those we fall back to the title tag `[<pipeline>]` so historical
 * AI merges (titled `Episode N Merge [ai_video]` or the untagged pre-pipeline
 * `Episode N Merge`) still resolve for the AI workbench.
 */
function pickLatestMergeForPipeline(
  merges: Awaited<ReturnType<typeof videoMergesRepo.listVideoMergesByEpisode>>,
  pipeline: ProductionPipeline,
) {
  if (!merges.length) return null
  const byNewest = [...merges].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))

  const tagged = byNewest.filter(item => item.motionPipeline === pipeline)
  if (tagged.length) return tagged[0]

  // Legacy fallback: rows without motion_pipeline. Only the AI workbench ever
  // produced untagged merges, so attribute them to ai_video. Never let these
  // surface for the frame workbench.
  if (pipeline === 'ai_video') {
    const legacyAi = byNewest.filter(
      item => !item.motionPipeline
        && (item.title || '').includes(`[${pipeline}]`),
    )
    if (legacyAi.length) return legacyAi[0]
    const untagged = byNewest.filter(item => !item.motionPipeline && !(item.title || '').includes('[frame_slideshow]'))
    if (untagged.length) return untagged[0]
  }

  return null
}

export async function triggerEpisodeMerge(
  episodeId: number,
  dramaId: number,
  motionPipeline?: ProductionPipeline,
) {
  logTaskStart('MergeAPI', 'episode-merge', { episodeId, dramaId, motionPipeline })
  try {
    const mergeId = await mergeEpisodeVideos(episodeId, dramaId, motionPipeline)
    logTaskSuccess('MergeAPI', 'episode-merge', { episodeId, mergeId })
    return { merge_id: mergeId, status: 'processing' as const }
  } catch (err: any) {
    logTaskError('MergeAPI', 'episode-merge', { episodeId, error: err.message })
    throw err
  }
}

export async function fetchEpisodeMergeStatus(
  episodeId: number,
  motionPipeline?: ProductionPipeline,
  mergeId?: number,
) {
  const pipeline = motionPipeline || 'ai_video'

  if (mergeId) {
    const merge = await videoMergesRepo.findVideoMergeById(mergeId)
    // Reject jobs that don't belong to this episode or this pipeline so a
    // leftover job from the other workbench can never leak its merged_url here.
    if (!merge || merge.episodeId !== episodeId) return null
    if (merge.motionPipeline && merge.motionPipeline !== pipeline) return null
    if (!merge.motionPipeline && pipeline === 'frame_slideshow') return null
    return toSnakeCase(merge)
  }

  const merges = await videoMergesRepo.listVideoMergesByEpisode(episodeId)
  const latest = pickLatestMergeForPipeline(merges, pipeline)
  return latest ? toSnakeCase(latest) : null
}
