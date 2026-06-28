/**
 * Agent SKILL.md 加载器
 *
 * - 内置 agent → skill 映射 + 磁盘扫描子目录 reference
 * - 输出拼接为 system prompt 片段，tool id 不变
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SKILLS_ROOT = path.resolve(__dirname, '../../../agent-skills')

// ── 内置 agent 与 skill 目录映射 ─────────────────────────────

const CANONICAL_AGENT_SKILL_MAP: Record<string, string[]> = {
  drama_script_formatter: ['drama_script_formatter'],
  drama_cast_scene_extract: ['drama_cast_scene_extract'],
  drama_storyboard_breakdown: ['drama_storyboard_breakdown'],
  drama_voice_assign: ['drama_voice_assign'],
  drama_image_prompt: ['drama_image_prompt'],
  novel_premise: ['novel_premise'],
  novel_outline: ['novel_outline'],
  novel_writing_brief: ['novel_writing_brief'],
  novel_chapter_writer: ['novel_chapter_writer'],
  ai_dehumanizer: ['ai_dehumanizer'],
}

// ── 磁盘扫描 ─────────────────────────────────────────────────

function enumerateSkillSubfolders(dir: string, prefix = ''): string[] {
  const discovered: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const fullPath = path.join(dir, entry.name)
    const skillId = prefix ? `${prefix}/${entry.name}` : entry.name
    const skillPath = path.join(fullPath, 'SKILL.md')
    if (fs.existsSync(skillPath)) discovered.push(skillId)
    discovered.push(...enumerateSkillSubfolders(fullPath, skillId))
  }
  return discovered
}

function listSkillIdsOnDisk(): string[] {
  if (!fs.existsSync(SKILLS_ROOT)) return []
  return enumerateSkillSubfolders(SKILLS_ROOT)
}

/** 合并内置与磁盘 skill，主 skill 优先排序 */
export function resolveAgentSkillIds(agentType: string): string[] {
  const builtIn = CANONICAL_AGENT_SKILL_MAP[agentType] || []
  const fromDisk = listSkillIdsOnDisk().filter(
    id => id === agentType || id.startsWith(`${agentType}/`),
  )
  const merged = [...builtIn, ...fromDisk]
  const unique = [...new Set(merged)]
  unique.sort((a, b) => {
    if (a === agentType) return -1
    if (b === agentType) return 1
    return a.localeCompare(b, 'zh-CN')
  })
  return unique
}

// ── Markdown 解析与拼接 ───────────────────────────────────────

function stripSkillYamlHeader(content: string): string {
  if (!content.startsWith('---')) return content.trim()
  const end = content.indexOf('\n---', 3)
  if (end === -1) return content.trim()
  return content.slice(end + 4).trim()
}

function readSkillMarkdownSection(skillId: string): string {
  const skillPath = path.join(SKILLS_ROOT, skillId, 'SKILL.md')
  if (!fs.existsSync(skillPath)) return ''

  const raw = fs.readFileSync(skillPath, 'utf-8')
  const body = stripSkillYamlHeader(raw)
  if (!body) return ''

  return [`## Skill: ${skillId}`, body].join('\n')
}

const AGENT_SKILL_PROMPT_HEADER = [
  '以下是该 Agent 专属的项目技能规范（SKILL.md）。',
  '不同 Agent 会加载不同 skill；你只需要遵守当前注入的这些技能。',
  '你必须在不违背当前工具边界的前提下优先遵守这些规范；若与用户明确要求冲突，以用户要求为准。',
  '',
].join('\n')

export function loadAgentSkills(agentType: string): string {
  const skillIds = resolveAgentSkillIds(agentType)
  const sections = skillIds.map(readSkillMarkdownSection).filter(Boolean)
  if (!sections.length) return ''
  return [AGENT_SKILL_PROMPT_HEADER, sections.join('\n\n')].join('\n')
}
