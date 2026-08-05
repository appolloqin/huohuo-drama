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

/**
 * 篇幅补写/压缩时模型常把提示词原文回显进正文；落库前必须剥掉。
 * 题材无关：只认系统指令标记。
 */
export function stripLengthAdjustInstructionEcho(text: string): string {
  let t = (text || '').trim()
  if (!t) return t
  const marker = t.match(/【待补写正文】|【待压缩正文】/)
  if (marker?.index != null && marker.index < 360) {
    t = t.slice(marker.index + marker[0].length).trim()
  }
  t = t.replace(/^【硬性字数】[^\n]*\n+/gm, '').trim()
  t = t.replace(/^在原线索上加场面与反应，禁止注水。\s*/m, '').trim()
  return t
}
