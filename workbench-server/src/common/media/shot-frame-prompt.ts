/** Shot/keyframe stills: dialogue is TTS/subtitles later; models garble on-screen CJK. */
export const SHOT_FRAME_NO_ONSCREEN_TEXT =
  '纯电影静帧，画面中禁止出现任何文字、字幕、对白气泡、对话框、招牌乱码或水印；对白不要画进图里。no text, no speech bubbles, no captions, no watermark'

export function promptAlreadyBansOnscreenText(prompt?: string | null): boolean {
  return /no speech bubbles|禁止出现任何文字|no text,\s*no (?:speech|watermark)|no text, no watermark/i.test(
    String(prompt || ''),
  )
}

export function ensureShotFrameNoOnscreenText(prompt?: string | null): string {
  const base = String(prompt || '').trim()
  if (!base) return SHOT_FRAME_NO_ONSCREEN_TEXT
  if (promptAlreadyBansOnscreenText(base)) return base
  return `${base}；${SHOT_FRAME_NO_ONSCREEN_TEXT}`
}

export function isShotFrameImageJob(input: {
  storyboardId?: number | null
  frameType?: string | null
}): boolean {
  if (input.storyboardId) return true
  const frameType = String(input.frameType || '')
  return /^(first_frame|last_frame|reference)/.test(frameType)
}
