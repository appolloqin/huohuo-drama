/**
 * S5 对抗扰动（spec §5.6）：改写一次 + 快速融合重评，稳定性入融合分。
 * 仅 engine 在临界带调用；本模块只发一次 LLM 调用，不触 DB。
 */
import { countNovelChars } from '../../common/novel/novel-char-limit.js'
import { logTaskWarn } from '../../common/task/task-logger.js'
import type { TextBillingContext } from './ai.js'

export type PerturbOutcome = { applied: boolean; stability: number | null; error?: string; paraphrase?: string }

const PERTURB_SYSTEM = [
  '你是文体轻度改写助手：对给定文本做同义替换与轻微语序调整。',
  '硬性要求：保持原意与段落顺序；改动幅度以"句子读起来换了说法但信息不变"为准；禁止扩写/续写/解释；只输出改写后正文。',
].join('\n')

const llmDefault = async (text: string, billing?: TextBillingContext): Promise<string> => {
  const { chatCompletionText } = await import('./ai.js')
  return chatCompletionText(
    [{ role: 'system', content: PERTURB_SYSTEM }, { role: 'user', content: text }],
    { billing, temperature: 0.6, maxTokens: 4096 },
  )
}

/** fastScore: 对改写文本的快速融合（不含 S2/S3/S5 的新 prob，0–100 整数） */
export async function maybeAdversarialPass(
  args: { text: string; billing?: TextBillingContext; fastScore: (text: string) => number; maxChars?: number },
  rewriter: (text: string, billing?: TextBillingContext) => Promise<string> = llmDefault,
): Promise<PerturbOutcome> {
  const budget = Math.min(args.maxChars ?? 4000, countNovelChars(args.text))
  const head = [...args.text.replace(/\s+/g, ' ')].slice(0, budget).join('')
  try {
    const para = (await rewriter(head, args.billing)).trim()
    if (!para || countNovelChars(para) < 80) return { applied: false, stability: null, error: '改写输出过短' }
    const baseP = args.fastScore(head)
    const pertP = args.fastScore(para)
    if (!Number.isFinite(baseP) || !Number.isFinite(pertP)) return { applied: false, stability: null, error: '快速重评不可用' }
    // 稳定性：改后仍高 AI 分 → 接近 1 的证据强度；大幅回落 → 0
    const stability = Math.round((pertP / 100) * Math.min(1, Math.max(0, 1 - Math.max(0, baseP - pertP) / 40)) * 100) / 100
    return { applied: true, stability, paraphrase: para }
  } catch (err) {
    const msg = (err as Error)?.message || '扰动改写失败'
    logTaskWarn('AiDetect', 'perturb-failed', { error: msg })
    return { applied: false, stability: null, error: msg }
  }
}
