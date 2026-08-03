/**
 * 章缝锚点：禁止第2章起仍用「故事开端」
 * Run: npx tsx scripts/verify-anchor-seam.ts
 */
import {
  buildAnchorEchoPromptBlock,
  isStaleStoryStartAnchor,
  stripLeadingAnchorEcho,
  DEFAULT_ANCHOR,
} from '../src/services/novel/novel-memory/novel-anchor.js'

if (!isStaleStoryStartAnchor(DEFAULT_ANCHOR)) throw new Error('DEFAULT should be stale story-start')
if (isStaleStoryStartAnchor('场景:林中 | 时间:紧接上章 | 人物:秦卫国 | 禁令:x')) {
  throw new Error('continue anchor should not be stale')
}

const block = buildAnchorEchoPromptBlock({
  vol: 1,
  chapter: 5,
  anchor: DEFAULT_ANCHOR,
  minLen: 2000,
  maxLen: 3000,
})
if (/时间\s*[:：]\s*故事开端/.test(block)) throw new Error('ch5 block must not use story-start time field')
if (/原样抄到/.test(block)) throw new Error('ch5 must not instruct copying anchor into prose')
if (!/紧接上章/.test(block)) throw new Error('ch5 block must require continue-from-prev')

const prose = `${DEFAULT_ANCHOR}\n\n秦卫国蹲在雪窝里等兔子。`
const stripped = stripLeadingAnchorEcho(prose, DEFAULT_ANCHOR)
if (/故事开端|场景:待定/.test(stripped)) throw new Error('strip must remove story-start anchor line')
if (!/秦卫国/.test(stripped)) throw new Error('strip must keep prose')

console.log('PASS')
