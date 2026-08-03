/**
 * 轻锚接缝：半句对白中起 / 无交代人名（软告警）+ 提示词轻锚
 * Run: npx tsx scripts/verify-light-anchor-seam.ts
 */
import {
  buildForcedSeamOpeningBlock,
  detectOpeningMidDialogueColdStart,
  detectOpeningUnexplainedNamedSpeech,
} from '../src/services/novel/novel-chapter-seam.js'
import { detectOutlineCompliance } from '../src/services/novel/novel-outline-compliance.js'
import { resolveChapterBeatBudgets } from '../src/services/novel/novel-chapter-beat-budget.js'

const block = buildForcedSeamOpeningBlock({
  chapterOutline: '邻居墙外嘲笑 / 秦卫国握拳决定改变',
  prevTail: '他把糠饼掰开递给苏婉，夜里屋里只剩两口子。',
})
if (!/开篇轻锚接缝/.test(block)) throw new Error('missing light-anchor header')
if (!/轻锚（一句即可）/.test(block)) throw new Error('missing light-anchor rule')
if (!/禁半句对白中起/.test(block)) throw new Error('missing mid-dialogue ban')
if (!/人名不抢戏/.test(block)) throw new Error('missing name rule')
if (/必须复述|再掏|分糠饼/.test(block)) throw new Error('must not force closed-beat re-enact')

const badMid = '屋外那句“活受罪”还没落地，墙外那头又补了一句：“我听说那女的嫁过来那天。”炕上人没出声。'
const mid = detectOpeningMidDialogueColdStart(badMid)
if (!mid) throw new Error('expected mid-dialogue hit')

const goodLight = '墙外又骂起来时，他还坐在炕沿上。外头女人尖着嗓子数落资本家小姐，他听着没接茬。'
if (detectOpeningMidDialogueColdStart(goodLight)) throw new Error('good light-anchor should not mid-hit')

const unexplained = detectOpeningUnexplainedNamedSpeech({
  content: badMid + '孙巧凤的声音尖细，带着幸灾乐祸。',
  chapterOutline: '邻居墙外嘲笑资本家小姐',
  prevChapterTail: '秦卫国把糠饼递给苏婉，夜里屋里安静。',
  prevSnapshot: { time: '深夜', place: '屋里', last_event: '分糠饼', cast: '秦卫国、苏婉', closed_beats: '交付:糠饼' } as any,
})
if (!unexplained) throw new Error('expected unexplained name')
if (!/孙巧凤/.test(unexplained.message)) throw new Error('should name 孙巧凤')

const explained = detectOpeningUnexplainedNamedSpeech({
  content: '墙外又骂起来时，他还坐在炕沿上。邻家孙巧凤的声音尖细。',
  chapterOutline: '邻居墙外嘲笑',
  prevChapterTail: '秦卫国坐在炕上。',
  prevSnapshot: { time: '夜里', place: '屋里', last_event: '对坐', cast: '秦卫国、苏婉' } as any,
})
if (explained) throw new Error('邻家 intro should allow name')

const pad = '后文填充字句。'.repeat(80)
const check = detectOutlineCompliance({
  content: badMid + '孙巧凤的声音尖细。' + pad,
  chapterOutline: '邻居墙外嘲笑资本家小姐 / 秦卫国握拳决定改变命运',
  prevChapterTail: '秦卫国把糠饼递给苏婉，夜里屋里安静。炕上两口子没再说话。',
  chapterNumber: 2,
  prevSnapshot: { time: '深夜', place: '屋里', last_event: '分糠饼', cast: '秦卫国、苏婉', closed_beats: '交付:糠饼' } as any,
})
const codes = new Set(check.reasons.map(r => r.code))
if (!codes.has('opening_mid_dialogue')) throw new Error('compliance missing mid-dialogue')
if (!codes.has('opening_unexplained_name')) throw new Error('compliance missing unexplained name')
if (codes.has('chapter_seam_cold_open') === false) {
  // same-night gossip may or may not cold-open; soft codes alone must not hard-reject
}

const budget = resolveChapterBeatBudgets({
  chapterOutline: '环顾家徒四壁 / 邻居嘲笑 / 决定不再重蹈覆辙',
  userTarget: 2800,
  endpointPending: true,
})
if (!budget.promptBlock.includes('轻锚')) throw new Error('budget missing light-anchor line')
if (!budget.promptBlock.includes('8%')) throw new Error('budget missing 8%')

console.log('verify-light-anchor-seam OK', {
  mid: mid.message.slice(0, 40),
  name: unexplained.name,
  codes: [...codes],
})
