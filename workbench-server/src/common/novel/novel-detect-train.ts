/**
 * 纯训练核心（design §5.9/§13）：无 DB 无网络；collect 脚本与 retrain 服务共用。
 * logistic 用梯度下降（batch），样本 ≤20 维、几百行——够用且确定性可测。
 */
import { CALIB_MAX_HUMAN_FPR, CALIB_MIN_AI_RECALL } from './novel-detect-calib.js'

export type TrainSample = { x: number[]; y: 0 | 1; label: 'human' | 'ai'; genre: string }
export type Model = { w: number[]; b: number }
export type Metrics = { fpr: number; recall: number; accuracy: number }

const dot = (w: number[], x: number[]) => w.reduce((a, v, i) => a + v * (x[i] || 0), 0)
export const predict = (m: Model, x: number[]) => 1 / (1 + Math.exp(-(m.b + dot(m.w, x))))

export function logisticTrain(samples: TrainSample[], opts?: { l2?: number; iters?: number; lr?: number }): Model {
  const l2 = opts?.l2 ?? 0.01
  const iters = opts?.iters ?? 2000
  const lr = opts?.lr ?? 0.3
  const dim = samples[0]?.x.length ?? 0
  const w = new Array(dim).fill(0)
  let b = 0
  const n = samples.length || 1
  for (let it = 0; it < iters; it++) {
    const gw = new Array(dim).fill(0)
    let gb = 0
    for (const s of samples) {
      const diff = predict({ w: w.slice(), b }, s.x) - s.y
      for (let j = 0; j < dim; j++) gw[j] += diff * (s.x[j] || 0)
      gb += diff
    }
    for (let j = 0; j < dim; j++) w[j] -= lr * (gw[j] / n + l2 * w[j])
    b -= lr * (gb / n)
  }
  return { w, b }
}

export function metricsAt(model: Model, samples: TrainSample[]): Metrics {
  let fp = 0, fn = 0, acc = 0
  let nH = 0, nA = 0
  for (const s of samples) {
    const p = predict(model, s.x) >= 0.5
    if (p === (s.y === 1)) acc++
    if (s.y === 0) { nH++; if (p) fp++ } else { nA++; if (!p) fn++ }
  }
  return {
    fpr: nH ? fp / nH : 0,
    recall: nA ? (nA - fn) / nA : 0,
    accuracy: samples.length ? acc / samples.length : 0,
  }
}

/** 两折评估：奇偶分折，train 一半 eval 另一半，两向取均值（spec §13.4） */
export function twoFoldMetrics(samples: TrainSample[], _?: unknown, opts?: { l2?: number; iters?: number }): Metrics {
  const even = samples.filter((_, i) => i % 2 === 0)
  const odd = samples.filter((_, i) => i % 2 === 1)
  const a = metricsAt(logisticTrain(even, opts), odd)
  const b2 = metricsAt(logisticTrain(odd, opts), even)
  return {
    fpr: (a.fpr + b2.fpr) / 2,
    recall: (a.recall + b2.recall) / 2,
    accuracy: (a.accuracy + b2.accuracy) / 2,
  }
}

/** p 分位（linear、升序）；p 集合 05/25/50/75/90/95（6 点，seed 表同构） */
export function buildPercentiles(values: number[]): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return []
  const q = (p: number) => {
    const idx = (v.length - 1) * p
    const lo = Math.floor(idx)
    const hi = Math.ceil(idx)
    return v[lo]! + (v[hi]! - v[lo]!) * (idx - lo)
  }
  return [q(0.05), q(0.25), q(0.5), q(0.75), q(0.9), q(0.95)].map((x) => Math.round(x * 10000) / 10000)
}

export function buildPplTracks(
  rows: Array<{ ppl: number; refModel: string; mode: 'echo' | 'proxy' | 'prompt_logprobs'; label?: string }>,
): Record<string, { echo?: { mu: number; sd: number }; proxy?: { mu: number; sd: number } }> {
  const by = new Map<string, number[]>()
  for (const r of rows) {
    if (!Number.isFinite(r.ppl) || r.ppl <= 0) continue
    const key = `${r.refModel.toLowerCase()}::${r.mode === 'proxy' ? 'proxy' : 'echo'}`
    ;(by.get(key) || by.set(key, []).get(key)!).push(r.ppl)
  }
  const out: Record<string, { echo?: { mu: number; sd: number }; proxy?: { mu: number; sd: number } }> = {}
  for (const [key, vals] of by) {
    const [model, mode] = key.split('::') as [string, 'echo' | 'proxy']
    if (vals.length < 3) continue
    const mu = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mu) ** 2, 0) / vals.length)
    const bucket = (out[model!] ||= {})
    bucket[mode!] = { mu: Math.round(mu * 1000) / 1000, sd: Math.max(0.3, Math.round(sd * 1000) / 1000) }
  }
  return out
}

export function passesGuardrail(args: {
  metrics: { fpr: number; recall: number; minOk: boolean }
  minPerClass: number
  counts: { human: number; ai: number }
  maxFpr?: number
  minRecall?: number
}): { ok: boolean; reason?: string } {
  const maxFpr = args.maxFpr ?? CALIB_MAX_HUMAN_FPR
  const minRecall = args.minRecall ?? CALIB_MIN_AI_RECALL
  if (!args.metrics.minOk) return { ok: false, reason: '样本不足' }
  if (args.counts.human < args.minPerClass || args.counts.ai < args.minPerClass) {
    return {
      ok: false,
      reason: `样本不足（human ${args.counts.human}/${args.minPerClass}, ai ${args.counts.ai}/${args.minPerClass}）`,
    }
  }
  if (args.metrics.fpr > maxFpr) {
    return { ok: false, reason: `人类误报率 ${(args.metrics.fpr * 100).toFixed(1)}% 超上限 ${maxFpr * 100}%` }
  }
  if (args.metrics.recall < minRecall) {
    return { ok: false, reason: `AI 召回 ${(args.metrics.recall * 100).toFixed(1)}% 低于下限 ${minRecall * 100}%` }
  }
  return { ok: true }
}
