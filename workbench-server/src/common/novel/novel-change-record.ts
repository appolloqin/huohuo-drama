/** 章末【变更记录】与读者正文分离 — 与前端 novelChangeRecord / causal-chain-parser 一致 */
import { stripNovelChapterEndMeta } from '../../services/novel/novel-memory/novel-memory-parser.js'

const CHANGE_RECORD_RE = /^【变更记录】/m
const CHANGE_RECORD_SPLIT_RE = /(?=^【变更记录】)/m

/** 结构化块：至少一条「- 维: …」+「因果:」≥4 字（散文冒充则否） */
const STRUCTURED_CHANGE_RE =
  /(?:^|\n)\s*[-*]\s*[^:：\n]+[:：][^\n]+\n\s*因果\s*[:：]\s*\S{4,}/

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

/** 是否为结构化变更记录（含「因果:」条目）；散文冒充则否 */
export function isStructuredChangeRecordBlock(block: string): boolean {
  const b = block || ''
  if (STRUCTURED_CHANGE_RE.test(b)) return true
  // 无变化声明（含旧模板「- （无状态变化…）」无冒号行）
  if (/无状态变化/.test(b) && /因果\s*[:：]\s*\S{4,}/.test(b)) return true
  return false
}

function stripChangeRecordHeader(block: string): string {
  return block.replace(/^【变更记录】\s*/m, '').trim()
}

/**
 * 纠正模型把【变更记录】当正文小标题、继续写故事的情况：
 * - 结构化块（含因果条目）→ 保留为元数据（取最后一块）
 * - 否则去掉标题，正文回收（可有多段伪变更记录）
 */
export function normalizeChangeRecordArtifacts(fullText: string): {
  prose: string
  changeBlock: string | null
  reclaimedFakeBlocks: number
} {
  const trimmed = (fullText || '').trim()
  if (!trimmed) return { prose: '', changeBlock: null, reclaimedFakeBlocks: 0 }
  if (!CHANGE_RECORD_RE.test(trimmed)) {
    return { prose: trimmed, changeBlock: null, reclaimedFakeBlocks: 0 }
  }

  const parts = trimmed.split(CHANGE_RECORD_SPLIT_RE)
  const proseParts: string[] = []
  let structured: string | null = null
  let reclaimedFakeBlocks = 0

  for (const part of parts) {
    const t = part.trim()
    if (!t) continue
    if (!CHANGE_RECORD_RE.test(t)) {
      proseParts.push(t)
      continue
    }
    if (isStructuredChangeRecordBlock(t)) {
      if (structured) {
        proseParts.push(stripChangeRecordHeader(structured))
        reclaimedFakeBlocks += 1
      }
      structured = t
    } else {
      const body = stripChangeRecordHeader(t)
      if (body) proseParts.push(body)
      reclaimedFakeBlocks += 1
    }
  }

  return {
    prose: proseParts.join('\n\n').trim(),
    changeBlock: structured,
    reclaimedFakeBlocks,
  }
}

/** 编辑区 / 列表字数：只保留读者正文（变更记录 + 章末事件摘要等） */
export function stripNovelChangeRecord(text: string | null | undefined): string {
  if (!text) return ''
  const { prose } = normalizeChangeRecordArtifacts(text)
  return stripNovelChapterEndMeta(prose)
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
