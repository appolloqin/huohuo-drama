/**
 * npx tsx scripts/verify-novel-genre-skill-routing.ts
 */
import { resolveAgentSkillIds, loadAgentSkills } from '../src/agents/skills.js'

const ids = resolveAgentSkillIds('novel_chapter_writer', { skillKey: 'exorcism' })
const forbidden = ['weird', 'xianxia', 'apocalypse', 'brainhole']
for (const f of forbidden) {
  if (ids.some(id => id.endsWith(`/${f}`))) {
    throw new Error(`must not load ${f}, got ${ids.join(', ')}`)
  }
}
if (!ids.some(id => id.endsWith('/exorcism'))) {
  throw new Error(`must load exorcism, got ${ids.join(', ')}`)
}
if (!ids.includes('novel_chapter_writer/chapter_craft_core')) {
  throw new Error('cross-cut chapter_craft_core missing')
}
if (!ids.includes('novel_chapter_writer/scene_drama')) {
  throw new Error('cross-cut scene_drama missing')
}

const empty = resolveAgentSkillIds('novel_chapter_writer', { skillKey: null })
if (empty.some(id => id.includes('/xianxia') || id.includes('/weird'))) {
  throw new Error('empty skillKey must not load genre skills')
}

const md = loadAgentSkills('novel_chapter_writer', { skillKey: 'xianxia' })
if (md.includes('Skill: novel_chapter_writer/weird')) {
  throw new Error('weird leaked into xianxia markdown')
}

const dramaIds = resolveAgentSkillIds('drama_script_formatter')
if (!dramaIds.some(id => id.startsWith('drama_script_formatter'))) {
  throw new Error('drama agent should still resolve skills')
}

console.log('verify-novel-genre-skill-routing ok')
