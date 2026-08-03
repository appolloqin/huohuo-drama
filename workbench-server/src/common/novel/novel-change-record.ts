/** 章末【变更记录】与读者正文分离 — 与前端 novelChangeRecord / causal-chain-parser 一致 */
import { stripNovelChapterEndMeta } from '../../services/novel/novel-memory/novel-memory-parser.js'

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

/** 编辑区 / 列表字数：只保留读者正文（变更记录 + 章末事件摘要等） */
export function stripNovelChangeRecord(text: string | null | undefined): string {
  if (!text) return ''
  const withoutChange = splitProseAndChangeRecord(text).prose
  return stripNovelChapterEndMeta(withoutChange)
}
