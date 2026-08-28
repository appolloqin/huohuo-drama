import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  NOVEL_AGENT_CROSS_CUTTING,
  NOVEL_AGENT_TYPES,
  type NovelAgentType,
} from './novel-genre-registry.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const SKILLS_ROOT = path.resolve(__dirname, '../../../../agent-skills')

export class MissingGenreSkillError extends Error {
  readonly skillKey: string
  readonly agentType: string

  constructor(skillKey: string, agentType: string) {
    super(`Missing genre skill: ${agentType}/${skillKey}/SKILL.md`)
    this.name = 'MissingGenreSkillError'
    this.skillKey = skillKey
    this.agentType = agentType
  }
}

export function genreSkillRelativeId(agentType: string, skillKey: string): string {
  return `${agentType}/${skillKey}`
}

export function genreSkillAbsolutePath(agentType: string, skillKey: string): string {
  return path.join(SKILLS_ROOT, agentType, skillKey, 'SKILL.md')
}

export function genreSkillExists(agentType: string, skillKey: string): boolean {
  return fs.existsSync(genreSkillAbsolutePath(agentType, skillKey))
}

export function assertGenreSkillsBundled(skillKey: string): void {
  const key = (skillKey || '').trim()
  if (!key) return
  for (const agentType of NOVEL_AGENT_TYPES) {
    if (!genreSkillExists(agentType, key)) {
      throw new MissingGenreSkillError(key, agentType)
    }
  }
}

export function assertGenreSkillForAgent(agentType: string, skillKey: string): void {
  const key = (skillKey || '').trim()
  if (!key) return
  if (!genreSkillExists(agentType, key)) {
    throw new MissingGenreSkillError(key, agentType)
  }
}

export function listCrossCuttingSkillIds(agentType: NovelAgentType): string[] {
  return [...NOVEL_AGENT_CROSS_CUTTING[agentType]]
}

export function isNovelAgentType(agentType: string): agentType is NovelAgentType {
  return agentType in NOVEL_AGENT_CROSS_CUTTING
}
