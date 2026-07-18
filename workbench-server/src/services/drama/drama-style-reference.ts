import * as dramasRepo from '../../db/repos/dramas/index.js'
import { dramaStyleReferenceImagePath } from '../../common/drama/drama-style.js'
import { parseDramaMetadata } from '../../common/drama/drama-meta.js'

export const DRAMA_STYLE_REFERENCE_PROMPT =
  'STYLE REFERENCE ONLY: match art style/color/lighting/rendering from the style reference image. Do NOT copy any person, face, object, clothing, or layout from that image.'

export type DramaStyleReferenceApply = {
  referenceImage?: string
  promptPrefix?: string
}

export async function resolveDramaStyleReference(dramaId: number): Promise<DramaStyleReferenceApply> {
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama) return {}

  const meta = parseDramaMetadata(drama.metadata)
  const referenceImage = meta.style_reference_image || dramaStyleReferenceImagePath(drama.style)
  if (!referenceImage) return {}

  return {
    referenceImage,
    promptPrefix: DRAMA_STYLE_REFERENCE_PROMPT,
  }
}

export function applyStyleReferenceToImageGeneration<T extends { prompt: string; referenceImages?: string[] }>(
  params: T,
  styleRef: DramaStyleReferenceApply,
): T {
  if (!styleRef.referenceImage) return params
  return {
    ...params,
    prompt: styleRef.promptPrefix
      ? `${styleRef.promptPrefix}\n\n${params.prompt}`
      : params.prompt,
    referenceImages: [styleRef.referenceImage, ...(params.referenceImages || [])],
  }
}

export function applyStyleReferenceToVideoGeneration<T extends { prompt: string; referenceImageUrls?: string[] }>(
  params: T,
  styleRef: DramaStyleReferenceApply,
): T {
  if (!styleRef.referenceImage) return params
  return {
    ...params,
    prompt: styleRef.promptPrefix
      ? `${styleRef.promptPrefix}\n\n${params.prompt}`
      : params.prompt,
    referenceImageUrls: [styleRef.referenceImage, ...(params.referenceImageUrls || [])],
  }
}
