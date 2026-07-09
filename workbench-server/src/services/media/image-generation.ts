import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import { resolveUserServiceConfig, shouldChargeServiceGeneration, type ConfigResolveOpts } from '../ai/ai.js'
import { now } from '../../common/http/response.js'
import { getImageAdapter } from '../ai/adapters/registry.js'
import type { AIConfig } from '../ai/ai.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, redactUrl } from '../../common/task/task-logger.js'
import { consumeCredits, resolveCreditCostFromConfig } from '../credits/credits.js'
import { normalizeMediaReferenceList } from './media-reference.js'
import { finalizeImageFromBase64, finalizeImageFromUrl, markLinkedSceneFailed } from '../drama/generation-finalizer.js'
import { pollImageGeneration } from './image-generation-poll.js'
import { defaultAspectRatioForScope } from '../../common/media/image-aspect-presets.js'

interface GenerateImageParams {
  userId?: number
  userRole?: string
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  characterFormId?: number
  propId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

async function insertImageGenerationRow(params: GenerateImageParams, config: AIConfig) {
  const timestamp = now()
  const insertResult = await imageGenerationsRepo.insertImageGeneration({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    characterFormId: params.characterFormId,
    propId: params.propId,
    prompt: params.prompt,
    model: params.model || config.model,
    provider: config.provider,
    size: params.size || defaultAspectRatioForScope('shot'),
    frameType: params.frameType,
    referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
    status: 'processing',
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  return insertResult.lastInsertRowid
}

async function runImageGenerationWorker(id: number, config: AIConfig) {
  const adapter = getImageAdapter(config.provider)

  try {
    const record = await imageGenerationsRepo.findImageGenerationById(id)
    if (!record) return

    logTaskProgress('ImageTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
    })

    const references = await normalizeMediaReferenceList(record.referenceImages, 'ImageTask')
    const request = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      size: record.size,
      frameType: record.frameType,
      referenceImages: references.length ? JSON.stringify(references) : null,
    })

    logTaskProgress('ImageTask', 'request', {
      id,
      provider: config.provider,
      method: request.method,
      url: redactUrl(request.url),
      model: record.model,
    })
    logTaskPayload('ImageTask', 'request payload', {
      id,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    })

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(600_000),
    })
    if (!response.ok) {
      throw new Error(`API error ${response.status}: ${await response.text()}`)
    }

    const payload = await response.json()
    logTaskPayload('ImageTask', 'response payload', { id, provider: config.provider, result: payload })

    const parsed = adapter.parseGenerateResponse(payload)
    if (!parsed.isAsync && parsed.imageUrl) {
      logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl: parsed.imageUrl })
      await finalizeImageFromUrl(id, config.provider, parsed.imageUrl)
      return
    }

    if (!parsed.isAsync && !parsed.imageUrl) {
      const inline = adapter.extractImageBase64(payload)
      if (inline) {
        logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: inline.mimeType })
        await finalizeImageFromBase64(id, config.provider, inline.data, inline.mimeType)
        return
      }
      throw new Error('No image URL or base64 data in response')
    }

    await imageGenerationsRepo.updateImageGeneration(id, {
      taskId: parsed.taskId,
      status: 'processing',
      updatedAt: now(),
    })
    logTaskProgress('ImageTask', 'poll-start', { id, taskId: parsed.taskId, provider: config.provider })
    await pollImageGeneration(id, config, parsed.taskId!)
  } catch (err: any) {
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: err.message })
    await imageGenerationsRepo.updateImageGeneration(id, {
      status: 'failed',
      errorMsg: err.message,
      updatedAt: now(),
    })
    await markLinkedSceneFailed(id)
  }
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const configOpts: ConfigResolveOpts | undefined = params.userId
    ? { userId: params.userId, role: params.userRole }
    : undefined

  const { config, source } = await resolveUserServiceConfig('image', {
    ...configOpts,
    configId: params.configId,
  })

  const creditCost = resolveCreditCostFromConfig(config, 0)

  if (params.userId) {
    const shouldCharge = await shouldChargeServiceGeneration(
      params.userId,
      params.userRole,
      'image',
      source,
    )
    if (shouldCharge) {
      await consumeCredits({
        userId: params.userId,
        amount: creditCost,
        reason: '图片生成',
        serviceType: 'image',
        provider: config.provider,
        model: params.model || config.model,
        resourceType: 'image_generation',
      })
    }
  }

  const jobId = await insertImageGenerationRow(params, config)
  logTaskStart('ImageTask', 'enqueue', {
    id: jobId,
    provider: config.provider,
    creditCost,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id: jobId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })

  runImageGenerationWorker(jobId, config).catch((err: Error) => {
    logTaskError('ImageTask', 'process', { id: jobId, error: err.message })
    console.error(`Image generation ${jobId} failed:`, err)
  })

  return jobId
}
