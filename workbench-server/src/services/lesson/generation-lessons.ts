import { NOVEL_AGENT_TYPES } from '../../agents/novel-defaults.js'
import * as lessonsRepo from '../../db/repos/generation-lessons/index.js'

export type LessonProjectKind = 'drama' | 'novel' | 'all'
export type LessonVerdict = 'recommend' | 'avoid'

export function projectKindForAgentType(agentType: string): LessonProjectKind {
  return (NOVEL_AGENT_TYPES as readonly string[]).includes(agentType) ? 'novel' : 'drama'
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return raw.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  }
}

export async function listActiveLessons(agentType: string) {
  const kind = projectKindForAgentType(agentType)
  return lessonsRepo.listActiveLessonsForAgent(kind, agentType)
}

/** 格式化为系统提示词追加块 */
export async function formatLessonsForPrompt(agentType: string): Promise<string> {
  const rows = await listActiveLessons(agentType)
  if (!rows.length) return ''

  const recommend = rows.filter(r => r.verdict !== 'avoid')
  const avoid = rows.filter(r => r.verdict === 'avoid')
  const parts: string[] = []

  if (recommend.length) {
    parts.push('## 生成经验（推荐做法）')
    for (const row of recommend) {
      const tags = parseTags(row.tags)
      const tagSuffix = tags.length ? ` [${tags.join(' · ')}]` : ''
      parts.push(`- **${row.title}**${tagSuffix}：${row.content.trim()}`)
    }
  }
  if (avoid.length) {
    parts.push('## 生成经验（避免踩坑）')
    for (const row of avoid) {
      const tags = parseTags(row.tags)
      const tagSuffix = tags.length ? ` [${tags.join(' · ')}]` : ''
      parts.push(`- **${row.title}**${tagSuffix}：${row.content.trim()}`)
    }
  }

  return parts.join('\n')
}

export async function appendLessonsToPrompt(base: string, agentType: string): Promise<string> {
  const lessons = await formatLessonsForPrompt(agentType)
  if (!lessons) return base
  return [base, '', lessons].join('\n')
}
