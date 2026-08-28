/**
 * npx tsx scripts/verify-genre-skills.ts
 */
import { NOVEL_GENRE_REGISTRY } from '../src/common/novel/novel-genre-registry.js'
import { genreSkillAbsolutePath } from '../src/common/novel/novel-genre-skill.js'
import fs from 'fs'

const AGENTS = [
  'novel_premise',
  'novel_outline',
  'novel_writing_brief',
  'novel_chapter_writer',
] as const

let failed = 0

for (const entry of NOVEL_GENRE_REGISTRY) {
  if (entry.status !== 'active') continue
  for (const agent of AGENTS) {
    const p = genreSkillAbsolutePath(agent, entry.skillKey)
    if (!fs.existsSync(p)) {
      console.error(`MISSING active preset ${entry.value} (${entry.skillKey}): ${p}`)
      failed++
    }
  }
}

if (failed) process.exit(1)
console.log('verify-genre-skills ok')
