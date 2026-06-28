/**
 * 火火 — Agent 技能目录扫描与导入
 * 技能文件位于仓库根 agent-skills/，支持嵌套 id（如 drama_cast_scene_extract/foo）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  importSkillMarkdown,
  importSkillZip,
  normalizeSkillId,
} from './skill-upload.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SKILLS_ROOT = path.resolve(__dirname, '../../../agent-skills')
const API_V1_SKILLS = '/api/v1/skills/'

export interface SkillSummary {
  id: string
  name: string
  description: string
}

/** 从 HTTP path 剥离 /api/v1/skills/ 前缀，得到 skill id */
export function stripSkillApiPrefix(httpPath: string): string {
  return httpPath.startsWith(API_V1_SKILLS)
    ? httpPath.slice(API_V1_SKILLS.length)
    : httpPath.replace(/^\//, '')
}

function readYamlHeader(mdText: string, fallbackTitle: string): { name: string; description: string } {
  const titleLine = mdText.match(/^name:\s*(.+)$/m)
  const blurbLine = mdText.match(/^description:\s*(.+)$/m)
  return {
    name: titleLine ? titleLine[1].trim() : fallbackTitle,
    description: blurbLine ? blurbLine[1].trim() : '',
  }
}

function crawlAgentSkillDirs(
  rootDir: string,
  idPrefix = '',
  accumulator: SkillSummary[] = [],
): SkillSummary[] {
  if (!fs.existsSync(rootDir)) return accumulator

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const absDir = path.join(rootDir, entry.name)
    const skillMd = path.join(absDir, 'SKILL.md')
    const nestedId = idPrefix ? `${idPrefix}/${entry.name}` : entry.name

    if (fs.existsSync(skillMd)) {
      const mdText = fs.readFileSync(skillMd, 'utf-8')
      const header = readYamlHeader(mdText, entry.name)
      accumulator.push({ id: nestedId, ...header })
    }

    crawlAgentSkillDirs(absDir, nestedId, accumulator)
  }

  return accumulator
}

export function enumerateSkillEntries(): SkillSummary[] {
  return crawlAgentSkillDirs(SKILLS_ROOT)
}

export function fetchSkillMarkdown(skillId: string): { id: string; content: string } | null {
  const mdPath = path.join(SKILLS_ROOT, skillId, 'SKILL.md')
  if (!fs.existsSync(mdPath)) return null
  return { id: skillId, content: fs.readFileSync(mdPath, 'utf-8') }
}

export function persistSkillMarkdown(skillId: string, content: string) {
  const dir = path.join(SKILLS_ROOT, skillId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf-8')
}

export function bootstrapSkillDir(input: { id: string; name?: string; description?: string }) {
  const { id, name, description } = input
  const dir = path.join(SKILLS_ROOT, id)
  if (fs.existsSync(dir)) throw new Error('Skill already exists')

  fs.mkdirSync(dir, { recursive: true })
  const displayName = name || id
  const scaffold = `---
name: ${displayName}
description: ${description || ''}
---

# ${displayName}

Write your skill content here.
`
  fs.writeFileSync(path.join(dir, 'SKILL.md'), scaffold, 'utf-8')
  return { id, name: displayName, description: description || '' }
}

export function purgeSkillDir(skillId: string) {
  const dir = path.join(SKILLS_ROOT, skillId)
  if (!fs.existsSync(dir)) throw new Error('Skill not found')
  fs.rmSync(dir, { recursive: true, force: true })
}

export async function absorbSkillUpload(input: {
  file: File
  agentType?: string
  overwrite?: boolean
  subId?: string
}) {
  const { file, agentType = '', overwrite = false, subId = '' } = input
  const canonicalAgent = agentType.trim()
  const lowerName = (file.name || '').toLowerCase()
  const bytes = Buffer.from(await file.arrayBuffer())

  if (lowerName.endsWith('.zip')) {
    return importSkillZip(bytes, canonicalAgent || undefined, overwrite)
  }

  if (lowerName.endsWith('.md')) {
    if (!canonicalAgent) throw new Error('上传 SKILL.md 需指定 agent_type')
    const base = subId || path.basename(file.name, '.md')
    const skillId = normalizeSkillId(base, canonicalAgent)
    const content = bytes.toString('utf-8')
    return [importSkillMarkdown(skillId, content, overwrite)]
  }

  throw new Error('仅支持 .md 或 .zip 文件')
}
