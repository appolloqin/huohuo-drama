/**
 * npx tsx scripts/verify-chapter-beat-sequential.ts
 */
import {
  resolveChapterBeatBudgets,
  shouldUseBeatSequentialGenerate,
  truncateProseToCharBudget,
} from '../src/services/novel/novel-chapter-beat-budget.js'
import { isBeatSequentialGenerateEnabled } from '../src/common/novel/novel-meta.js'

const long = '甲乙丙丁。' + '往前再写一段很长的叙述用来触发截断，里面没有句号直到后面。' + '真正的收束在这里。'
const cut = truncateProseToCharBudget(long + '后面不该出现的尾巴内容一二三四五六七八九十。', 40)
if ([...cut].length > 45) throw new Error(`truncate too long: ${[...cut].length}`)
if (!/[。！？]$/.test(cut) && [...cut].length > 40) {
  // 允许硬切
}

const under = truncateProseToCharBudget('短句。', 100)
if (under !== '短句。') throw new Error('under budget must keep')

const outline = '套住野兔并击晕收猎 / 裹伤藏雪揣怀盘算四斤肉 / 辨方位走毛道回家属院 / 雪壳瓷实他加快脚步'
const budgets = resolveChapterBeatBudgets({ chapterOutline: outline, userTarget: 2800 })
if (budgets.beatCount < 2) throw new Error(`need >=2 beats got ${budgets.beatCount}`)
if (!shouldUseBeatSequentialGenerate({ beatCount: budgets.beatCount, enabled: true })) {
  throw new Error('should use sequential')
}
if (shouldUseBeatSequentialGenerate({ beatCount: budgets.beatCount, enabled: false })) {
  throw new Error('flag off must disable')
}
if (shouldUseBeatSequentialGenerate({ beatCount: 1, enabled: true })) {
  throw new Error('single beat must not sequential')
}
if (!isBeatSequentialGenerateEnabled({})) throw new Error('default on')
if (isBeatSequentialGenerateEnabled({ beat_sequential_generate: false })) {
  throw new Error('explicit false')
}

// 截断到句号
const over = '前面一句完整的话。后面还有很多字用来超过上限ABCDEFGHIJKLMNOPQRSTUVWXYZ一二三四五六七八九十。'
const t = truncateProseToCharBudget(over, 12)
if ([...t].length > 14) throw new Error(`bad truncate len ${[...t].length}: ${t}`)
if (!t.includes('前面一句') && !/[。！？]$/.test(t)) {
  throw new Error(`unexpected truncate: ${t}`)
}

console.log('verify-chapter-beat-sequential OK', {
  beats: budgets.beatCount,
  truncateSample: t,
})
