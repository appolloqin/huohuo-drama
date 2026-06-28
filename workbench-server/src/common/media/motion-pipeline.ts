import * as episodesRepo from '../../db/repos/episodes/index.js'
import { readProductionPipeline, type ProductionPipeline } from '../drama/episode-meta.js'

export async function resolveEpisodeMotionPipeline(
  episodeId: number,
  motionPipeline?: ProductionPipeline,
): Promise<ProductionPipeline> {
  if (motionPipeline) return motionPipeline
  const episode = await episodesRepo.findEpisodeById(episodeId)
  return readProductionPipeline(episode?.metadata)
}
