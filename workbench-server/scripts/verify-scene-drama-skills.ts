/**
 * npx tsx scripts/verify-scene-drama-skills.ts
 */
import fs from 'fs'
import path from 'path'
import { resolveAgentSkillIds } from '../src/agents/skills.js'
import {
  NOVEL_AGENT_CROSS_CUTTING,
  NOVEL_GENRE_REGISTRY,
} from '../src/common/novel/novel-genre-registry.js'
import { SKILLS_ROOT } from '../src/common/novel/novel-genre-skill.js'

const MARKER = '## 本类戏法落地（对齐横切 scene_drama）'
const SUB = ['### 压迫', '### 爽', '### 心理', '### 动作新意', '### 禁套'] as const

const agents = ['novel_chapter_writer', 'novel_writing_brief'] as const

function assertCrossCut() {
  for (const agent of agents) {
    const list = NOVEL_AGENT_CROSS_CUTTING[agent]
    if (!list.includes('scene_drama')) {
      throw new Error(`${agent} cross-cut missing scene_drama`)
    }
  }
}

function assertSceneDramaFiles() {
  for (const agent of agents) {
    const p = path.join(SKILLS_ROOT, agent, 'scene_drama', 'SKILL.md')
    if (!fs.existsSync(p)) throw new Error(`missing ${p}`)
  }
}

function assertL1Sections() {
  for (const entry of NOVEL_GENRE_REGISTRY) {
    if (entry.status !== 'active') continue
    for (const agent of agents) {
      const p = path.join(SKILLS_ROOT, agent, entry.skillKey, 'SKILL.md')
      if (!fs.existsSync(p)) throw new Error(`missing ${p}`)
      const text = fs.readFileSync(p, 'utf8')
      if (!text.includes(MARKER)) {
        throw new Error(`${p} missing L1 marker`)
      }
      for (const sub of SUB) {
        if (!text.includes(sub)) throw new Error(`${p} missing ${sub}`)
      }
    }
  }
}

function assertRoutingLoadsSceneDrama() {
  const ids = resolveAgentSkillIds('novel_chapter_writer', { skillKey: 'xuanhuan' })
  if (!ids.includes('novel_chapter_writer/scene_drama')) {
    throw new Error(`routing must load scene_drama, got ${ids.join(', ')}`)
  }
}

assertCrossCut()
assertSceneDramaFiles()
assertL1Sections()
assertRoutingLoadsSceneDrama()
console.log('verify-scene-drama-skills ok')
