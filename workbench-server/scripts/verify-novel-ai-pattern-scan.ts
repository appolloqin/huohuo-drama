/**
 * npx tsx scripts/verify-novel-ai-pattern-scan.ts
 */
import {
  scanNovelAiPatterns,
} from '../src/common/novel/novel-ai-pattern-scan.js'
import { resolveAgentSkillIds } from '../src/agents/skills.js'
import fs from 'fs'
import path from 'path'
import { SKILLS_ROOT } from '../src/common/novel/novel-genre-skill.js'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

const sample = [
  '他不是冷漠，而是绝望。',
  '她声音不大，却带着不容置疑的力量。',
  '没有眼泪，没有哭喊，只有沉默。',
  '眼中闪过一丝不易察觉的悲伤。',
  '他深吸一口气，嘴角勾起一抹冷笑。',
  '指尖轻轻发颤，目光缓缓移开，呼吸顿了一下，眉头微微皱起。',
  '他不知道的是，更大的风暴即将来临。这一切才刚刚开始。',
].join('\n')

const scan = scanNovelAiPatterns(sample)
assert(scan.blocking_count >= 3, `expected blocking>=3, got ${scan.blocking_count}`)
assert(
  scan.findings.some((f) => f.class === 'not-is-comparison'),
  'missing not-is-comparison',
)
assert(
  scan.findings.some((f) => f.class === 'voice-contrast'),
  'missing voice-contrast',
)
assert(
  scan.findings.some((f) => f.class === 'trailer-ending' || f.class === 'trailer-summary'),
  'missing trailer',
)
assert(scan.grade !== '轻度', `expected mid/heavy grade, got ${scan.grade}`)

const clean = '他推开门，屋里一股药味。王大伯抬眼：「来了？」他嗯了一声，把粮袋放下。'
const cleanScan = scanNovelAiPatterns(clean)
assert(cleanScan.blocking_count === 0, `clean text should have 0 blocking, got ${cleanScan.blocking_count}`)

const skillPath = path.join(SKILLS_ROOT, 'novel_review', 'SKILL.md')
assert(fs.existsSync(skillPath), `missing ${skillPath}`)
const ids = resolveAgentSkillIds('novel_review')
assert(ids.includes('novel_review'), `routing must load novel_review, got ${ids.join(',')}`)

console.log('verify-novel-ai-pattern-scan ok', {
  blocking: scan.blocking_count,
  advisory: scan.advisory_count,
  grade: scan.grade,
  classes: [...new Set(scan.findings.map((f) => f.class))],
})
