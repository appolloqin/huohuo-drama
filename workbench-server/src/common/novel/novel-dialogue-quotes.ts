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
