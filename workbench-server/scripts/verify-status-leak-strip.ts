/**
 * npx tsx scripts/verify-status-leak-strip.ts
 */
import { stripNovelPipelineStatusLeak } from '../src/common/novel/novel-temporal-numerals.js'

const samples = [
  '正文结束。\n?????????? 3/3 ???',
  '正文结束。\n正在修正大纲落实 3/3 轮…',
  '正文结束。\n？？？？？？？？ 2/3 ？？？',
  '正常正文无进度',
]

for (const s of samples) {
  const out = stripNovelPipelineStatusLeak(s)
  if (/[?？]{3,}.*\d+\s*\/\s*\d+/.test(out) || /正在修正大纲落实/.test(out)) {
    throw new Error(`leak remains: ${JSON.stringify(out.slice(-40))}`)
  }
  if (s.includes('正常') && out !== s) throw new Error('over-stripped')
}
console.log('verify-status-leak-strip OK')
