import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types.js'
import {
  assembleGeminiPromptParts,
  deriveGeminiAspectRatio,
  deriveGeminiOutputResolution,
  geminiGenerateContentUrl,
  geminiRequestHeaders,
  parseGeminiHostedImageUrl,
  parseGeminiInlineImagePayload,
  toGeminiModelResourcePath,
} from './gemini-image-helpers.js'

export class GeminiImageAdapter implements ImageProviderAdapter {
  readonly provider = 'gemini'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = toGeminiModelResourcePath(record.model || config.model)
    return {
      url: geminiGenerateContentUrl(config.baseUrl, model, config.apiKey),
      method: 'POST',
      headers: geminiRequestHeaders(config.apiKey),
      body: {
        contents: [{ parts: assembleGeminiPromptParts(record.prompt, record.referenceImages) }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: {
            aspectRatio: deriveGeminiAspectRatio(record.size),
            imageSize: deriveGeminiOutputResolution(record.size),
          },
        },
      },
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const candidate = result?.candidates?.[0]
    const finishReason = candidate?.finishReason || candidate?.finish_reason
    const finishMessage = candidate?.finishMessage || candidate?.finish_message

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(finishMessage || `Gemini generation stopped: ${finishReason}`)
    }

    const imageUrl = parseGeminiHostedImageUrl(result)
    if (imageUrl) return { isAsync: false, imageUrl }

    if (parseGeminiInlineImagePayload(result)) {
      return { isAsync: false, imageUrl: undefined }
    }

    const taskId = result?.task_id || result?.id
    if (taskId) return { isAsync: true, taskId }

    if (result?.error) {
      throw new Error(result.error.message || 'Gemini generation failed')
    }
    throw new Error('No image data in Gemini response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: geminiGenerateContentUrl(config.baseUrl, taskId, config.apiKey),
      method: 'GET',
      headers: geminiRequestHeaders(config.apiKey),
      body: undefined,
    }
  }

  parsePollResponse(): ImagePollResponse {
    return { status: 'completed' }
  }

  extractImageUrl(result: any): string | null {
    return parseGeminiHostedImageUrl(result)
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    return parseGeminiInlineImagePayload(result)
  }
}
