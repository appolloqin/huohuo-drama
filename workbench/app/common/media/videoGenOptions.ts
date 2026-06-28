export type VideoGenOptions = {
  generate_audio: boolean
  generate_subtitles: boolean
}

export const DEFAULT_VIDEO_GEN_OPTIONS: VideoGenOptions = {
  generate_audio: true,
  generate_subtitles: false,
}

export function readEpisodeVideoGenOptions(metadata?: string | null): VideoGenOptions {
  if (!metadata) return { ...DEFAULT_VIDEO_GEN_OPTIONS }
  try {
    const parsed = JSON.parse(metadata)
    const raw = parsed?.video_gen_options
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_VIDEO_GEN_OPTIONS }
    return {
      generate_audio: raw.generate_audio !== false,
      generate_subtitles: raw.generate_subtitles === true,
    }
  } catch {
    return { ...DEFAULT_VIDEO_GEN_OPTIONS }
  }
}

export function mergeEpisodeVideoGenOptions(
  metadata: string | null | undefined,
  patch: Partial<VideoGenOptions>,
): string {
  let base: Record<string, unknown> = {}
  if (metadata) {
    try {
      const parsed = JSON.parse(metadata)
      if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>
    } catch {}
  }
  const current = readEpisodeVideoGenOptions(JSON.stringify({ video_gen_options: base.video_gen_options }))
  const next = { ...current, ...patch }
  return JSON.stringify({ ...base, video_gen_options: next })
}

export const videoGenOptionsHelpText =
  '控制视频模型生成参数：「模型音频」对应火山 Seedance（含 1.5 Pro / 2.0 / 2.0 Fast）的 generate_audio、万相 parameters.audio 等；「模型字幕」通过在提示词中补充字幕描述引导模型呈现台词；未勾选时万相会关闭 prompt_extend 并添加 negative_prompt 抑制画面字幕（多数模型不直接输出 SRT 文件）。'
