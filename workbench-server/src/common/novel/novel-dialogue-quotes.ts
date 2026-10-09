/**
 * 对话引号规范化（程序兜底，不依赖模型自觉）：
 * - 直角「」→ 中文弯引号 “”
 * - 英文直引号 " / 全角 ＂ → 成对 “”
 * - 其它类直引号变体一并收敛
 */

const MAX_PASSES = 8

/** 成对 ASCII/全角直引号 → “…” */
function normalizeStraightDoubleQuotes(text: string): string {
  if (!text) return text
  // ＂ U+FF02 全角；" U+0022 ASCII；〝〞 少数模型会用
  if (!/["＂〝〞]/.test(text)) return text
  let out = ''
  let open = false
  for (const ch of text) {
    if (ch === '"' || ch === '＂' || ch === '〝' || ch === '〞') {
      // 〝 偏开、〞 偏收；其余按开合交替
      if (ch === '〝') {
        out += '“'
        open = true
        continue
      }
      if (ch === '〞') {
        out += '”'
        open = false
        continue
      }
      out += open ? '”' : '“'
      open = !open
      continue
    }
    if (ch === '“' || ch === '「' || ch === '『') open = true
    else if (ch === '”' || ch === '」' || ch === '』') open = false
    out += ch
  }
  return out
}

/** 将成对「…」转为 “…”；多层嵌套多轮处理 */
function normalizeCornerQuotes(text: string): string {
  if (!text || !text.includes('「')) return text
  let out = text
  for (let i = 0; i < MAX_PASSES; i++) {
    const next = out.replace(/「([^「」]*)」/g, '“$1”')
    if (next === out) break
    out = next
  }
  return out
}

/**
 * 正文引号统一为大陆网文惯用中文双引号 “…”
 * 由 normalizeNovelTemporalNumerals / 排版收口调用，不靠提示词。
 */
export function normalizeNovelDialogueQuotes(text: string): string {
  if (!text) return text
  return normalizeCornerQuotes(normalizeStraightDoubleQuotes(text))
}

/** 开合弯引号深度（>0 未闭合） */
export function dialogueQuoteOpenDepth(text: string): number {
  let depth = 0
  for (const ch of text || '') {
    if (ch === '“') depth += 1
    else if (ch === '”' && depth > 0) depth -= 1
  }
  return depth
}

/**
 * 修复未闭合/多余收引号（交付源头，不靠拆段「容忍坏引号」）。
 * - 文末仍开着：在最近句末标点后补 ”；找不到则文末补
 * - 多余 ”：仅在明显成对失衡时删末尾孤立收引号（保守）
 */
export function repairUnbalancedDialogueQuotes(text: string): string {
  if (!text) return text
  let out = normalizeNovelDialogueQuotes(text)
  let guard = 0
  while (dialogueQuoteOpenDepth(out) > 0 && guard < 8) {
    guard += 1
    const depthAt = (s: string) => dialogueQuoteOpenDepth(s)
    // 从后往前找：在仍使 depth>0 的前缀之后的句末处插入 ”
    let inserted = false
    for (let i = out.length - 1; i >= 0; i--) {
      if (!/[。！？!?]/.test(out[i]!)) continue
      const next = out[i + 1]
      if (next === '”') continue
      const head = out.slice(0, i + 1)
      if (depthAt(head) <= 0) continue
      out = `${head}”${out.slice(i + 1)}`
      inserted = true
      break
    }
    if (!inserted) out = `${out}”`
  }
  // 多余收引号：成对后仍多 ” 且落在文末空白前 → 去掉末尾孤立 ”
  guard = 0
  while (guard < 4) {
    guard += 1
    const opens = (out.match(/“/g) || []).length
    const closes = (out.match(/”/g) || []).length
    if (closes <= opens) break
    const trimmedRight = out.replace(/\s+$/, '')
    if (!trimmedRight.endsWith('”')) break
    out = `${trimmedRight.slice(0, -1)}${out.slice(trimmedRight.length)}`
  }
  return out
}
