/**
 * 项目资源访问：数据归属查询（不含 HTTP / 业务规则）。
 */
import * as accessRepo from '../../db/repos/access/index.js'

export const dramaOwnedByUser = accessRepo.dramaOwnedByUser
export const episodeAndDramaForUser = accessRepo.episodeAndDramaForUser
export const characterDramaForUser = accessRepo.characterDramaForUser
export const characterFormDramaForUser = accessRepo.characterFormDramaForUser
export const propDramaForUser = accessRepo.propDramaForUser
export const sceneDramaForUser = accessRepo.sceneDramaForUser
export const storyboardEpisodeForUser = accessRepo.storyboardEpisodeForUser
export const imageGenerationForUser = accessRepo.imageGenerationForUser
export const videoGenerationForUser = accessRepo.videoGenerationForUser
export const storyboardsOwnedByUser = accessRepo.storyboardsOwnedByUser
