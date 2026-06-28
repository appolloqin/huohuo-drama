import { isAspectRatioSpec, isPixelSizeSpec } from '../../../common/media/image-size-spec.js'
import { parseDataUrl } from '../../../common/media/storage.js'
import { joinProviderUrl } from './url.js'

export function toGeminiModelResourcePath(model?: string | null, fallback = 'gemini-2.5-flash-image') {
  const modelName = model || fallback
  return modelName.startsWith('models/') ? modelName : `models/${modelName}`
}

export function assembleGeminiPromptParts(prompt?: string | null, referenceImages?: string | null) {
  const parts: Array<Record<string, unknown>> = []

  if (referenceImages) {
    try {
      const refs = JSON.parse(referenceImages)
      for (const ref of refs) {
        const parsed = parseDataUrl(String(ref || ''))
        if (parsed) {
          parts.push({
            inline_data: {
              mime_type: parsed.mimeType,
              data: parsed.data,
            },
          })
        }
      }
    } catch {}
  }

  parts.push({ text: prompt || 'Generate an image' })
  return parts
}

export function geminiRequestHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    Authorization: `Bearer ${apiKey}`,
  }
}

export function geminiGenerateContentUrl(baseUrl: string, modelPath: string, apiKey: string) {
  const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/${modelPath}:generateContent`))
  url.searchParams.set('key', apiKey)
  return url.toString()
}

export function deriveGeminiAspectRatio(size?: string | null): string {
  if (isAspectRatioSpec(size)) return size
  if (!size || !isPixelSizeSpec(size)) return '16:9'
  const [width, height] = size.split('x').map(Number)
  if (!width || !height) return '16:9'
  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

export function deriveGeminiOutputResolution(size?: string | null): string {
  if (isAspectRatioSpec(size)) return '1K'
  if (!size || !isPixelSizeSpec(size)) return '1K'
  const [width] = size.split('x').map(Number)
  if (!width) return '1K'
  if (width >= 2048) return '4K'
  if (width >= 1024) return '2K'
  if (width >= 512) return '1K'
  return '512'
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

export function parseGeminiInlineImagePayload(result: any): { data: string; mimeType: string } | null {
  const direct = result?.data?.[0]?.b64_json
  if (direct) return { data: direct, mimeType: 'image/png' }

  const parts = result?.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) {
      return {
        data: inline.data,
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
      }
    }
  }
  return null
}

export function parseGeminiHostedImageUrl(result: any): string | null {
  return result?.data?.[0]?.url || result?.image_url || result?.url || null
}
