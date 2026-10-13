/**
 * 审校 JSON 须从混杂 reasoning 中按平衡括号抽出，不能叙事散文冒充成功
 * Run: npx tsx scripts/verify-audit-json-extract.ts
 */
import {
  extractAuditJsonFromText,
  extractJsonBlobFromText,
  salvageProseFromReasoningMessage,
} from '../src/services/ai/ai.js'

const mixed = `
我先分析时空是否一致……这里有个例子 { "foo": 1 }
然后给出结论：
\`\`\`json
{
  "passed": false,
  "score": 62,
  "reason": "章缝回放",
  "dimensions": [{ "dimension": "时空", "status": "fail", "reason": "开篇回演" }],
  "conflicts": ["开篇回演上章「他推门进院」"]
}
\`\`\`
还有旁白像小说：秦卫国走进林子，雪咯吱响。
`

const blob = extractAuditJsonFromText(mixed)
if (!blob.includes('"score"') || !blob.includes('"passed"')) {
  throw new Error(`must extract audit json, got: ${blob.slice(0, 120)}`)
}
const parsed = JSON.parse(blob)
if (parsed.score !== 62 || parsed.passed !== false) throw new Error('wrong object extracted')

const narrativeOnly = '秦卫国走进林子。雪咯吱响。苏婉跟在后面。'.repeat(20)
if (extractAuditJsonFromText(narrativeOnly)) {
  throw new Error('narrative must not look like audit json')
}

const salvagedJson = salvageProseFromReasoningMessage(
  { reasoning_content: mixed },
  'json',
)
if (!salvagedJson.includes('"score"')) throw new Error('json mode must salvage audit json')

const salvagedNarrative = salvageProseFromReasoningMessage(
  { reasoning_content: narrativeOnly },
  'json',
)
if (salvagedNarrative) throw new Error('json mode must NOT salvage narrative prose')

// 错误截取：第一个 { 到最后一个 } 会失败；平衡抽取应成功
const nestedTrap = `分析 { "a": { "b": 1 } } 结束。最终：{"passed":true,"score":88,"dimensions":[],"reason":"ok"}`
const trap = extractAuditJsonFromText(nestedTrap)
const t = JSON.parse(trap)
if (t.score !== 88) throw new Error(`nested trap failed: ${trap.slice(0, 80)}`)

// 连续性账本 JSON：无 score/passed，但须被 structured 抽取接受（审校 salvage 不能误杀）
const ledger = `{
  "environment": "领主府偏院",
  "realm": "无",
  "resources": "存粮半月",
  "appearance": "青布袍",
  "personality": "沉稳",
  "injuries": "赵铁柱胸口伤",
  "timeline": "天未亮透",
  "relations": "赵铁柱归心",
  "foreshadowing": "青水河筑坝",
  "actions": "秦默立军功积分制",
  "knowledge": "仓粮撑不过半月",
  "abilities": "无",
  "emotion": "旧部由疑转服",
  "reminder": "周文远献青水河策",
  "delta": "旧部编营+军功制"
}`
if (extractAuditJsonFromText(ledger)) {
  throw new Error('ledger must not match audit-only extractor')
}
const ledgerBlob = extractJsonBlobFromText(ledger)
if (!ledgerBlob.includes('"environment"') || !ledgerBlob.includes('"delta"')) {
  throw new Error(`ledger blob missing keys: ${ledgerBlob.slice(0, 80)}`)
}
const ledgerFromReasoning = salvageProseFromReasoningMessage(
  { reasoning_content: `先想一下再输出\n${ledger}` },
  'json',
)
if (!ledgerFromReasoning.includes('"environment"')) {
  throw new Error('json salvage must accept continuity ledger shape')
}

console.log('verify-audit-json-extract OK')
