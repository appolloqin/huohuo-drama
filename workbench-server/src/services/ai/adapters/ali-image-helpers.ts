import type { ImageGenerationRecord } from './types.js'
import {
  isAspectRatioSpec,
  isPixelSizeSpec,
  mapAspectRatioToWanPixels,
} from '../../../common/media/image-size-spec.js'

export const DASHSCOPE_DEFAULT_HOST = 'https://dashscope.aliyuncs.com'

export function mapSizeToWanPixels(size: string): string {
  if (isAspectRatioSpec(size)) return mapAspectRatioToWanPixels(size)
  const [w, h] = size.split('x').map(Number)
  if (w && h) {
    const aspect = w / h
    if (aspect > 1.7) return '1696*960'
    if (aspect < 0.8) return '960*1696'
    return '1280*1280'
  }
  return '1280*1280'
}

export function resolveWanPixelSize(size?: string | null): string {
  if (!size) return '1280*1280'
  if (isAspectRatioSpec(size)) return mapAspectRatioToWanPixels(size)
  if (isPixelSizeSpec(size)) return mapSizeToWanPixels(size)
  return '1280*1280'
}

export function parseReferenceUrlList(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map(v => String(v || '').trim()).filter(Boolean).slice(0, 6)
  } catch {
    return []
  }
}

export function clampWanPromptText(prompt: string, withReferenceImage: boolean, qwenSingleTextMode: boolean) {
  const text = String(prompt || '').trim()
  if (!text) return '生成电影感画面，主体清晰，构图稳定。'

  const maxLen = qwenSingleTextMode ? 780 : (withReferenceImage ? 900 : 1300)
  if (text.length <= maxLen) return text
  return compressWanPromptByPriority(text, maxLen)
}

export function compressWanPromptByPriority(text: string, maxLen: number) {
  const chunks = text
    .split(/[；;。.!?\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const important: string[] = []
  const secondary: string[] = []
  const importantPattern = /(角色|人物|脸|发型|五官|服装|动作|表情|镜头|景别|机位|构图|地点|场景|时间|光线|氛围)/i

  for (const chunk of chunks) {
    if (importantPattern.test(chunk)) important.push(chunk)
    else secondary.push(chunk)
  }

  const ordered = [...important, ...secondary]
  const picked: string[] = []
  let used = 0
  for (const item of ordered) {
    const next = item.length + (picked.length ? 1 : 0)
    if (used + next > maxLen) break
    picked.push(item)
    used += next
  }

  if (!picked.length) return `${text.slice(0, Math.max(60, maxLen - 3))}...`
  const compressed = picked.join('；')
  return compressed.length < text.length ? `${compressed}...` : compressed
}

export function buildWanMultimodalMessages(prompt: string, refs: string[], isQwenImage: boolean) {
  const basePrompt = String(prompt || '').trim()
  if (isQwenImage) {
    return [{ text: clampWanPromptText(basePrompt, false, true) }]
  }
  const normalizedPrompt = clampWanPromptText(basePrompt, refs.length > 0, false)
  if (!refs.length) return [{ text: normalizedPrompt }]
  const multi = refs.length > 1
  const consistencyPrompt = multi
    ? [
        '请严格参考提供的多张人物参考图：每一张对应画面中的一个指定角色，分别保持各自的脸型、发型、五官、服饰与气质一致。',
        '画面需同时呈现文案中描述的所有人物及其位置关系，不要把多名角色合并成一人或只画其中一人。',
        '环境、光线、景别与构图以文字描述为准。',
        normalizedPrompt,
      ].join('\n')
    : [
        '请严格参考提供的人物参考图，保持人物脸型、发型、五官、气质与服装风格一致。',
        '不要改变人物身份，不要生成与参考图明显不同的新角色。',
        normalizedPrompt,
      ].join('\n')
  return [
    ...refs.map(image => ({ image })),
    { text: consistencyPrompt },
  ]
}

export function buildWanGenerationBody(record: ImageGenerationRecord, referenceImages: string[]) {
  const modelName = String(record.model || 'wan2.6-t2i')
  const isQwenImage = /^qwen-image/i.test(modelName)
  const basePrompt = String(record.prompt || '').trim()
  return {
    model: modelName,
    input: {
      messages: [
        {
          role: 'user',
          content: buildWanMultimodalMessages(basePrompt, referenceImages, isQwenImage),
        },
      ],
    },
    parameters: {
      size: resolveWanPixelSize(record.size),
      n: 1,
      negative_prompt: '',
      prompt_extend: true,
      watermark: false,
      seed: (!isQwenImage && referenceImages.length) ? undefined : Math.floor(Math.random() * 2147483647),
    },
  }
}

export function parseAliSubmitOutcome(result: any): {
  isAsync: boolean
  taskId?: string
  imageUrl?: string
} {
  if (result.output?.task_status === 'PENDING' && result.output?.task_id) {
    return { isAsync: true, taskId: result.output.task_id }
  }

  const inlineImage = result.output?.choices?.[0]?.message?.content?.[0]?.image
  if (inlineImage) {
    return { isAsync: false, imageUrl: inlineImage }
  }

  throw new Error(`Unexpected Ali image response: ${JSON.stringify(result).slice(0, 200)}`)
}

export function mapAliPollStatus(status: string | undefined): 'pending' | 'processing' | 'completed' | 'failed' {
  if (status === 'SUCCEEDED') return 'completed'
  if (status === 'FAILED') return 'failed'
  if (status === 'PENDING' || status === 'RUNNING') return 'processing'
  return 'pending'
}

export function pickInlineImageFromAliResult(result: any): string | null {
  return result.output?.choices?.[0]?.message?.content?.[0]?.image || null
}
