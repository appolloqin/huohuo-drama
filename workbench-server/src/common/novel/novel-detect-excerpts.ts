/**
 * C2：从检测 suggestions 构建 humanize 定点摘录列表（纯函数，可单测）。
 */

export type DetectSuggestionLike = {
  signal_key?: string
  excerpt?: string
  match_text?: string
}

export type HumanizeExcerptItem = {
  signal_key: string
  text: string
}

export type BuildHumanizeExcerptListOptions = {
  text?: string
  probability?: number
  /** 与 ai_humanize_target 对齐；缺省 39 */
  target?: number
  maxItems?: number
  maxLen?: number
  /** 困惑度原始值；越低越像 AI */
  perplexity?: number
  /** 极低 PPL 时强制带上宽文首/文中窗 */
  forceWideWindows?: boolean
}

const SIGNAL_PRIORITY: Record<string, number> = {
  perplexity: 0,
  sentence_uniformity: 1,
  lexical_pattern: 2,
  lexical: 2,
  phrase_repetition: 3,
}

function normalizeKey(key: string): string {
  return key === 'lexical' ? 'lexical_pattern' : key
}

function signalRank(key: string): number {
  const k = normalizeKey(key)
  return SIGNAL_PRIORITY[k] ?? 50
}

function truncate(s: string, maxLen: number): string {
  const chars = [...s]
  if (chars.length <= maxLen) return s
  return chars.slice(0, maxLen).join('')
}

function normForDedupe(s: string): string {
  return s.replace(/\s+/g, '').trim()
}

/**
 * 去重：相同或互相包含则留更长者。
 */
function dedupeKeepLonger(items: HumanizeExcerptItem[]): HumanizeExcerptItem[] {
  const out: HumanizeExcerptItem[] = []
  for (const item of items) {
    const n = normForDedupe(item.text)
    if (!n) continue
    let absorbed = false
    for (let i = 0; i < out.length; i++) {
      const existing = out[i]!
      const en = normForDedupe(existing.text)
      if (n === en || en.includes(n) || n.includes(en)) {
        if (item.text.length > existing.text.length) out[i] = item
        absorbed = true
        break
      }
    }
    if (!absorbed) out.push(item)
  }
  return out
}

function fallbackWindows(text: string, maxLen: number): HumanizeExcerptItem[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const chars = [...trimmed]
  const head = chars.slice(0, maxLen).join('')
  const midStart = Math.max(0, Math.floor(chars.length / 2) - Math.floor(maxLen / 2))
  const mid = chars.slice(midStart, midStart + maxLen).join('')
  const items: HumanizeExcerptItem[] = [{ signal_key: 'fallback_head', text: head }]
  if (mid && mid !== head) items.push({ signal_key: 'fallback_mid', text: mid })
  return items
}

export function buildHumanizeExcerptList(
  suggestions: DetectSuggestionLike[] | null | undefined,
  opts: BuildHumanizeExcerptListOptions = {},
): { items: HumanizeExcerptItem[]; usedFallback: boolean; wideWindow: boolean } {
  const wideWindow = !!opts.forceWideWindows
    || (opts.probability ?? 0) >= 90
    || (opts.perplexity != null && opts.perplexity > 0 && opts.perplexity < 3)
  const maxItems = opts.maxItems ?? (wideWindow ? 6 : 5)
  const maxLen = opts.maxLen ?? (wideWindow ? 220 : 80)
  const target = opts.target ?? 39

  const raw: HumanizeExcerptItem[] = []
  for (const s of suggestions || []) {
    const key = (s.signal_key || 'other').trim() || 'other'
    const text = (s.excerpt || s.match_text || '').trim()
    if (!text) continue
    raw.push({ signal_key: key, text: truncate(text, maxLen) })
  }

  raw.sort((a, b) => signalRank(a.signal_key) - signalRank(b.signal_key))
  let items = dedupeKeepLonger(raw).slice(0, maxItems)

  if (opts.text && ((items.length === 0 && (opts.probability ?? 0) >= target) || wideWindow)) {
    const windows = fallbackWindows(opts.text, maxLen)
    items = dedupeKeepLonger([...windows, ...items]).slice(0, maxItems)
    return { items, usedFallback: items.some(i => i.signal_key.startsWith('fallback')), wideWindow }
  }
  return { items, usedFallback: false, wideWindow }
}
