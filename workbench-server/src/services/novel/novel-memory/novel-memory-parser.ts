/** 解析长记忆 Markdown 与章末结构化输出 */

export type ChapterEndMeta = {
  summary: string
  stateChanges: string[]
  foreshadowing: string[]
  selfCheck: string[]
  prose: string
}

const CHAPTER_END_MARKER = /^---\s*\n\n【本章事件摘要】/m

export function splitChapterProseAndMeta(fullText: string): { prose: string; meta: ChapterEndMeta | null } {
  const trimmed = fullText.trim()
  const match = trimmed.match(CHAPTER_END_MARKER)
  if (!match || match.index == null) {
    return { prose: trimmed, meta: null }
  }
  const prose = trimmed.slice(0, match.index).trim()
  const tail = trimmed.slice(match.index)
  return { prose, meta: parseChapterEndBlock(tail) }
}

export function parseChapterEndBlock(block: string): ChapterEndMeta | null {
  const summary = extractSectionLine(block, '【本章事件摘要】')
  if (!summary && !block.includes('【状态变更清单】')) return null

  return {
    summary: summary || '',
    stateChanges: extractBulletSection(block, '【状态变更清单】'),
    foreshadowing: extractBulletSection(block, '【伏笔记录】'),
    selfCheck: extractBulletSection(block, '【一致性自检】'),
    prose: '',
  }
}

function extractSectionLine(text: string, header: string): string {
  const re = new RegExp(`${escapeRe(header)}\\s*（[^）]*）?\\s*\\n([^【]+)`, 'i')
  const m = text.match(re)
  return m?.[1]?.trim().split('\n')[0]?.trim() || ''
}

function extractBulletSection(text: string, header: string): string[] {
  const re = new RegExp(`${escapeRe(header)}[\\s\\S]*?(?=\\n【|$)`, 'i')
  const m = text.match(re)
  if (!m) return []
  const body = m[0].replace(new RegExp(`^${escapeRe(header)}`, 'i'), '').trim()
  return body.split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 从 world_bible 提取世界设定（# 世界设定 到 # 当前卷） */
export function extractWorldRules(content: string, maxChars = 2000): string {
  const match = content.match(/#\s*世界设定[\s\S]*?(?=\n---|\n#\s*当前卷|\n#\s*全局状态|\Z)/i)
  const section = match?.[0]?.trim() || ''
  if (!section) return '（请补充 world_bible.md 世界设定）'
  return section.length <= maxChars ? section : `${section.slice(0, maxChars)}…`
}

/** 锁定事实：表格中章节号 < beforeChapter */
export function extractLockedFacts(content: string, beforeChapter: number): string {
  const lines: string[] = []
  let inTable = false
  for (const line of content.split('\n')) {
    if (/^\|\s*章节\s*\|/.test(line)) {
      inTable = true
      lines.push(line)
      continue
    }
    if (inTable && line.startsWith('|')) {
      if (/^\|\s*-/.test(line)) {
        lines.push(line)
        continue
      }
      const parts = line.split('|').map(p => p.trim())
      const chStr = parts[1] || ''
      const ch = parseInt(chStr, 10)
      if (Number.isFinite(ch) && ch < beforeChapter) lines.push(line)
      continue
    }
    if (inTable && !line.startsWith('|')) inTable = false
  }
  return lines.length > 1 ? lines.join('\n') : '（暂无锁定事实）'
}

/** 全局状态快照块 */
export function extractGlobalSnapshot(content: string, maxChars = 1200): string {
  const match = content.match(/#\s*全局状态快照[\s\S]*/i)
  const section = match?.[0]?.trim() || ''
  if (!section) return ''
  return section.length <= maxChars ? section : `${section.slice(0, maxChars)}…`
}

/** 人物最新时序状态（每人物取最后若干条） */
export function extractCharStates(content: string, maxRows = 12): string {
  const rows: string[] = []
  let currentChar = ''
  for (const line of content.split('\n')) {
    if (/^##\s+/.test(line) && line.includes('（')) {
      currentChar = line.replace(/^##\s+/, '').split('（')[0].trim()
      rows.push(`\n### ${currentChar}`)
      continue
    }
    if (currentChar && line.startsWith('|') && /\|\s*\d+\s*\|/.test(line) && !/^\|\s*卷\s*\|/.test(line)) {
      rows.push(line)
    }
  }
  const flat = rows.join('\n').trim()
  if (!flat) return '（请补充 character_sheets.md）'
  const lines = flat.split('\n')
  return lines.length <= maxRows + 3 ? flat : [...lines.slice(0, 3), ...lines.slice(-maxRows)].join('\n')
}

/** 活跃伏笔：本章需校验 ✓ */
export function extractActivePlots(content: string, mustValidateOnly = true): string {
  const lines: string[] = []
  let inActive = false
  for (const line of content.split('\n')) {
    if (/##\s*活跃伏笔/.test(line)) {
      inActive = true
      lines.push(line)
      continue
    }
    if (inActive && /^##\s/.test(line) && !/活跃伏笔/.test(line)) break
    if (inActive && line.startsWith('|') && line.includes('V-')) {
      if (!mustValidateOnly || line.includes('✓')) lines.push(line)
    }
  }
  return lines.length > 1 ? lines.join('\n') : '（本章无必须校验的活跃伏笔）'
}

/** 从 outline 解析卷号：第一卷（第1～30章） */
export function resolveVolumeForChapter(outline: string | undefined, chapterNumber: number): number {
  if (!outline?.trim()) return 1
  const volRe = /第\s*([一二三四五六七八九十\d]+)\s*卷[^（\n]*[（(]\s*第\s*(\d+)\s*[～~\-—]\s*(\d+)\s*章/gi
  let m: RegExpExecArray | null
  const ranges: { vol: number; start: number; end: number }[] = []
  while ((m = volRe.exec(outline)) !== null) {
    const volNum = parseInt(m[1], 10) || chineseVolToNum(m[1]) || ranges.length + 1
    ranges.push({ vol: volNum, start: Number(m[2]), end: Number(m[3]) })
  }
  for (const r of ranges) {
    if (chapterNumber >= r.start && chapterNumber <= r.end) return r.vol
  }
  return 1
}

function chineseVolToNum(s: string): number | null {
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  return map[s.trim()] ?? null
}

/** 从 outline 截取世界观块写入 world_bible 种子 */
export function extractOutlineWorldSeed(outline: string): string {
  const start = outline.indexOf('【世界观设定】')
  if (start < 0) return ''
  const rest = outline.slice(start)
  const end = rest.search(/\n【(?:总纲|主要人物|分卷)/)
  const section = (end > 0 ? rest.slice(0, end) : rest).trim()
  if (!section) return ''
  return `## 力量体系 / 世界观（来自全书大纲）\n${section.replace(/^【世界观设定】\n?/, '')}`
}

export function extractOutlineVolumeSeed(outline: string): string {
  const start = outline.indexOf('【分卷设计】')
  if (start < 0) return ''
  const rest = outline.slice(start)
  const end = rest.search(/\n【分章/)
  return (end > 0 ? rest.slice(0, end) : rest).trim()
}
