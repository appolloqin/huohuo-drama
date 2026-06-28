export type ProductionPipeline = 'ai_video' | 'frame_slideshow'

export const PRODUCTION_PIPELINE_OPTIONS: Array<{
  value: ProductionPipeline
  label: string
  desc: string
}> = [
  {
    value: 'ai_video',
    label: 'AI 视频出片',
    desc: '完整链路：剧本→分镜→素材→镜头图→配音→AI 视频→单镜合成→整集拼接导出',
  },
  {
    value: 'frame_slideshow',
    label: '静帧动画出片',
    desc: '完整链路：剧本→分镜→素材→关键帧→配音→静帧动效→单镜合成→整集拼接导出',
  },
]

/** 数字导演单集后台流水线（与 workbench-server drama-episode-pipeline 对齐） */
export const DIGITAL_DIRECTOR_PIPELINE_STEPS: Array<{ key: string; label: string }> = [
  { key: 'raw', label: '原始正文' },
  { key: 'rewrite', label: 'AI 改写' },
  { key: 'extract', label: '提取角色场景' },
  { key: 'voice', label: '分配音色' },
  { key: 'storyboards', label: '拆解分镜' },
  { key: 'char_images', label: '角色立绘' },
  { key: 'scene_images', label: '场景图片' },
  { key: 'shot_images', label: '镜头参考图 / 关键帧' },
  { key: 'dubbing', label: '配音生成' },
  { key: 'motion', label: 'AI 视频 / 静帧动画' },
  { key: 'compose', label: '单镜合成' },
  { key: 'merge', label: '拼接导出' },
]

export function normalizeProductionPipeline(raw: unknown): ProductionPipeline {
  return raw === 'frame_slideshow' ? 'frame_slideshow' : 'ai_video'
}

export function readEpisodeProductionPipeline(
  ep: { metadata?: string | null; production_pipeline?: unknown } | null | undefined,
): ProductionPipeline {
  if (ep?.production_pipeline != null) {
    return normalizeProductionPipeline(ep.production_pipeline)
  }
  if (!ep?.metadata) return 'ai_video'
  try {
    const parsed = JSON.parse(ep.metadata)
    return normalizeProductionPipeline(parsed?.production_pipeline)
  } catch {
    return 'ai_video'
  }
}

export function episodeWorkbenchPath(dramaId: number, epNumber: number, pipeline: ProductionPipeline): string {
  const base = `/drama/${dramaId}/episode/${epNumber}`
  return pipeline === 'frame_slideshow' ? `${base}/frames` : base
}

export function pipelineLabel(pipeline: ProductionPipeline): string {
  return pipeline === 'frame_slideshow' ? '静帧' : 'AI'
}

export function alternateProductionPipeline(pipeline: ProductionPipeline): ProductionPipeline {
  return pipeline === 'frame_slideshow' ? 'ai_video' : 'frame_slideshow'
}

export function readEpisodeFrameMergedUrl(ep: { metadata?: string | null } | null | undefined): string | null {
  if (!ep?.metadata) return null
  try {
    const parsed = JSON.parse(ep.metadata)
    const url = parsed?.frame_merged_url
    return typeof url === 'string' && url.trim() ? url : null
  } catch {
    return null
  }
}
