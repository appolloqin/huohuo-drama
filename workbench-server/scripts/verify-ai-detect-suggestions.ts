/**
 * 高分维度必须带修改建议（尤其用词分布 0.28～0.42 字种比）
 * npx tsx scripts/verify-ai-detect-suggestions.ts
 */
import { detectAiText } from '../src/services/ai/ai-text-detection.js'

// 构造偏「模型字种比」的叙述（重复常用字，抬高 lexical）
const chunk = '他仿佛看见那人缓缓走开，微微点头，心中不禁一紧，空气仿佛凝固。'
const text = Array.from({ length: 20 }, () => chunk).join('\n\n')
const det = detectAiText(text)
const lexical = det.signals.find(s => s.key === 'lexical_pattern')?.score ?? 0
if (lexical < 0.55) {
  throw new Error(`夹具用词分布应偏高，实际 ${Math.round(lexical * 100)}%`)
}
if (!det.suggestions?.length) {
  throw new Error('高分检测必须返回修改建议')
}
const hasLexical = det.suggestions.some(s => s.signal_key === 'lexical_pattern')
if (!hasLexical) {
  throw new Error(`用词分布 ${Math.round(lexical * 100)}% 时应有对应建议，实际 keys=${
    det.suggestions.map(s => s.signal_key).join(',')
  }`)
}

console.log('verify-ai-detect-suggestions OK', {
  probability: det.probability,
  lexical: Math.round(lexical * 100),
  suggestionCount: det.suggestions.length,
  keys: det.suggestions.map(s => s.signal_key),
})
