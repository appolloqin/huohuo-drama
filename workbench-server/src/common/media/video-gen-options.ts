export type VideoGenOptions = {
  generate_audio: boolean
  generate_subtitles: boolean
}

export const DEFAULT_VIDEO_GEN_OPTIONS: VideoGenOptions = {
  generate_audio: true,
  generate_subtitles: false,
}

/** 引导模型勿在画面内烧录字幕（万相等无独立字幕开关的模型） */
export const VIDEO_NO_SUBTITLE_PROMPT_CUE =
  '画面中不要出现任何字幕、对白文字、屏幕叠字或硬字幕，仅保留纯画面与表演。'

/** 万相 negative_prompt：抑制画面内文字/字幕 */
export const WAN_NO_SUBTITLE_NEGATIVE_PROMPT =
  '字幕, 文字, 对白文字, 屏幕文字, 硬字幕, 叠加文字, subtitles, on-screen text, captions'

export function normalizeVideoGenOptions(raw: unknown): VideoGenOptions {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VIDEO_GEN_OPTIONS }
  const src = raw as Record<string, unknown>
  return {
    generate_audio: src.generate_audio !== false,
    generate_subtitles: src.generate_subtitles === true,
  }
}

export function readVideoGenOptionsFromMetadata(raw: string | null | undefined): VideoGenOptions {
  if (!raw) return { ...DEFAULT_VIDEO_GEN_OPTIONS }
  try {
    const parsed = JSON.parse(raw)
    return normalizeVideoGenOptions(parsed?.video_gen_options)
  } catch {
    return { ...DEFAULT_VIDEO_GEN_OPTIONS }
  }
}

export function mergeVideoGenOptionsIntoMetadata(
  raw: string | null | undefined,
  patch: Partial<VideoGenOptions>,
): string {
  let base: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>
    } catch {}
  }
  const current = normalizeVideoGenOptions(base.video_gen_options)
  const next = { ...current, ...patch }
  return JSON.stringify({ ...base, video_gen_options: next })
}

/** 引导模型用口语说出分镜对白（非烧屏字幕） */
export const VIDEO_SPOKEN_DIALOGUE_PROMPT_CUE_PREFIX =
  '角色按以下台词自然口语演出（请生成对应语音，不要把文字画进画面）：'

export function enhanceVideoPrompt(
  prompt: string,
  dialogue: string | null | undefined,
  options: VideoGenOptions,
): string {
  const base = prompt?.trim() || ''
  const line = dialogue?.trim() || ''
  const parts: string[] = []
  if (base) parts.push(base)

  if (line) {
    if (options.generate_subtitles) {
      parts.push(`画面底部显示清晰可读的中文字幕，字幕内容为：${line}`)
    } else {
      parts.push(`${VIDEO_SPOKEN_DIALOGUE_PROMPT_CUE_PREFIX}${line}`)
      parts.push(VIDEO_NO_SUBTITLE_PROMPT_CUE)
    }
  } else if (!options.generate_subtitles) {
    parts.push(VIDEO_NO_SUBTITLE_PROMPT_CUE)
  }

  return parts.join('\n')
}
