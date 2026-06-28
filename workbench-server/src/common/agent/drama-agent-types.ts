/** 短剧 Agent 类型（与 agent-skills/ 目录名、agent_configs.agent_type 一致） */
export const DRAMA_AGENT_TYPES = [
  'drama_script_formatter',
  'drama_cast_scene_extract',
  'drama_voice_assign',
  'drama_storyboard_breakdown',
  'drama_image_prompt',
] as const

export type DramaAgentType = (typeof DRAMA_AGENT_TYPES)[number]

export function isDramaAgentType(agentType: string): boolean {
  return (DRAMA_AGENT_TYPES as readonly string[]).includes(agentType.trim())
}
