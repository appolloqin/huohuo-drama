// scripts/verify-ai-detect-zlines.ts
import { zFeature, directionOf } from '../src/services/ai/ai-detect-calibration.js'
import { DEFAULT_PERCENTILE_TABLES } from '../src/services/ai/ai-detect-calibration.js'
import { statLine } from '../src/services/ai/ai-evidence-rules.js'

if (directionOf('char_ttr') !== 'low_ai') throw new Error('TTR 越低越像 AI（用词收敛）——旧 bug 方向修复断言')
if (directionOf('sentence_len_cv') !== 'low_ai') throw new Error('cv 低=均匀=AI 向')
if (directionOf('tells_density') !== 'high_ai') throw new Error('套话密度高=AI 向')

const table = DEFAULT_PERCENTILE_TABLES.web_fiction
if (!table || !table.char_ttr || table.char_ttr.length < 3) throw new Error('seed table missing char_ttr')
// 人写样例 TTR≈0.5（大样本中文长篇典型区间）不应落在高分位（旧 bug：0.28–0.42 给最高分 0.72）
const zTtr = zFeature('char_ttr', 0.36, table)
if (zTtr > 0.5) throw new Error(`char_ttr=0.36 z=${zTtr}，修复未生效`)

const humanLine = statLine(extractFixture('human'))
const robotLine = statLine(extractFixture('robot'))
if (robotLine <= humanLine) throw new Error(`lines human=${humanLine} robot=${robotLine}`)
if (humanLine > 0.6) throw new Error('human stat line should stay <=0.6')

function extractFixture(kind: 'human' | 'robot'): Record<string, number> {
  // 内联最小样例外形（完整方向性断言在 Chunk 8 Task 8.2 的 verify:ai-detect-calib 用 fixtures 真语料）
  return kind === 'human'
    ? { sentence_len_cv: 0.72, para_len_cv: 0.8, char_ttr: 0.5, char_entropy: 9.4, bigram_repeat: 0.1, trigram_repeat: 0.05, punct_density: 0.08, dash_density: 0.001, quote_density: 0.01, opening_pattern_entropy: 5.2, syntactic_template_index: 0.12, dialogue_len_cv: 0.7, tag_variety: 0.8, tells_density: 0.002, colloquial_density: 0.012 }
    : { sentence_len_cv: 0.18, para_len_cv: 0.22, char_ttr: 0.34, char_entropy: 8.1, bigram_repeat: 0.35, trigram_repeat: 0.2, punct_density: 0.03, dash_density: 0.006, quote_density: 0.002, opening_pattern_entropy: 2.8, syntactic_template_index: 0.45, dialogue_len_cv: 0.2, tag_variety: 0.2, tells_density: 0.02, colloquial_density: 0.001 }
}
console.log('verify-ai-detect-zlines OK', { humanLine: humanLine.toFixed(2), robotLine: robotLine.toFixed(2) })
