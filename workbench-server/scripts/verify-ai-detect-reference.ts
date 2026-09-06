// 纯函数 + 假 fetch 层：echo / prompt_logprobs / 无 logprobs 报错 / 熔断开关节；proxy 路径依赖真实配置，不在本脚本覆盖（运行时人工冒烟验）。
import {
  pplFromTokenLogprobs, resetReferenceStateForTest, setReferenceFetcherForTest,
  scoreEchoForTest, scorePromptLogprobsForTest, _internal,
} from '../src/services/ai/ai-detect-reference.js'

const bad = () => { throw new Error('should not reach real network') }
if (typeof fetch === 'undefined') throw new Error('env')
setReferenceFetcherForTest(async (_url: any, init: any) => {
  const body = JSON.parse(init.body)
  const toks = [null, ...Array(20).fill(-0.5)]
  const json = body.echo ? { choices: [{ logprobs: { token_logprobs: toks } }] }
    : { choices: [{ prompt_logprobs: toks.map((v: number | null) => (v == null ? null : { logprob: v })), text: 'x' }] }
  return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
const cfg = { apiKey: 'k', baseUrl: 'http://mock.test/v1', model: 'm', provider: 'mock' } as any
const echo = await scoreEchoForTest(cfg, 'm', 'x'.repeat(200))
if (echo.mode !== 'echo' || Math.abs(echo.ppl - Math.exp(0.5)) > 1e-6) throw new Error(`echo ppl=${echo.ppl}`)
const pl = await scorePromptLogprobsForTest(cfg, 'm', 'x'.repeat(200))
if (pl.mode !== 'prompt_logprobs' || Math.abs(pl.ppl - Math.exp(0.5)) > 1e-6) throw new Error(`prompt_logprobs ppl=${pl.ppl}`)

// 计划样例少写了一个有效 token（null 后需 ≥8）；补足后 mean=-1.5 → ppl=exp(1.5)
const parsed = pplFromTokenLogprobs([null, -1, -2, -1, -2, -1, -2, -1, -2])
if (Math.abs(parsed.ppl - Math.exp(12 / 8)) > 1e-9) throw new Error('ppl formula')
try { pplFromTokenLogprobs([null, -1]); throw new Error('should fail sample<8') }
catch (e: any) { if (!e.message.includes('样本过少')) throw e }

// 熔断：同 key 记 3 败后 tripped
const key = _internal.baseUrlKey(cfg as any, 'm')
_internal.noteFailure(key); _internal.noteFailure(key)
if (_internal.isTripped(key)) throw new Error('premature trip')
_internal.noteFailure(key)
if (!_internal.isTripped(key)) throw new Error('trip after 3 failures')

resetReferenceStateForTest()
setReferenceFetcherForTest(bad as any)
console.log('verify-ai-detect-reference OK')
