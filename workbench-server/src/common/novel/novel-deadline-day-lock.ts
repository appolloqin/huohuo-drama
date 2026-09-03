/**
 * 主期限天数锁定（兜底）：若后文仍偷换/重报了不同天数，无改限说明则改回首立。
 * 正解应是分拍勿重报合同；本函数只修补漏网的数字打架。
 */
import { logTaskWarn } from '../task/task-logger.js'

function cnDayToArabic(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token)
  const digit: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  }
  if (token.length === 1 && digit[token] != null) return digit[token]!
  return null
}

const EXPLICIT_CHANGE_RE = /改限|改成|改为|宽限|放宽|再给|加到|延到|延长|从.{0,8}日.{0,8}改/

type Hit = { start: number; end: number; days: number; raw: string }

/** 交割向：N日之内/之后/期限；拢共N日；N日期限已含 */
function collectDeadlineHits(raw: string): Hit[] {
  const hits: Hit[] = []
  const patterns: RegExp[] = [
    /(\d+|[一两三四五六七八九十])日(?:之内|之后|期限)/g,
    /拢共\s*(\d+|[一两三四五六七八九十])日/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      const days = cnDayToArabic(m[1]!)
      if (days == null || days < 1 || days > 30) continue
      hits.push({ start: m.index, end: m.index + m[0].length, days, raw: m[0] })
    }
  }
  // 「3日，3日之后」或句末「3日。」紧贴收尸/来收等
  const bareRe =
    /(?:^|[，,；;。！？\s“"])((\d+|[一两三四五六七八九十])日)(?=[，,；;。！？\s”"]|$)/g
  let m: RegExpExecArray | null
  while ((m = bareRe.exec(raw)) !== null) {
    const full = m[1]!
    const token = m[2]!
    const days = cnDayToArabic(token)
    if (days == null || days < 1 || days > 30) continue
    const start = m.index + (m[0].length - full.length)
    const end = start + full.length
    if (raw.slice(end, end + 1) === '前') continue
    if (hits.some(h => !(end <= h.start || start >= h.end))) continue
    const win = raw.slice(Math.max(0, start - 16), Math.min(raw.length, end + 20))
    if (!/限|逾|交|收|来收|起算|卯时|之后|之内/.test(win)) continue
    hits.push({ start, end, days, raw: full })
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  // 去重嵌套
  const out: Hit[] = []
  for (const h of hits) {
    if (out.some(p => h.start >= p.start && h.end <= p.end)) continue
    out.push(h)
  }
  return out
}

/**
 * 将后文与首立不一致的交割天数改回首立天数（有「改限」等明示则跳过该处）。
 */
export function lockDeadlineDayConsistency(content: string): {
  text: string
  removed: boolean
  primaryDays?: number
} {
  const raw = content || ''
  if (!raw.trim()) return { text: raw, removed: false }

  const hits = collectDeadlineHits(raw)
  if (hits.length < 2) return { text: raw, removed: false }

  const primary = hits[0]!
  const primaryDays = primary.days
  let text = raw
  let changed = false

  for (let i = hits.length - 1; i >= 1; i--) {
    const h = hits[i]!
    if (h.days === primaryDays) continue
    const ctx = raw.slice(Math.max(0, h.start - 24), Math.min(raw.length, h.end + 16))
    if (EXPLICIT_CHANGE_RE.test(ctx)) continue

    const replaced = h.raw.replace(/(\d+|[一两三四五六七八九十])/, String(primaryDays))
    // h offsets are on original raw; after prior replaces, need map — apply on current text via raw positions only if we go reverse and lengths of day tokens stay 1 digit for 1-9
    // Safer: recompute from original raw only, build from end
    text = `${text.slice(0, h.start)}${replaced}${text.slice(h.end)}`
    changed = true
  }

  if (!changed) return { text: raw, removed: false, primaryDays }

  logTaskWarn('Novel', 'deadline-day-locked', {
    primaryDays,
    excerpt: raw.slice(primary.start, primary.start + 24).replace(/\s+/g, ' '),
  })
  return { text, removed: true, primaryDays }
}
