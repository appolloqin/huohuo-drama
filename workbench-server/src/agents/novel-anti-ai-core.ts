import type { NovelAgentType } from './novel-defaults.js'

/**
 * 生成阶段拟人化要点（摘自 humanize-text-main burstiness/检测引导 + 去AI味 Skill）。
 * 在正文生成时遵守，可减少后期「去AI味改写」负担。
 */
export const NOVEL_ANTI_AI_CORE_PROSE = `【拟人化写作要点（生成时内化，勿输出本段标题）】
1. **网文排版**：段落长短自然变化，段间空一行；忌诗化碎行与每段固定句数。
2. **对话与语气**：引号对话 + 语气词（吧、呢、啊 等）；「……」表迟疑；拟声可独立一行，少量即可。
3. **画面感**：五感与具体景象（雨、光、人影、泥）；动作干脆，少百科说明腔。
4. 禁套话与 AI 高频词：值得注意的是、至关重要、彰显、不禁、心中暗道（连用）等。
5. 句长自然参差，避免连续多句句长相近；少公式排比与段末哲理升华。`

/** 本章写作说明应引导后续正文如何写得像真人 */
export const NOVEL_ANTI_AI_CORE_BRIEF = `【写作说明中的拟人化要求】
- 要求正文段落自然变化、带语气词与对话口气、画面感叙述。
- 避免 AI 套话；章末用情节悬念，不用哲理金句收尾。`

/** 梗概/大纲等策划文案也避免 planner 腔 */
export const NOVEL_ANTI_AI_CORE_PLANNING = `【文案风格】
- 像真人策划/简介语气，不用「深入探讨」「至关重要」「赋能」「彰显」等AI套话。`

export function novelAntiAiCoreFor(agentType: NovelAgentType): string {
  switch (agentType) {
    case 'novel_chapter_writer':
      return NOVEL_ANTI_AI_CORE_PROSE
    case 'novel_writing_brief':
      return NOVEL_ANTI_AI_CORE_BRIEF
    case 'novel_premise':
    case 'novel_outline':
      return NOVEL_ANTI_AI_CORE_PLANNING
    default:
      return ''
  }
}
