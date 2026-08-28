/** 章末【变更记录】与读者正文分离 — 与前端 novelChangeRecord / causal-chain-parser 一致 */
import { stripNovelChapterEndMeta } from '../../services/novel/novel-memory/novel-memory-parser.js'

/** 规范化后的标题行 */
const CHANGE_RECORD_RE = /^【变更记录】/m
const CHANGE_RECORD_SPLIT_RE = /(?=^【变更记录】)/m

/** 结构化块：至少一条「- 维: …」+「因果:」≥4 字（散文冒充则否） */
const STRUCTURED_CHANGE_RE =
  /(?:^|\n)\s*[-*]\s*[^:：\n]+[:：][^\n]+\n\s*因果\s*[:：]\s*\S{4,}/

/**
 * 模型常写成 `**【变更记录】**` / `## 【变更记录】` / 全角空格等，
 * 必须先归一成行首 `【变更记录】`，否则整段会当正文留下。
 */
export function canonicalizeChangeRecordHeaders(text: string): string {
  return (text || '').replace(
    /(^|\n)[ \t]*(?:#{1,3}[ \t]*)?(?:\*{1,2}[ \t]*)?【[ \t]*变更记录[ \t]*】(?:[ \t]*\*{1,2})?[ \t]*(?=\r?\n|$)/g,
    '$1【变更记录】',
  )
}

/** 结构化条目续行（子弹 / 因果字段 / 空行） */
function isChangeRecordMetaLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^[-*]\s*[^:：\n]+[:：]/.test(t)) return true
  if (/^[-*]\s*.*无状态变化/.test(t)) return true
  if (/^(因果|触发|代价|感知|耗时)\s*[:：]/.test(t)) return true
  return false
}

function looksLikeChangeEntryStart(line: string): boolean {
  const t = line.trim()
  return /^[-*]\s*[^:：\n]+[:：]/.test(t) || /^[-*]\s*.*无状态变化/.test(t)
}

/**
 * 结构化【变更记录】后若又接回故事正文，切开：元数据 vs 尾随散文。
 */
export function splitStructuredBlockAndTrailingProse(block: string): {
  changeBlock: string
  trailingProse: string
} {
  const raw = (block || '').trim()
  if (!raw) return { changeBlock: '', trailingProse: '' }

  const lines = raw.split(/\r?\n/)
  let i = 0
  if (CHANGE_RECORD_RE.test((lines[0] || '').trim())) i = 1

  let lastMetaIdx = i - 1
  for (; i < lines.length; i++) {
    if (isChangeRecordMetaLine(lines[i]!)) {
      if (lines[i]!.trim()) lastMetaIdx = i
      continue
    }
    break
  }

  if (i >= lines.length) {
    return { changeBlock: ensureChangeRecordHeader(raw), trailingProse: '' }
  }

  const changeLines = lines.slice(0, Math.max(lastMetaIdx + 1, 1))
  const trailingLines = lines.slice(lastMetaIdx + 1)
  while (trailingLines.length && !trailingLines[0]!.trim()) trailingLines.shift()

  return {
    changeBlock: ensureChangeRecordHeader(changeLines.join('\n').trim()),
    trailingProse: trailingLines.join('\n').trim(),
  }
}

function ensureChangeRecordHeader(block: string): string {
  const t = (block || '').trim()
  if (!t) return t
  if (CHANGE_RECORD_RE.test(t)) return t
  return `【变更记录】\n${t}`
}

/** 是否为结构化变更记录（含「因果:」条目）；散文冒充则否 */
export function isStructuredChangeRecordBlock(block: string): boolean {
  const b = canonicalizeChangeRecordHeaders(block || '')
  if (STRUCTURED_CHANGE_RE.test(b)) return true
  if (/无状态变化/.test(b) && /因果\s*[:：]\s*\S{4,}/.test(b)) return true
  return false
}

function stripChangeRecordHeader(block: string): string {
  return canonicalizeChangeRecordHeaders(block)
    .replace(/^【变更记录】\s*/m, '')
    .trim()
}

/**
 * 无「【变更记录】」标题时，模型仍可能把「- 维: / 因果:」条目插进正文。
 * 按行扫描连续元数据块并剥离；块后故事正文保留。
 */
