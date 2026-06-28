import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import { now } from '../../common/http/response.js'
import { resolveUserServiceConfig, shouldChargeServiceGeneration, type ConfigResolveOpts } from '../ai/ai.js'
import type { AIConfig } from '../ai/ai.js'
import { logTaskError, logTaskPayload, logTaskStart } from '../../common/task/task-logger.js'
import { consumeCredits, resolveCreditCostFromConfig } from '../credits/credits.js'
import { runVideoGenerationJob } from './video-generation-dispatch.js'

export interface GenerateVideoParams {
  userId?: number
  userRole?: string
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  duration?: number
  aspectRatio?: string
  configId?: number
  generateAudio?: boolean
  generateSubtitles?: boolean
}

async function insertVideoJob(params: GenerateVideoParams, config: AIConfig): Promise<number> {
  const timestamp = now()
  const insertResult = await videoGenerationsRepo.insertVideoGeneration({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: params.prompt,
    model: params.model || config.model,
    provider: config.provider,
    referenceMode: params.referenceMode || 'none',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls ? JSON.stringify(params.referenceImageUrls) : null,
    duration: params.duration || 5,
    aspectRatio: params.aspectRatio || '16:9',
    style: JSON.stringify({
      generate_audio: params.generateAudio !== false,
      generate_subtitles: params.generateSubtitles === true,
    }),
    status: 'processing',
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  return Number(insertResult.lastInsertRowid)
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const configOpts: ConfigResolveOpts | undefined = params.userId
    ? { userId: params.userId, role: params.userRole }
    : undefined

  const { config, source } = await resolveUserServiceConfig('video', {
    ...configOpts,
    configId: params.configId,
  })

  const creditCost = resolveCreditCostFromConfig(config, 0)
  if (params.userId) {
    const shouldCharge = await shouldChargeServiceGeneration(
      params.userId,
      params.userRole,
      'video',
      source,
    )
    if (shouldCharge) {
      await consumeCredits({
        userId: params.userId,
        amount: creditCost,
        reason: '视频生成',
        serviceType: 'video',
        provider: config.provider,
        model: params.model || config.model,
        resourceType: 'video_generation',
      })
    }
  }

  const jobId = await insertVideoJob(params, config)
  logTaskStart('VideoTask', 'enqueue', {
    id: jobId,
    provider: config.provider,
    creditCost,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'none',
    duration: params.duration || 5,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id: jobId,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })

  runVideoGenerationJob(jobId, config).catch((err: Error) => {
    logTaskError('VideoTask', 'process', { id: jobId, error: err.message })
    console.error(`Video generation ${jobId} failed:`, err)
  })

  return jobId
}
