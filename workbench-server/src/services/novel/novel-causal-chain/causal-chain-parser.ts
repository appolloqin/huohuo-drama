/** 解析章末【变更记录】与 causal_chain.md */

export type CausalChangeEntry = {
  dimension: string
  change: string
  causal: string
  trigger?: string
  cost?: string
  perception?: string
  duration?: string
  raw: string
}

const CHANGE_RECORD_RE = /^【变更记录】/m

export function splitProseAndChangeRecord(fullText: string): {
  prose: string
  changeBlock: string | null
} {
  const trimmed = fullText.trim()
  const idx = trimmed.search(CHANGE_RECORD_RE)
  if (idx < 0) return { prose: trimmed, changeBlock: null }
  return {
    prose: trimmed.slice(0, idx).trim(),
    changeBlock: trimmed.slice(idx).trim(),
  }
}

export function parseChangeRecord(block: string): CausalChangeEntry[] {
  if (!block?.trim()) return []
  const lines = block.split('\n')
  const entries: CausalChangeEntry[] = []
  let current: Partial<CausalChangeEntry> | null = null
  const flush = () => {
    if (current?.dimension && current.change != null) {
      entries.push({
        dimension: current.dimension,
        change: current.change,
        causal: current.causal?.trim() || '',
        trigger: current.trigger?.trim(),
        cost: current.cost?.trim(),
        perception: current.perception?.trim(),
        duration: current.duration?.trim(),
        raw: current.raw || '',
      })
    }
    current = null
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t || t === '【变更记录】') continue
    const top = t.match(/^[-*]\s*([^:：]+)\s*[:：]\s*(.+)$/)
    if (top) {
      flush()
      current = {
        dimension: top[1]!.trim(),
        change: top[2]!.trim(),
        raw: t,
      }
      continue
    }
    if (!current) continue
    const sub = t.match(/^(因果|触发|代价|感知|耗时)\s*[:：]\s*(.+)$/i)
    if (sub) {
      const key = sub[1]!.toLowerCase()
      const val = sub[2]!.trim()
      if (key === '因果') current.causal = val
      else if (key === '触发') current.trigger = val
      else if (key === '代价') current.cost = val
      else if (key === '感知') current.perception = val
      else if (key === '耗时') current.duration = val
      current.raw = `${current.raw || ''}\n${t}`
    }
  }
  flush()
  return entries
}

export function extractChangeRecordFromChapter(fullText: string): CausalChangeEntry[] {
  const { changeBlock } = splitProseAndChangeRecord(fullText)
  if (!changeBlock) return []
  return parseChangeRecord(changeBlock)
}

/** 落库用：分离读者正文与【变更记录】元数据 */
export function detachChangeRecordForStorage(fullText: string): {
  prose: string
  changeBlock: string | null
} {
  const { prose, changeBlock } = splitProseAndChangeRecord(fullText.trim())
  return { prose, changeBlock }
}

/** 审校/因果链更新：合并 DB 正文 + metadata 中的变更记录 */
export function resolveFullChapterForAudit(prose: string, storedChangeRecord?: string | null): string {
  const { prose: p, changeBlock } = splitProseAndChangeRecord(prose.trim())
  if (changeBlock) return `${p.trim()}\n\n${changeBlock.trim()}`
  const ext = storedChangeRecord?.trim()
  if (ext) return `${p.trim()}\n\n${ext}`
  return p.trim()
}

/** 是否声明「无状态变化」 */
export function isNoChangeDeclared(entries: CausalChangeEntry[]): boolean {
  if (!entries.length) return false
  return entries.every(e =>
    /无状态变化|未发生.*变更|延续/.test(e.change + e.causal),
  )
}
