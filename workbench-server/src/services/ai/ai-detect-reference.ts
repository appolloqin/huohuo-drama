/** S2 真文内困惑度：能力探测 + echo/prompt_logprobs/proxy 三轨打分 + 进程内熔断（spec §5.2/G2）。 */
import {
  getPerplexityConfigWithModels, buildPerplexityModelCandidates,
  chatContinuationLogprobs, getTextProviderBaseUrl,
  type ChatCompletionOptions, type AIConfig, type TextBillingContext,
} from './ai.js'
import { logTaskWarn } from '../../common/task/task-logger.js'

export type ReferenceMode = 'echo' | 'prompt_logprobs' | 'proxy' | 'none'
export type RefScore = {
  mode: Exclude<ReferenceMode, 'none'>
  ppl: number; meanLogprob: number; tokenCount: number; model: string
  windowLabel?: string
}

/** 允许测试注入 fetch（默认全局）。 */
let fetchImpl: typeof fetch = (...a) => fetch(...a)
export function setReferenceFetcherForTest(f: typeof fetch | null) { fetchImpl = f || ((...a) => fetch(...a)) }

const probeCache = new Map<string, { mode: ReferenceMode; at: number }>()
const failureCount = new Map<string, number>()
const PROBE_TTL_MS = 5 * 60_000
const BREAKER_THRESHOLD = 3
export function resetReferenceStateForTest() { probeCache.clear(); failureCount.clear() }

function baseUrlKey(cfg: AIConfig, model: string) { return `${cfg.baseUrl}|${cfg.provider}|${model}` }
function noteFailure(key: string) { failureCount.set(key, (failureCount.get(key) || 0) + 1) }
function isTripped(key: string) { return (failureCount.get(key) || 0) >= BREAKER_THRESHOLD }

/** 打分核心：token logprobs（跳过首 token null）→ ppl */
export function pplFromTokenLogprobs(tokenLogprobs: Array<number | null>): { ppl: number; meanLogprob: number; tokenCount: number } {
  const valid = tokenLogprobs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  if (valid.length < 8) throw new Error('logprobs 样本过少，无法计算困惑度')
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length
  return { ppl: Math.exp(-mean), meanLogprob: mean, tokenCount: valid.length }
}

/** echo 请求（OpenAI 兼容 completions；vLLM 需 --enable-prompt-tokens-details） */
async function scoreViaEcho(cfg: AIConfig, model: string, text: string, billing?: ChatCompletionOptions['billing']): Promise<RefScore> {
  const url = `${getTextProviderBaseUrl(cfg).replace(/\/+$/, '')}/completions`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, prompt: text, max_tokens: 0, echo: true, logprobs: 1, temperature: 0 }),
  })
  const data = await parseJsonOrThrow(res)
  const tokenLogprobs = data?.choices?.[0]?.logprobs?.token_logprobs
  if (!Array.isArray(tokenLogprobs)) throw new Error('echo 未返回 token_logprobs')
  const { ppl, meanLogprob, tokenCount } = pplFromTokenLogprobs(tokenLogprobs)
  if (billing) await chargeReference(cfg, text, billing)
  return { mode: 'echo', ppl, meanLogprob, tokenCount, model }
}

/** vLLM prompt_logprobs 扩展（max_tokens=1 + prompt_logprobs 响应体） */
async function scoreViaPromptLogprobs(cfg: AIConfig, model: string, text: string, billing?: ChatCompletionOptions['billing']): Promise<RefScore> {
  const url = `${getTextProviderBaseUrl(cfg).replace(/\/+$/, '')}/completions`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model, prompt: text, max_tokens: 1, temperature: 0, logprobs: 1, prompt_logprobs: 1 }),
  })
  const data = await parseJsonOrThrow(res)
  const rows: Array<Record<string, unknown> | null> | undefined = data?.choices?.[0]?.prompt_logprobs
  if (!Array.isArray(rows)) throw new Error('prompt_logprobs 未返回')
  const toks: (number | null)[] = rows.map((r) => (r && typeof r.logprob === 'number' ? r.logprob : null))
  const { ppl, meanLogprob, tokenCount } = pplFromTokenLogprobs(toks)
  if (billing) await chargeReference(cfg, text, billing)
  return { mode: 'prompt_logprobs', ppl, meanLogprob, tokenCount, model }
}

