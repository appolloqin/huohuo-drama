/**
 * 对话引号规范化：直角引号「」→ 中文双引号 “”
 *（大陆网文惯用；提示词已要求，此处兜底模型仍输出「」的情况）
 */

const MAX_PASSES = 8

/** 将成对「…」转为 “…”；多层嵌套多轮处理 */
export function normalizeNovelDialogueQuotes(text: string): string {
  if (!text || !text.includes('「')) return text
  let out = text
  for (let i = 0; i < MAX_PASSES; i++) {
    const next = out.replace(/「([^「」]*)」/g, '“$1”')
    if (next === out) break
    out = next
  }
  return out
}
