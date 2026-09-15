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
  '「模型音频」默认开启：分镜对白会写入提示词，交给视频模型口语演出（Seedance generate_audio、万相 parameters.audio 等）。「模型字幕」默认关闭：禁止画面烧录字幕，合成阶段再后期叠字幕；勾选后才会引导模型把台词画进画面。'
