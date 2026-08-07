/**
 * 流式 delta：有 reasoning 时不得丢弃同包 content；关思考须写回请求体；reasoning 夹 JSON 可抢救
 * Run: npx tsx scripts/verify-stream-reasoning-content.ts
 */
import {
  appendStreamReasoning,
  applyNonMiniMaxThinkingDisable,
  extractJsonBlobFromText,
  extractStreamContentPieces,
  salvageProseFromReasoningMessage,
} from '../src/services/ai/ai.js'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
  console.log('ok', msg)
}

const both = {
  reasoning_content: 'Let me analyze the chapter outline...',
  content: '木门被踹开的时候，赵德柱那一拳差半寸就落下去。',
}
assert(extractStreamContentPieces(both).join('') === both.content, 'content kept when reasoning present')
assert(
  appendStreamReasoning('', both).includes('Let me analyze'),
  'reasoning accumulated separately',
)

const body: Record<string, unknown> = {
  model: 'deepseek-v4-flash',
  reasoning_effort: 'high',
  thinking_budget: 1024,
}
applyNonMiniMaxThinkingDisable(body, {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'x',
  model: 'deepseek-v4-flash',
})
assert(body.enable_thinking === false, 'enable_thinking false')
assert((body.thinking as { type: string }).type === 'disabled', 'thinking.disabled')
assert((body.reasoning as { effort: string }).effort === 'none', 'reasoning.effort none')
assert(body.reasoning_effort === undefined, 'reasoning_effort cleared')
assert(body.thinking_budget === undefined, 'thinking_budget cleared')

const jsonInReasoning = salvageProseFromReasoningMessage({
  content: '',
  reasoning_content: 'Let me score this chapter carefully.\n{"score":78,"passed":true,"functions_hit":2,"conflicts":[]}\n',
})
assert(jsonInReasoning.includes('"score":78'), 'salvage JSON from reasoning')
assert(extractJsonBlobFromText('foo {"a":1} bar').includes('"a":1'), 'extractJsonBlob')

console.log('PASS')
