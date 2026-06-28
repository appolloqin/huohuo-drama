/**
 * 阿里云百炼（万相）图片生成 — multimodal-generation + 任务轮询
 */
import type { ImageProviderAdapter, ImageGenerationRecord } from './types.js'
import { joinProviderUrl } from './url.js'
import {
  buildWanGenerationBody,
  DASHSCOPE_DEFAULT_HOST,
  mapAliPollStatus,
  parseAliSubmitOutcome,
  parseReferenceUrlList,
  pickInlineImageFromAliResult,
} from './ali-image-helpers.js'

export class AliImageAdapter implements ImageProviderAdapter {
  readonly provider = 'ali'

  buildGenerateRequest(config: any, record: ImageGenerationRecord) {
    const baseUrl = config.baseUrl || DASHSCOPE_DEFAULT_HOST
    const referenceImages = parseReferenceUrlList(record.referenceImages)
    return {
      url: joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/multimodal-generation/generation'),
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: buildWanGenerationBody(record, referenceImages),
    }
  }

  parseGenerateResponse(result: any) {
    return parseAliSubmitOutcome(result)
  }

  buildPollRequest(config: any, taskId: string) {
    const baseUrl = config.baseUrl || DASHSCOPE_DEFAULT_HOST
    return {
      url: joinProviderUrl(baseUrl, '/api/v1', `/tasks/${taskId}`),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any) {
    const mapped = mapAliPollStatus(result.output?.task_status)

    if (mapped === 'completed') {
      return { status: 'completed' as const, imageUrl: pickInlineImageFromAliResult(result) || undefined }
    }
    if (mapped === 'failed') {
      return { status: 'failed' as const, error: result.message || 'Generation failed' }
    }
    return { status: mapped }
  }

  extractImageBase64(_result: any) {
    return null
  }

  extractImageUrl(result: any) {
    return pickInlineImageFromAliResult(result)
  }
}