export function peelOrphanedStructuredFromProse(prose: string): {
  prose: string
  changeBlocks: string[]
} {
  const raw = (prose || '').trim()
  if (!raw) return { prose: '', changeBlocks: [] }
  if (!STRUCTURED_CHANGE_RE.test(raw) && !(/无状态变化/.test(raw) && /因果\s*[:：]\s*\S{4,}/.test(raw))) {
    return { prose: raw, changeBlocks: [] }
  }

  const lines = raw.split(/\r?\n/)
  const keep = new Array<boolean>(lines.length).fill(true)
  const changeBlocks: string[] = []
  let i = 0
  while (i < lines.length) {
    if (!looksLikeChangeEntryStart(lines[i]!)) {
      i += 1
      continue
    }
    let j = i
    let lastNonEmpty = i
    while (j < lines.length && isChangeRecordMetaLine(lines[j]!)) {
      if (lines[j]!.trim()) lastNonEmpty = j
      j += 1
    }
    const chunk = lines.slice(i, lastNonEmpty + 1).join('\n')
    if (isStructuredChangeRecordBlock(chunk) || isStructuredChangeRecordBlock(ensureChangeRecordHeader(chunk))) {
      changeBlocks.push(ensureChangeRecordHeader(chunk))
      for (let k = i; k <= lastNonEmpty; k++) keep[k] = false
      i = lastNonEmpty + 1
      continue
    }
    i += 1
  }

  if (!changeBlocks.length) return { prose: raw, changeBlocks: [] }

  const out: string[] = []
  for (let k = 0; k < lines.length; k++) {
    if (keep[k]) out.push(lines[k]!)
  }
  return {
    prose: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    changeBlocks,
  }
}

/**
 * 纠正模型把【变更记录】插进正文中间、加粗标题、或省略标题只留条目的情况：
 * - 结构化块 → 元数据（取最后一块）；块后散文回收正文
 * - 散文冒充 → 去标题，回收正文
 */
export function normalizeChangeRecordArtifacts(fullText: string): {
  prose: string
  changeBlock: string | null
  reclaimedFakeBlocks: number
} {
  const trimmed = canonicalizeChangeRecordHeaders(fullText || '').trim()
  if (!trimmed) return { prose: '', changeBlock: null, reclaimedFakeBlocks: 0 }

  const proseParts: string[] = []
  let structured: string | null = null
  let reclaimedFakeBlocks = 0

  if (CHANGE_RECORD_RE.test(trimmed)) {
    const parts = trimmed.split(CHANGE_RECORD_SPLIT_RE)
    for (const part of parts) {
      const t = part.trim()
      if (!t) continue
      if (!CHANGE_RECORD_RE.test(t)) {
        proseParts.push(t)
        continue
      }
      if (isStructuredChangeRecordBlock(t)) {
        const { changeBlock, trailingProse } = splitStructuredBlockAndTrailingProse(t)
        if (structured) {
          proseParts.push(stripChangeRecordHeader(structured))
          reclaimedFakeBlocks += 1
        }
        structured = changeBlock
        if (trailingProse) {
          proseParts.push(trailingProse)
          reclaimedFakeBlocks += 1
        }
      } else {
        const body = stripChangeRecordHeader(t)
        if (body) proseParts.push(body)
        reclaimedFakeBlocks += 1
      }
    }
  } else {
    proseParts.push(trimmed)
  }

  let prose = proseParts.join('\n\n').trim()
  const peeled = peelOrphanedStructuredFromProse(prose)
  if (peeled.changeBlocks.length) {
    prose = peeled.prose
    reclaimedFakeBlocks += peeled.changeBlocks.length
    // 已有带标题的结构化块时仍剥离正文中的孤儿条目；元数据优先保留已识别块，否则取最后一块孤儿
    if (!structured) {
      structured = peeled.changeBlocks[peeled.changeBlocks.length - 1]!
    }
  }

  return {
    prose,
    changeBlock: structured,
    reclaimedFakeBlocks,
  }
}

/** 落库 / 审校共用：始终走 normalize（含加粗标题 / 无标题条目 / 夹心散文） */
export function splitProseAndChangeRecord(fullText: string): {
  prose: string
  changeBlock: string | null
} {
  const { prose, changeBlock } = normalizeChangeRecordArtifacts(fullText)
  return { prose, changeBlock }
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