async function parseJsonOrThrow(res: Response): Promise<any> {
  const raw = await res.text()
  let data: any
  try { data = raw ? JSON.parse(raw) : {} } catch { throw new Error(raw.slice(0, 200) || `AI 响应无效 (${res.status})`) }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || raw.slice(0, 300) || `AI 请求失败 (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return data
}

/** 探测：200 字探针依次试 echo → prompt_logprobs → proxy；结果缓存 5min；熔断优先 none */
async function probeMode(cfg: AIConfig, model: string): Promise<ReferenceMode> {
  const key = baseUrlKey(cfg, model)
  if (isTripped(key)) return 'none'
  const hit = probeCache.get(key)
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.mode
  const probe = '测试文本。'.repeat(60)
  let mode: ReferenceMode = 'none'
  for (const scorer of [scoreViaEcho, scoreViaPromptLogprobs]) {
    try { await scorer(cfg, model, probe); mode = scorer === scoreViaEcho ? 'echo' : 'prompt_logprobs'; break }
    catch { /* next */ }
  }
  if (mode === 'none') {
    try { await chatContinuationLogprobs(probe, { model, config: cfg }); mode = 'proxy' } catch { mode = 'none' }
  }
  probeCache.set(key, { mode, at: Date.now() })
  return mode
}

/** 主入口：候选模型（复用 buildPerplexityModelCandidates）逐个探测打分；失败熔断；全挂抛错 */
export async function scoreWithReference(
  text: string, opts: ChatCompletionOptions & { maxCandidates?: number } = {},
): Promise<RefScore> {
  const { cfg, models, settings } = await getPerplexityConfigWithModels({ userId: opts.billing?.userId })
  const candidates = opts.model ? [opts.model] : buildPerplexityModelCandidates(cfg, models, settings)
  let lastErr: Error | null = null
  for (const model of candidates.slice(0, opts.maxCandidates || 3)) {
    const key = baseUrlKey(cfg, model)
    if (isTripped(key)) { continue }
    const mode = await probeMode(cfg, model)
    try {
      if (mode === 'echo') return await scoreViaEcho(cfg, model, text, opts.billing)
      if (mode === 'prompt_logprobs') return await scoreViaPromptLogprobs(cfg, model, text, opts.billing)
      if (mode === 'proxy') {
        const r = await chatContinuationLogprobs(text, { ...opts, model, config: cfg })
        return { mode: 'proxy', ppl: r.perplexity, meanLogprob: r.meanLogprob, tokenCount: r.tokenCount, model }
      }
      throw new Error('参考端点不支持文内打分/代理打分')
    } catch (err: any) {
      noteFailure(key)
      lastErr = err instanceof Error ? err : new Error(String(err?.message || err))
      logTaskWarn('AI', 'reference-score-model-failed', { model, trip: isTripped(key), error: lastErr.message })
    }
  }
  throw lastErr || new Error('无可用的困惑度参考模型')
}

/** echo/prompt_logprobs 计费（proxy 路径已在 chatContinuationLogprobs 内部扣费，勿重复） */
async function chargeReference(cfg: AIConfig, prompt: string, billing: TextBillingContext): Promise<void> {
  const { maybeChargeTextPublic } = await import('./ai.js')
  await maybeChargeTextPublic(cfg, [{ role: 'user', content: prompt.slice(0, 2000) }], '', undefined, billing)
}

/** 当前配置下首个候选参考模型（小写）；无配置='none' */
export async function getRefProbeKey(): Promise<string> {
  try {
    const { getPerplexityConfigWithModels: getCfg, buildPerplexityModelCandidates: buildCands } = await import('./ai.js')
    const { cfg, models, settings } = await getCfg({})
    return (buildCands(cfg, models, settings)[0] || 'none').toLowerCase()
  } catch { return 'none' }
}

// —— 可测性导出（测试钩子，命名即表明用途）——
export const scoreEchoForTest = scoreViaEcho
export const scorePromptLogprobsForTest = scoreViaPromptLogprobs
export const _internal = { baseUrlKey, noteFailure, isTripped, probeCache, failureCount }
