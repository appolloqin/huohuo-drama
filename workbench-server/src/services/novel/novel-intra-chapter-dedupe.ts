/**
 * 章内近重复：同一长段在章内出现两次（常见于补写/合规修正拼缝）。
 * 题材无关：只凭长连续归一化指纹，不认场面词。
 */
import { logTaskWarn } from '../../common/task/task-logger.js'

function norm(s: string): string {
  return s.replace(/\s+/g, '').replace(/[，。！？、；：…—\-~·"'「」『』“”']/g, '')
}

function sharedPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

/** 前句是否为后句的残句/近变体（同前缀后分叉；完整句被后句续写不算） */
function brokenVariantOf(earlier: string, later: string): boolean {
  const na = norm(earlier)
  const nb = norm(later)
  if (na.length < 12 || nb.length < 12) return false
  if (na === nb) return true
  const sp = sharedPrefixLen(na, nb)
  const need = Math.max(10, Math.floor(Math.min(na.length, nb.length) * 0.45))
  if (sp >= need) {
    if (nb.startsWith(na) && /[。！？]$/.test(earlier.trim())) return false
    if (sp < Math.min(na.length, nb.length)) return true
  }
  return brokenCoreVariant(na, nb)
}

/**
 * 共享核近变体：完整句「…换点玉米面回来」vs 拼缝残句「换点玉米面回把脑袋…」
 * （残句不一定与整句从头对齐）
 */
function brokenCoreVariant(na: string, nb: string): boolean {
  const probe = (short: string, long: string): boolean => {
    if (short.length < 10 || long.length < 10) return false
    const coreNeed = 6
    for (let i = 0; i <= long.length - coreNeed; i++) {
      const sp = sharedPrefixLen(short, long.slice(i))
      if (sp < coreNeed) continue
      if (sp >= short.length) continue
      if (short[sp] !== long[i + sp]) return true
    }
    return false
  }
  return probe(na, nb) || probe(nb, na)
}

function findDivergentCore(
  na: string,
  nb: string,
): { sp: number; sa: string; sb: string } | null {
  const coreNeed = 6
  let best: { sp: number; sa: string; sb: string } | null = null
  for (let i = 0; i <= nb.length - coreNeed; i++) {
    const sp = sharedPrefixLen(na, nb.slice(i))
    if (sp < coreNeed || sp >= na.length) continue
    if (na[sp] === nb[i + sp]) continue
    if (!best || sp > best.sp) best = { sp, sa: na.slice(sp), sb: nb.slice(i + sp) }
  }
  for (let i = 0; i <= na.length - coreNeed; i++) {
    const sp = sharedPrefixLen(nb, na.slice(i))
    if (sp < coreNeed || sp >= nb.length) continue
    if (nb[sp] === na[i + sp]) continue
    if (!best || sp > best.sp) best = { sp, sa: na.slice(i + sp), sb: nb.slice(sp) }
  }
  return best
}

/** 两句近变体时，保留分叉更短、更像收束的那句 */
function preferCompleteSentence(a: string, b: string): 'a' | 'b' {
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return 'b'
  const headSp = sharedPrefixLen(na, nb)
  if (headSp >= 10) {
    if (nb.startsWith(na) && /[。！？]$/.test(a.trim())) return 'a'
    if (na.startsWith(nb) && /[。！？]$/.test(b.trim())) return 'b'
    const sa = na.slice(headSp)
    const sb = nb.slice(headSp)
    if (sa.length <= 2 && sb.length > 4) return 'a'
    if (sb.length <= 2 && sa.length > 4) return 'b'
    if (sa.length !== sb.length) return sa.length < sb.length ? 'a' : 'b'
  }
  const core = findDivergentCore(na, nb)
  if (core) {
    if (core.sa.length <= 2 && core.sb.length > 4) return 'a'
    if (core.sb.length <= 2 && core.sa.length > 4) return 'b'
    if (core.sa.length !== core.sb.length) return core.sa.length < core.sb.length ? 'a' : 'b'
  }
  return na.length <= nb.length ? 'a' : 'b'
}

function looksBrokenAgainst(prev: string, referenceNorm: string): boolean {
  const prevN = norm(prev)
  if (prevN.length < 12 || !referenceNorm) return false
  if (referenceNorm.includes(prevN)) return false
  if (brokenCoreVariant(prevN, referenceNorm)) return true
  const prefixHint = prevN.slice(0, Math.min(8, prevN.length))
  return prefixHint.length >= 4 && referenceNorm.includes(prefixHint)
}

function sentencesOf(chunk: string): string[] {
  return (chunk.match(/[^\n。！？]+[。！？]?/g) || []).filter(s => [...s].length >= 8)
}

function sentenceSpansIn(raw: string, from: number, to: number): { start: number; end: number; text: string }[] {
  const slice = raw.slice(from, to)
  const out: { start: number; end: number; text: string }[] = []
  const re = /[^\n。！？]+[。！？]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(slice)) !== null) {
    if ([...m[0]].length < 8) continue
    out.push({ start: from + m.index, end: from + m.index + m[0].length, text: m[0] })
  }
  return out
}

