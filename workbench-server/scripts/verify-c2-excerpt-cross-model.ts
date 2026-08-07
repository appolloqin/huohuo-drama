/**
 * C2：excerpt 列表 + 同系检测 + prompt 快照
 * Run: npx tsx scripts/verify-c2-excerpt-cross-model.ts
 */
import { buildHumanizeExcerptList } from '../src/common/novel/novel-detect-excerpts.js'
import {
  sameFamilyDetect,
  crossModelDetectWarning,
} from '../src/common/novel/novel-model-family.js'
import { buildExcerptFirstHumanizeUser } from '../src/services/ai/ai-dehumanizer.js'
import { diversifyAiTransitionTells } from '../src/common/novel/novel-ai-tells.js'

let failed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL', msg)
    failed++
  } else {
    console.log('ok', msg)
  }
}

const ordered = buildHumanizeExcerptList([
  { signal_key: 'phrase_repetition', match_text: '了一' },
  { signal_key: 'perplexity', excerpt: '文首片段ABCDEF' },
  { signal_key: 'sentence_uniformity', excerpt: '句长片段XYZ' },
  { signal_key: 'lexical_pattern', excerpt: '用词片段LMN' },
])
assert(ordered.items[0]?.signal_key === 'perplexity', 'priority perplexity first')
assert(ordered.items[1]?.signal_key === 'sentence_uniformity', 'priority sentence second')
assert(!ordered.usedFallback, 'no fallback when suggestions present')

const deduped = buildHumanizeExcerptList([
  { signal_key: 'perplexity', excerpt: '短' },
  { signal_key: 'perplexity', excerpt: '短而且更长一些的版本' },
])
assert(deduped.items.length === 1, 'dedupe to one')
assert(deduped.items[0]!.text.includes('更长'), 'keep longer')

const many = buildHumanizeExcerptList(
  Array.from({ length: 8 }, (_, i) => ({
    signal_key: 'other',
    excerpt: `片段${i}xxxxxxxxxxxxxxxx`,
  })),
)
assert(many.items.length <= 5, 'max 5')

const fb = buildHumanizeExcerptList([], {
  text: '甲'.repeat(200),
  probability: 90,
  target: 39,
})
assert(fb.usedFallback, 'fallback when empty+high prob')
assert(fb.items.length >= 1, 'fallback has windows')
assert(fb.wideWindow, 'wide window at 90%')

const wide = buildHumanizeExcerptList(
  [{ signal_key: 'perplexity', excerpt: '短摘录' }],
  { text: '乙'.repeat(400), probability: 97, perplexity: 1.2 },
)
assert(wide.wideWindow, 'wide when ppl<3')
assert(wide.items.some(i => i.signal_key.startsWith('fallback')), 'head/mid forced when ultra-low ppl')
assert(wide.items[0]!.text.length > 80, 'wide excerpt longer than 80')

assert(sameFamilyDetect('qwen-plus', 'qwen-turbo') === true, 'qwen same family')
assert(sameFamilyDetect('qwen-plus', 'deepseek-chat') === false, 'qwen vs deepseek')
assert(!!crossModelDetectWarning({ sameFamily: true }), 'warn same family')
assert(crossModelDetectWarning({ sameFamily: true, preferCrossModel: true })!.startsWith('[建议异模型]'), 'prefer prefix')
assert(crossModelDetectWarning({ sameFamily: false }) == null, 'no warn cross')

const prompt = buildExcerptFirstHumanizeUser('正文样例一二三四五六七八九十', {
  probability: 90,
  suggestions: [
    { signal_key: 'perplexity', excerpt: '正文样例一二三' },
    { signal_key: 'sentence_uniformity', excerpt: '四五六七八' },
  ],
  signals: [{ key: 'perplexity', score: 0.97 }],
})
assert(prompt.includes('【须改片段】'), 'prompt has excerpt list')
assert(prompt.includes('困惑度偏低'), 'prompt mentions PPL when heavy')
assert(!/铁钎/.test(prompt), 'no 铁钎 prescription')
assert(!/痛。像/.test(prompt), 'no 痛。像 prescription')

assert(!/^痛。/.test(diversifyAiTransitionTells(
  '痛。像烧红的铁钎子捅进太阳穴，还狠狠搅了两下。秦卫国睁眼。',
)), 'pain open skeleton rewritten')

if (failed) {
  console.error(`\nFAILED: ${failed}`)
  process.exit(1)
}
console.log('\nPASS')
