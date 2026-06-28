import * as episodesRepo from '../../db/repos/episodes/index.js'
import { now } from '../../common/http/response.js'

export async function fetchEpisodeDraftContent(episodeId: number) {
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode) {
    return { ok: false as const, error: `Episode not found (id=${episodeId})` }
  }

  const content = episode.content || episode.formattedScript
  if (!content) {
    return { ok: false as const, error: `Episode has no content (id=${episodeId})` }
  }

  return {
    ok: true as const,
    episode,
    content,
    wordCount: content.length,
  }
}

export function composeDramaScriptFormatDirective(source: string, extra?: string) {
  const guidance = extra?.trim() ? `\n\n补充要求：\n${extra.trim()}` : ''
  return `请将以下内容改写为格式化剧本。

格式规范：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落，不包含镜头语言
- 对白：角色名：（状态/表情）台词内容
- 每个场景 30-60 秒内容
${guidance}

【原始内容】
${source}`
}

export async function writeEpisodeScreenplayContent(episodeId: number, content: string) {
  await episodesRepo.updateEpisode(episodeId, { formattedScript: content, updatedAt: now() })
  return { wordCount: content.length }
}
