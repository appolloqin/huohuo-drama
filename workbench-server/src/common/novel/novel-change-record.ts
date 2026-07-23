/** 章末【变更记录】与读者正文分离 — 与前端 novelChangeRecord / causal-chain-parser 一致 */

const CHANGE_RECORD_RE = /^【变更记录】/m

export function splitProseAndChangeRecord(fullText: string): {
  prose: string
  changeBlock: string | null
} {
  const trimmed = (fullText || '').trim()
  if (!trimmed) return { prose: '', changeBlock: null }
  const idx = trimmed.search(CHANGE_RECORD_RE)
  if (idx < 0) return { prose: trimmed, changeBlock: null }
  return {
    prose: trimmed.slice(0, idx).trim(),
    changeBlock: trimmed.slice(idx).trim(),
  }
}

/** 编辑区 / 列表字数：只保留读者正文 */
export function stripNovelChangeRecord(text: string | null | undefined): string {
  if (!text) return ''
  return splitProseAndChangeRecord(text).prose
}
