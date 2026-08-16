/**
 * 朱雀式分段 / 多窗采样冒烟（不调 LLM）
 * Run: npx tsx scripts/verify-ai-detect-zhuque-style.ts
 */
import {
  AI_DETECT_SEGMENT_MIN_CHARS,
  bandFromAigc,
  buildStatisticalSegments,
  charWindows,
  countHighBandSegments,
  fuseSegmentAigc,
  meanSegmentAigc,
  segmentTextForAiDetect,
} from '../src/services/ai/ai-detect-segments.js'
import { countNovelChars } from '../src/common/novel/novel-char-limit.js'
import { shouldAcceptHumanizePass } from '../src/services/novel/novel-chapter-ai-humanize-hook.js'
import { buildExcerptFirstHumanizeUser } from '../src/services/ai/ai-dehumanizer.js'

if (AI_DETECT_SEGMENT_MIN_CHARS < 80) {
  throw new Error('segment min must be >= 80 to avoid detectAiText stub')
}

if (bandFromAigc(0.49) !== 'human') throw new Error('band human')
if (bandFromAigc(0.5) !== 'suspected') throw new Error('band suspected')
if (bandFromAigc(0.85) !== 'ai') throw new Error('band ai')

const longPara = '这一段故意写得足够长，用来测试自然段合并与分段评分是否正常工作，避免落入统计检测在不足八十字时返回固定五十百分比的 stub 陷阱。还要再补一些字数确保去掉空白后也稳稳超过八十字门槛，于是继续写下去：土炕、柴火、冷风、工分债和对白都算数。'
const shortParas = [
  '短。',
  '还短。',
  longPara,
].join('\n\n')
const segs = segmentTextForAiDetect(shortParas)
const scored = buildStatisticalSegments(shortParas)
if (!scored.length) throw new Error('expected segments')
if (scored.some((s) => s.probability === 50 && countNovelChars((s.text || '').replace(/\s+/g, '')) < 80)) {
  throw new Error('short stub segment should not remain after merge')
}
if (countNovelChars(longPara.replace(/\s+/g, '')) < 80) {
  throw new Error('fixture longPara too short')
}

const long = '甲'.repeat(5000) + '\n\n' + '乙'.repeat(5000) + '\n\n' + '丙'.repeat(5000)
const wins = charWindows(long, 2000)
if (wins.length < 2) throw new Error(`expected multi windows, got ${wins.length}`)
const labels = new Set(wins.map((w) => w.label))
if (!labels.has('head') || !labels.has('tail')) throw new Error('need head+tail')

const fused = fuseSegmentAigc(0.4, 80)
if (fused < 0.5 || fused > 0.7) throw new Error(`fuse unexpected ${fused}`)

const hot = [
  { index: 0, char_start: 0, char_end: 10, aigc: 0.9, band: 'ai' as const, probability: 90 },
  { index: 1, char_start: 10, char_end: 20, aigc: 0.2, band: 'human' as const, probability: 20 },
]
if (countHighBandSegments(hot) !== 1) throw new Error('high band count')
if (Math.abs(meanSegmentAigc(hot) - 0.55) > 0.001) throw new Error('mean aigc')

if (!shouldAcceptHumanizePass(90, 90, { beforeHighBand: 3, afterHighBand: 1 })) {
  throw new Error('should accept on high-band drop')
}
if (!shouldAcceptHumanizePass(90, 90, { beforeMeanAigc: 0.8, afterMeanAigc: 0.7 })) {
  throw new Error('should accept on mean aigc drop')
}

const prompt = buildExcerptFirstHumanizeUser('正文示例段落。'.repeat(20), {
  probability: 80,
  segments: [
    { index: 0, band: 'ai', aigc: 0.9, text: '高危段内容需要改节奏不要同义词堆砌' },
  ],
  high_band_count: 1,
})
if (!prompt.includes('高危') && !prompt.includes('segment_ai')) {
  throw new Error('humanize prompt should prioritize high-band segments')
}
if (!prompt.includes('同义词') && !prompt.includes('节奏')) {
  throw new Error('humanize prompt should mention rhythm not synonym spam')
}

console.log('verify-ai-detect-zhuque-style OK', {
  segs: scored.length,
  windows: wins.map((w) => w.label),
  fused,
})
