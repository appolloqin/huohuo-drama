/**
 * èå¥å¼å¯¼ä»æ³¨å¥çæï¼è¯­ä¹åæ / éªåè¯è·ä¸åè¿ L1 ç¡¬æ¦ï¼å¤§çº²ååå¯¹é½ç¬¬ä¸çä¸åã
 * Run: npx tsx scripts/verify-commercial-appeal-rhythm-novelty.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  detectAppealHateLate,
  detectAppealJiPanGap,
  detectAppealShuangGap,
  detectAppealRepeatInventory,
  listOpeningAppealHardFails,
} from '../src/services/novel/novel-commercial-appeal-audit.js'
import { WEBNOVEL_CHAPTER_PROSE_GUIDE } from '../src/agents/webnovel-prose-style.js'
import { NOVEL_OUTLINE_STRUCTURE_HINT } from '../src/agents/novel-defaults.js'
import { OUTLINE_DRAMA_PRIORITY_LINE } from '../src/services/novel/novel-outline-drama-fields.js'
import { buildBeatOpeningRule } from '../src/services/novel/novel-chapter-beat-generate.js'

const SEMANTIC_BEAT_HARD = new Set([
  'hate_late',
  'pre_hate_inventory',
  'shuang_gap',
  'mid_monologue',
  'ji_pan_gap',
  'capability_sell_late',
  'emotion_beats_missing',
  'emotion_beats_order',
  'repeat_inventory',
])

function padLike(s: string, n: number): string {
  let out = s.replace(/\s+/g, '')
  while (out.length < n) out += 'ä»åå¨çä¸ç¼äºå£æ°ï¼å±éå·å¾å¾ã'
  return out
}

const fixture = readFileSync(join(process.cwd(), 'scripts/fixtures/appeal-manual-ch1.txt'), 'utf8')
const hard = listOpeningAppealHardFails(fixture, 1)
const leaked = hard.filter((f) => SEMANTIC_BEAT_HARD.has(f.code))
if (leaked.length) {
  throw new Error(`semantic/repeat codes must not hard-fail, got ${leaked.map((f) => f.code).join(',')}`)
}

const detectorsOk =
  !!detectAppealHateLate(fixture, 1)
  || !!detectAppealShuangGap(fixture, 1)
  || !!detectAppealJiPanGap(fixture, 1)
if (!detectorsOk) throw new Error('detectors themselves must still fire on fixture (diagnostic only)')

const tipOk = WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('本事露尖')
  || WEBNOVEL_CHAPTER_PROSE_GUIDE.includes('动作震慑')
if (!tipOk) throw new Error('WEBNOVEL_CHAPTER_PROSE_GUIDE must include 动作震慑/本事露尖')
if (!NOVEL_OUTLINE_STRUCTURE_HINT.includes('动作震慑') || !NOVEL_OUTLINE_STRUCTURE_HINT.includes('拢共天数')) {
  throw new Error('NOVEL_OUTLINE_STRUCTURE_HINT must sync 动作震慑 / 拢共天数')
}
if (!OUTLINE_DRAMA_PRIORITY_LINE.includes('短缺一环') || !OUTLINE_DRAMA_PRIORITY_LINE.includes('三刀')) {
  throw new Error('OUTLINE_DRAMA_PRIORITY_LINE must include 三刀 and 短缺一环')
}
const openCh1 = buildBeatOpeningRule({ chapterNumber: 1 })
if (!openCh1.includes('恨') || !openCh1.includes('压力方')) {
  throw new Error('buildBeatOpeningRule ch1 must include 恨场/压力方')
}

const insultHeavy = [
  '“二流子把老婆都打跑了，还有脸占着房？”马桂花堵门骂。',
  '秦守财冷笑：“懒汉二流子，打老婆还有脸占房。”',
  padLike('炕上风灌进来。', 450),
  '外头又有人嘀咕二流子打老婆的事。',
].join('')
if (!detectAppealRepeatInventory(insultHeavy, 1)) {
  throw new Error('fixture should still trigger repeat detector (soft only)')
}
const insultFails = listOpeningAppealHardFails(insultHeavy, 1)
if (insultFails.some((f) => f.code === 'repeat_inventory')) {
  throw new Error('repeat_inventory must not hard-fail insult confrontation')
}

console.log('verify-commercial-appeal-rhythm-novelty OK', {
  hardCodes: hard.map((f) => f.code),
  outlineSynced: true,
  repeatSoftOnly: true,
})
