import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { unzipSync } from 'fflate'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_ROOT = path.resolve(__dirname, '../../../agent-skills')

const MAX_MD_BYTES = 512 * 1024
const MAX_ZIP_BYTES = 8 * 1024 * 1024
const ALLOWED_REF_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml'])

export type ImportedSkill = { id: string; name: string; description: string }

export function validateSkillIdPart(part: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(part)
}

export function normalizeSkillId(raw: string, agentType?: string): string {
  const id = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (!id || id.includes('..')) throw new Error('Skill 路径非法')
  const segments = id.split('/').filter(Boolean)
  if (!segments.length) throw new Error('Skill id 不能为空')
  for (const seg of segments) {
    if (!validateSkillIdPart(seg)) {
      throw new Error(`Skill 路径段「${seg}」仅允许字母、数字、_-`)
    }
  }
  if (segments.length === 1 && agentType?.trim()) {
    const agent = agentType.trim()
    if (!validateSkillIdPart(agent)) throw new Error('agent_type 非法')
    return `${agent}/${segments[0]}`
  }
  return segments.join('/')
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end === -1) return {}
  const fm = content.slice(3, end)
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  const descMatch = fm.match(/^description:\s*(.+)$/m)
  return {
    name: nameMatch?.[1]?.trim(),
    description: descMatch?.[1]?.trim(),
  }
}

function skillMetaFromContent(content: string, fallbackId: string): { name: string; description: string } {
  const fm = parseFrontmatter(content)
  const leaf = fallbackId.split('/').pop() || fallbackId
  return {
    name: fm.name || leaf,
    description: fm.description || '',
  }
}

function ensureSkillMd(content: string, name: string, description: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith('---')) return trimmed
  return `---
name: ${name}
description: ${description}
---

${trimmed}
`
}

function writeSkillFiles(
  skillId: string,
  relativeFiles: Map<string, Uint8Array>,
  overwrite: boolean,
): ImportedSkill {
  const skillDir = path.join(SKILLS_ROOT, skillId)
  if (fs.existsSync(skillDir) && !overwrite) {
    throw new Error(`Skill「${skillId}」已存在，请勾选覆盖或先删除`)
  }
  fs.mkdirSync(skillDir, { recursive: true })

  for (const [rel, data] of relativeFiles) {
    if (rel.includes('..') || rel.startsWith('/')) throw new Error('Skill 文件路径非法')
    const ext = path.extname(rel).toLowerCase()
    if (rel !== 'SKILL.md' && !rel.startsWith('references/')) continue
    if (rel !== 'SKILL.md' && !ALLOWED_REF_EXT.has(ext)) continue
    const outPath = path.join(skillDir, rel)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, Buffer.from(data))
  }

  const skillPath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillPath)) throw new Error(`Skill「${skillId}」缺少 SKILL.md`)
  const content = fs.readFileSync(skillPath, 'utf-8')
  const meta = skillMetaFromContent(content, skillId)
  return { id: skillId, ...meta }
}

export function importSkillMarkdown(
  skillId: string,
  content: string,
  overwrite = false,
): ImportedSkill {
  if (Buffer.byteLength(content, 'utf-8') > MAX_MD_BYTES) {
    throw new Error('SKILL.md 过大，请控制在 512KB 以内')
  }
  const meta = skillMetaFromContent(content, skillId)
  const finalContent = ensureSkillMd(content, meta.name, meta.description)
  const files = new Map<string, Uint8Array>([
    ['SKILL.md', Buffer.from(finalContent, 'utf-8')],
  ])
  return writeSkillFiles(skillId, files, overwrite)
}

export function importSkillZip(buffer: Buffer, agentType?: string, overwrite = false): ImportedSkill[] {
  if (buffer.length > MAX_ZIP_BYTES) throw new Error('压缩包过大，请控制在 8MB 以内')

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(buffer))
  } catch {
    throw new Error('无法解析 ZIP 文件')
  }

  const fileMap = new Map<string, Uint8Array>()
  const skillRoots = new Set<string>()
  for (const [entryPath, data] of Object.entries(entries)) {
    const norm = entryPath.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!norm || norm.includes('__MACOSX') || norm.includes('.DS_Store')) continue
    fileMap.set(norm, data)
    if (norm.endsWith('/SKILL.md') || norm === 'SKILL.md') {
      const dir = norm === 'SKILL.md' ? '' : norm.slice(0, -'/SKILL.md'.length)
      skillRoots.add(dir)
    }
  }

  if (!skillRoots.size) throw new Error('ZIP 中未找到 SKILL.md')

  const imported: ImportedSkill[] = []
  for (const root of [...skillRoots].sort()) {
    const skillId = normalizeSkillId(root || 'uploaded', agentType)
    const prefix = root ? `${root}/` : ''
    const relativeFiles = new Map<string, Uint8Array>()
    for (const [rel, data] of fileMap) {
      if (prefix) {
        if (!rel.startsWith(prefix)) continue
        const sub = rel.slice(prefix.length)
        if (sub) relativeFiles.set(sub, data)
      } else if (rel === 'SKILL.md' || rel.startsWith('references/')) {
        relativeFiles.set(rel, data)
      }
    }
    imported.push(writeSkillFiles(skillId, relativeFiles, overwrite))
  }
  return imported
}
