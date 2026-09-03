/**
 * 引号程序归一：不依赖模型
 * npx tsx scripts/verify-dialogue-quotes.ts
 */
import { normalizeNovelDialogueQuotes } from '../src/common/novel/novel-dialogue-quotes.js'
import { normalizeNovelTemporalNumerals } from '../src/common/novel/novel-temporal-numerals.js'
import { sanitizeModelCreativeOutput } from '../src/services/ai/ai.js'

const ascii = '"啪——"一纸借据甩在秦家祠堂石阶上，墨迹未干，纸角在风里直颤。'
const corner = '「啪——」一纸借据甩在秦家祠堂石阶上。'
const fullwidth = '＂啪——＂一纸借据甩在秦家祠堂石阶上。'

for (const [label, input] of [
  ['ascii', ascii],
  ['corner', corner],
  ['fullwidth', fullwidth],
] as const) {
  const out = normalizeNovelDialogueQuotes(input)
  if (out.includes('"') || out.includes('「') || out.includes('＂')) {
    throw new Error(`${label} still has non-Chinese quotes:\n${out}`)
  }
  if (!out.startsWith('“啪——”')) {
    throw new Error(`${label} expected Chinese curly quotes:\n${out}`)
  }
}

const viaTemporal = normalizeNovelTemporalNumerals(ascii)
if (!viaTemporal.startsWith('“啪——”')) {
  throw new Error(`temporal path failed:\n${viaTemporal}`)
}

const viaSanitize = sanitizeModelCreativeOutput(ascii)
if (!viaSanitize.startsWith('“啪——”')) {
  throw new Error(`sanitize path failed:\n${viaSanitize}`)
}

console.log('verify-dialogue-quotes OK')