export type IntraChapterDupHit = {
  removeStart: number
  removeEnd: number
  fingerprintLen: number
  excerpt: string
}

/**
 * 在归一化串上找最长重复指纹，再映射回原文第二次出现区间并删掉。
 */
export function findIntraChapterNearDuplicate(
  content: string,
  minFingerprint = 36,
): IntraChapterDupHit | null {
  const raw = content || ''
  if ([...raw].length < minFingerprint * 3) return null
  const n = norm(raw)
  if (n.length < minFingerprint * 3) return null

  let best: { len: number; b: number } | null = null
  const maxLen = Math.min(96, Math.floor(n.length / 3))
  for (let len = maxLen; len >= minFingerprint; len -= 2) {
    const step = len >= 48 ? 6 : 3
    const searchLimit = n.length - len * 2
    for (let i = 0; i <= searchLimit; i += step) {
      const fp = n.slice(i, i + len)
      const j = n.indexOf(fp, i + len)
      if (j < 0) continue
      best = { len, b: j }
      break
    }
    if (best) break
  }
  if (!best) return null

  const fp = n.slice(best.b, best.b + best.len)
  const anchorN = fp.slice(
    Math.floor(best.len * 0.15),
    Math.floor(best.len * 0.15) + Math.min(28, Math.max(16, Math.floor(best.len * 0.3))),
  )
  if (anchorN.length < 12) return null

  let firstEnd = -1
  let secondStart = -1
  let secondEnd = -1
  const chars = [...raw]
  for (let i = 0; i < chars.length; i++) {
    if (firstEnd >= 0 && i < firstEnd) continue
    let acc = ''
    for (let j = i; j < chars.length && acc.length < anchorN.length + 12; j++) {
      const ch = chars[j]!
      if (/\s/.test(ch) || /[，。！？、；：…—\-~·"'「」『』“”']/.test(ch)) continue
      acc += ch
      if (acc.length >= anchorN.length && acc.includes(anchorN)) {
        if (firstEnd < 0) {
          firstEnd = j + 1
          break
        }
        secondStart = i
        secondEnd = j + 1
        break
      }
    }
    if (secondStart >= 0) break
  }
  if (secondStart < 0 || secondEnd < 0) return null

  while (secondStart > 0 && !/[。！？\n]/.test(raw[secondStart - 1]!)) secondStart -= 1
  const anchorSecondStart = secondStart

  // 从第二次指纹命中处按句外扩，禁止按 fingerprint*1.4 整块跳（会吞掉更完整的收束句）
  let end = secondEnd
  {
    const rest = raw.slice(end)
    const m = rest.match(/^[^。！？]{0,120}[。！？]?/)
    if (m) end += m[0].length
  }

  // 吞第二次块后续：仅当该句是首段的重复/残句，绝不吞「比首段更完整」的收束句
  {
    const headChunk = raw.slice(0, anchorSecondStart)
    const headN = norm(headChunk)
    const headSents = sentencesOf(headChunk)
    let guard = 0
    while (guard++ < 10) {
      const more = raw.slice(end, end + 320)
      if (!more.trim()) break
      const m2 = more.match(/^[\s\S]*?[。！？]/)
      if (!m2 || m2[0].length < 12) break
      const sn = norm(m2[0])
      const headFp = fp.slice(0, Math.min(20, fp.length))
      // 当前句比首段对应句更完整 → 立刻停，保留收束
      if (headSents.some(s => brokenVariantOf(s, m2[0]) && preferCompleteSentence(s, m2[0]) === 'b')) break
      const dupOfHead = sn.length >= 16 && headN.includes(sn)
      const brokenOfHead = headSents.some(s => brokenVariantOf(m2[0], s) && preferCompleteSentence(m2[0], s) === 'b')
      const sameScene = norm(m2[0]).includes(headFp)
      if (!sameScene && !dupOfHead && !brokenOfHead) {
        // 夹在重复块中的孤儿句：若下一句已是首段重复，则本句一并删
        const next = raw.slice(end + m2[0].length).match(/^[\s\S]*?[。！？]/)
        const nextIsReplay = !!next && headSents.some(s => {
          const nn = norm(next[0])
          const sn0 = norm(s)
          return nn === sn0 || nn.startsWith(sn0) || sn0.startsWith(nn.slice(0, Math.min(12, nn.length)))
        })
        if (nextIsReplay && [...m2[0]].length < 100) {
          end += m2[0].length
          continue
        }
        break
      }
      end += m2[0].length
    }
  }

  // 第二次指纹前窗口：只在「第一次指纹之后」查找残句，避免误删首段正文
  {
    const windowFrom = Math.max(firstEnd, anchorSecondStart - 280)
    const afterSents = sentencesOf(raw.slice(end))
    const spans = sentenceSpansIn(raw, windowFrom, anchorSecondStart)
    let earliest = anchorSecondStart
    for (const sp of spans) {
      const beforeN = norm(raw.slice(0, sp.start))
      const vsAfter = afterSents.some(s => {
        if (norm(sp.text) === norm(s)) return false
        return brokenVariantOf(sp.text, s) && preferCompleteSentence(sp.text, s) === 'b'
      })
      const vsBefore = looksBrokenAgainst(sp.text, beforeN)
        || sentencesOf(raw.slice(0, sp.start)).some(s => {
          if (norm(sp.text) === norm(s)) return false
          return brokenVariantOf(sp.text, s) && preferCompleteSentence(sp.text, s) === 'b'
        })
      if (vsAfter || vsBefore) {
        earliest = sp.start
        break
      }
    }
    secondStart = earliest
  }

  while (secondStart > 0 && /\s/.test(raw[secondStart - 1]!)) secondStart -= 1

  if (end - secondStart < minFingerprint) return null
  return {
    removeStart: secondStart,
    removeEnd: Math.min(raw.length, end),
    fingerprintLen: best.len,
    excerpt: raw.slice(secondStart, Math.min(raw.length, secondStart + 56)).replace(/\s+/g, ' '),
  }
}

/**
 * 近变体句桥：删更残的那句（及两句之间的孤儿），保留更完整的收束。
 */
export function stripNearVariantSentenceBridge(content: string): {
  text: string
  removed: boolean
} {
  const raw = content || ''
  const spans = sentenceSpansIn(raw, 0, raw.length).filter(s => [...s.text].length >= 8)
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < Math.min(spans.length, i + 8); j++) {
      const a = spans[i]!
      const b = spans[j]!
      const na = norm(a.text)
      const nb = norm(b.text)

      // 后句以完整前句为前缀续写 → 删前句；仅限邻近句，避免误删章首短句
      if (
        na.length >= 12
        && nb.startsWith(na)
        && /[。！？]$/.test(a.text.trim())
        && nb.length > na.length + 2
        && b.start - a.end < 200
      ) {
        const text = `${raw.slice(0, a.start)}${raw.slice(b.start)}`.replace(/\n{3,}/g, '\n\n').trim()
        if ([...text].length >= [...raw].length * 0.45) {
          logTaskWarn('Novel', 'intra-chapter-near-variant-bridge-stripped', {
            keep: 'b',
            reason: 'prefix-extension',
            earlier: a.text.slice(0, 36),
            later: b.text.slice(0, 36),
          })
          return { text, removed: true }
        }
      }

      // 后句包含前句核（「他把兔子揣进怀里」vs「做完这一切，他把兔子揣进怀里」）→ 删后句
      if (na.length >= 16 && nb.includes(na) && nb.length > na.length + 4) {
        const text = `${raw.slice(0, b.start)}${raw.slice(b.end)}`.replace(/\n{3,}/g, '\n\n').trim()
        logTaskWarn('Novel', 'intra-chapter-near-variant-bridge-stripped', {
          keep: 'a',
          reason: 'contained-replay',
          earlier: a.text.slice(0, 36),
          later: b.text.slice(0, 36),
        })
        return { text, removed: true }
      }

      const ab = brokenVariantOf(a.text, b.text)
      const ba = brokenVariantOf(b.text, a.text)
      if (!ab && !ba) continue

      if (na === nb) {
        const text = `${raw.slice(0, b.start)}${raw.slice(b.end)}`.replace(/\n{3,}/g, '\n\n').trim()
        return { text, removed: true }
      }

      const keep = preferCompleteSentence(a.text, b.text)
      let text: string
      if (keep === 'b') {
        text = `${raw.slice(0, a.start)}${raw.slice(b.start)}`.replace(/\n{3,}/g, '\n\n').trim()
      } else {
        text = `${raw.slice(0, b.start)}${raw.slice(b.end)}`.replace(/\n{3,}/g, '\n\n').trim()
      }
      if ([...text].length < [...raw].length * 0.45) continue
      logTaskWarn('Novel', 'intra-chapter-near-variant-bridge-stripped', {
        keep,
        earlier: a.text.slice(0, 36),
        later: b.text.slice(0, 36),
      })
      return { text, removed: true }
    }
  }
  return { text: raw, removed: false }
}

export function stripIntraChapterNearDuplicate(content: string): {
  text: string
  removed: boolean
  excerpt?: string
} {
  let text = content
  let removed = false
  let excerpt: string | undefined
  for (let i = 0; i < 2; i++) {
    const hit = findIntraChapterNearDuplicate(text)
    if (!hit) break
    const next = `${text.slice(0, hit.removeStart)}${text.slice(hit.removeEnd)}`
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if ([...next].length < [...text].length * 0.5) break
    text = next
    removed = true
    excerpt = hit.excerpt
    logTaskWarn('Novel', 'intra-chapter-near-dup-stripped', {
      fingerprintLen: hit.fingerprintLen,
      excerpt: hit.excerpt,
      round: i + 1,
    })
  }
  for (let i = 0; i < 3; i++) {
    const bridge = stripNearVariantSentenceBridge(text)
    if (!bridge.removed) break
    text = bridge.text
    removed = true
  }
  return { text, removed, excerpt }
}
