import fs from 'fs'
import path from 'path'
import { findEpisodeByDramaAndNumber } from '../../../db/repos/episodes/index.js'
import {
  ensureAnchor,
  readAnchor,
  stripLeadingAnchorEcho,
  updateAnchorFromSummary,
  writeAnchor,
  DEFAULT_ANCHOR,
} from './novel-anchor.js'
import type { TextBillingContext } from '../../ai/ai.js'
import { causalChainTemplate } from '../novel-causal-chain/causal-chain-template.js'
import {
  characterSheetsTemplate,
  plotLedgerTemplate,
  worldBibleTemplate,
} from './novel-memory-templates.js'
import {
  extractActivePlots,
  extractCharStates,
  extractGlobalSnapshot,
  extractLockedFacts,
  extractOutlineVolumeSeed,
  extractOutlineWorldSeed,
  extractWorldRules,
  resolveVolumeForChapter,
  splitChapterProseAndMeta,
  type ChapterEndMeta,
} from './novel-memory-parser.js'
import { novelMemoryInitialized, novelMemoryPaths } from './novel-memory-paths.js'

export type { ChapterEndMeta } from './novel-memory-parser.js'

export class NovelMemoryManager {
  readonly dramaId: number
  readonly paths: ReturnType<typeof novelMemoryPaths>

  constructor(dramaId: number) {
    this.dramaId = dramaId
    this.paths = novelMemoryPaths(dramaId)
  }

  static exists(dramaId: number): boolean {
    return novelMemoryInitialized(dramaId)
  }

  readWorld(): string {
    return this.read(this.paths.world)
  }

  readChars(): string {
    return this.read(this.paths.chars)
  }

  readPlot(): string {
    return this.read(this.paths.plot)
  }

  writeWorld(content: string) {
    this.write(this.paths.world, content)
  }

  writeChars(content: string) {
    this.write(this.paths.chars, content)
  }

  writePlot(content: string) {
    this.write(this.paths.plot, content)
  }

  init(seed?: { outline?: string; premise?: string; title?: string }) {
    fs.mkdirSync(this.paths.root, { recursive: true })
    fs.mkdirSync(this.paths.chapters, { recursive: true })
    for (let i = 1; i <= 10; i++) {
      fs.mkdirSync(this.paths.volDir(i), { recursive: true })
    }

    if (!fs.existsSync(this.paths.world)) {
      let world = worldBibleTemplate()
      if (seed?.outline) {
        const worldSeed = extractOutlineWorldSeed(seed.outline)
        if (worldSeed) {
          world = world.replace('## 力量体系\n-', worldSeed)
        }
        if (seed.premise?.trim()) {
          world += `\n\n<!-- 创意梗概 -->\n${seed.premise.trim().slice(0, 800)}\n`
        }
      }
      this.writeWorld(world)
    }
    if (!fs.existsSync(this.paths.chars)) {
      let chars = characterSheetsTemplate()
      if (seed?.title) chars = chars.replace('主角名', seed.title.slice(0, 8))
      this.writeChars(chars)
    }
    if (!fs.existsSync(this.paths.plot)) {
      let plot = plotLedgerTemplate()
      const volSeed = seed?.outline ? extractOutlineVolumeSeed(seed.outline) : ''
      if (volSeed) {
        plot = plot.replace('## 第一卷：（第-章）', `## 分卷规划（来自大纲）\n${volSeed}\n\n## 第一卷：（第-章）`)
      }
      this.writePlot(plot)
    }
    if (!fs.existsSync(this.paths.anchor)) {
      writeAnchor(this.dramaId, DEFAULT_ANCHOR)
    }
    if (!fs.existsSync(this.paths.causalChain)) {
      fs.writeFileSync(this.paths.causalChain, causalChainTemplate(0), 'utf-8')
    }
    return { root: this.paths.root, initialized: true }
  }

  async buildChapterPrompt(args: {
    vol: number
    chapter: number
    title?: string
    brief?: string
    outline?: string
  }): Promise<string> {
    const { vol, chapter, title, brief } = args
    const world = this.readWorld()
    const chars = this.readChars()
    const plot = this.readPlot()

    const worldRules = extractWorldRules(world)
    const lockedFacts = extractLockedFacts(world, chapter)
    const snapshot = extractGlobalSnapshot(world)
    const charStates = extractCharStates(chars)
    const activePlots = extractActivePlots(plot, true)
    const prevSummaries = await this.getPrevSummaries(vol, chapter, 3)

    return [
      '【角色】你是资深网文作家，擅长长篇玄幻/仙侠小说创作。',
      '',
      `【当前任务】创作第${vol}卷第${chapter}章${title ? `，标题：${title}` : ''}`,
      '',
      '【铁律】以下三条不可违反，违反则重写：',
      '1. 状态冻结：人物状态以「人物档案」最新记录为准，不可回溯、不可跳跃',
      '2. 因果单向：已发生事件不可改写，发现冲突时修改正文适配事实，不可修改事实',
      '3. 伏笔显式：涉及活跃伏笔时，正文标注[V-XXX]；埋设新伏笔时，章末标注[NEW:内容,预计回收卷章]',
      '',
      '【注入数据】',
      '=== 世界设定（相关部分）===',
      worldRules,
      '',
      '=== 锁定事实（本章之前）===',
      lockedFacts,
      '',
      snapshot ? `=== 全局状态快照 ===\n${snapshot}\n` : '',
      '=== 出场人物最新状态 ===',
      charStates,
      '',
      '=== 活跃伏笔（本章必须校验）===',
      activePlots,
      '',
      '=== 前情摘要（最近3章）===',
      prevSummaries,
      '',
      '=== 本章Brief ===',
      brief?.trim() || '[请填写：场景、冲突、目标、必须出现的元素]',
      '',
      '【输出要求】',
      '1. 正文须写满目标字数区间，节奏紧凑',
      '2. 章末必须附四段元数据（格式见系统提示）',
    ].join('\n')
  }

  async buildInjectBlock(args: { vol: number; chapter: number; brief?: string; causalMode?: boolean }): Promise<string> {
    const { vol, chapter, brief, causalMode } = args
    const world = this.readWorld()
    const chars = this.readChars()
    const plot = this.readPlot()

    const ironRule = causalMode
      ? '【三层长记忆 — 铁律：因果单向 / 变更须附因果链 / 伏笔显式 [V-XXX]】'
      : '【三层长记忆 — 铁律：状态冻结 / 因果单向 / 伏笔显式 [V-XXX]】'

    const parts = [
      ironRule,
      `=== 世界设定 ===\n${extractWorldRules(world, 1600)}`,
      `=== 锁定事实（第${chapter}章之前）===\n${extractLockedFacts(world, chapter)}`,
      extractGlobalSnapshot(world, 800) ? `=== 全局状态 ===\n${extractGlobalSnapshot(world, 800)}` : '',
      `=== 人物最新状态 ===\n${extractCharStates(chars, 10)}`,
      `=== 活跃伏笔（须校验 ✓）===\n${extractActivePlots(plot, true)}`,
      `=== 前情摘要（最近3章）===\n${await this.getPrevSummaries(vol, chapter, 3)}`,
      brief?.trim() ? `=== 本章Brief ===\n${brief.trim()}` : '',
    ].filter(Boolean)
    return parts.join('\n\n')
  }

  /** 前情摘要：从 episodes 磁盘正文（content_blob_path）读取，与编辑器同源 */
  async getPrevSummaries(_vol: number, chapter: number, count = 3): Promise<string> {
    const summaries: string[] = []
    for (let i = Math.max(1, chapter - count); i < chapter; i++) {
      const ep = await findEpisodeByDramaAndNumber(this.dramaId, i)
      const content = ep?.content?.trim()
      if (!content) continue
      const { meta } = splitChapterProseAndMeta(content)
      const summary = meta?.summary
        || content.match(/【本章事件摘要】[^\n]*\n([^\n【]+)/)?.[1]?.trim()
      if (summary) summaries.push(`第${i}章：${summary}`)
    }
    return summaries.length ? summaries.join('\n') : '（无前情摘要，请严格对齐锁定事实与上章正文）'
  }

  applyChapterEnd(args: {
    vol: number
    chapter: number
    fullContent: string
  }): { prose: string; meta: ChapterEndMeta | null; updated: boolean } {
    const { vol, chapter, fullContent } = args
    const { prose, meta } = splitChapterProseAndMeta(fullContent)

    if (!meta?.summary && !meta?.stateChanges.length) {
      return { prose, meta, updated: false }
    }

    if (meta.summary) {
      this.appendLockedFact(chapter, meta.summary, '见本章事件摘要')
    }
    for (const change of meta.stateChanges) {
      this.appendCharTimelineRow(vol, chapter, change)
    }
    for (const fsRow of meta.foreshadowing) {
      this.applyForeshadowingRow(fsRow, vol, chapter)
    }

    return { prose, meta, updated: true }
  }

  async review(vol: number, lastChapter: number): Promise<string[]> {
    const issues: string[] = []
    const world = this.readWorld()

    for (let ch = 1; ch <= lastChapter; ch++) {
      const ep = await findEpisodeByDramaAndNumber(this.dramaId, ch)
      const hasBody = !!(ep?.contentBlobPath?.trim() || ep?.content?.trim())
      if (!hasBody) {
        issues.push(`第${vol}卷第${ch}章：缺少正文（episodes.content_blob_path）`)
      }
    }

    const locked = extractLockedFacts(world, lastChapter + 1)
    if (locked === '（暂无锁定事实）' && lastChapter >= 3) {
      issues.push('world_bible：已有章节但锁定事实表为空')
    }
    return issues
  }

  snapshot(vol: number): string {
    const chars = this.readChars()
    const plot = this.readPlot()
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ')

    const text = `# 第${vol}卷末全局快照
生成时间：${now}

## 人物终态
${extractCharStates(chars, 30)}

## 未回收伏笔
${extractActivePlots(plot, false)}

## 说明
请人工审核后更新 world_bible.md 的「全局状态快照」。
`
    const out = path.join(this.paths.root, `snapshot_vol${vol}.md`)
    fs.writeFileSync(out, text, 'utf-8')
    return out
  }

  resolveVol(chapterNumber: number, outline?: string): number {
    return resolveVolumeForChapter(outline, chapterNumber)
  }

  private appendLockedFact(chapter: number, event: string, impact: string) {
    let world = this.readWorld()
    const row = `| ${chapter} | ${event.replace(/\|/g, '｜').slice(0, 80)} | ${impact.replace(/\|/g, '｜').slice(0, 60)} |`
    if (world.includes(`| ${chapter} |`)) return

    const tableHeader = '| 章节 | 事件 | 影响 |'
    if (world.includes(tableHeader)) {
      const idx = world.indexOf(tableHeader)
      const afterHeader = world.indexOf('\n', idx)
      const insertAt = world.indexOf('\n', afterHeader + 1) + 1
      world = `${world.slice(0, insertAt)}${row}\n${world.slice(insertAt)}`
    } else {
      world += `\n${tableHeader}\n|------|------|------|\n${row}\n`
    }
    this.writeWorld(world)
  }

  private appendCharTimelineRow(vol: number, chapter: number, change: string) {
    const m = change.match(/^([^/／]+)[/／]([^/／]+)[/／：:]\s*(.+)$/)
    if (!m) return
    const [, charName, stateItem, value] = m
    let chars = this.readChars()
    const row = `| ${vol} | ${chapter} | ${stateItem.trim()} | ${value.trim().slice(0, 80)} | 第${chapter}章 |`

    const header = `## ${charName.trim()}`
    if (!chars.includes(header)) {
      chars += `\n\n${header}\n\n### 时序状态\n| 卷 | 章 | 状态项 | 当前值 | 触发事件 |\n|----|-----|--------|--------|----------|\n${row}\n`
    } else {
      const idx = chars.indexOf(header)
      const timelineIdx = chars.indexOf('### 时序状态', idx)
      if (timelineIdx >= 0) {
        const lineEnd = chars.indexOf('\n', chars.indexOf('\n', timelineIdx + 1) + 1) + 1
        chars = `${chars.slice(0, lineEnd)}${row}\n${chars.slice(lineEnd)}`
      }
    }
    this.writeChars(chars)
  }

  private applyForeshadowingRow(row: string, vol: number, chapter: number) {
    const newM = row.match(/\[NEW:\s*([^,]+),\s*([^\]]+)\]/i)
    if (newM) {
      this.appendActivePlot({
        id: this.nextPlotId(),
        buried: `${vol}-${chapter}`,
        content: newM[1].trim(),
        type: '新伏笔',
        recover: newM[2].trim(),
        status: '新埋设',
        validate: true,
      })
      return
    }
    const vM = row.match(/\[(V-\d+)\]/i)
    if (vM) this.touchPlot(vM[1].toUpperCase(), `${vol}-${chapter}`)
  }

  private nextPlotId(): string {
    const plot = this.readPlot()
    const ids = [...plot.matchAll(/V-(\d+)/g)].map(m => Number(m[1]))
    const next = ids.length ? Math.max(...ids) + 1 : 1
    return `V-${String(next).padStart(3, '0')}`
  }

  private appendActivePlot(args: {
    id: string
    buried: string
    content: string
    type: string
    recover: string
    status: string
    validate: boolean
  }) {
    let plot = this.readPlot()
    const row = `| ${args.id} | ${args.buried} | ${args.content.slice(0, 60)} | ${args.type} | ${args.recover} | ${args.status} | ${args.validate ? '✓' : ''} |`
    const header = '| ID | 埋设卷章 | 内容 | 类型 | 预计回收 | 当前状态 | 本章需校验 |'
    if (plot.includes(header)) {
      const idx = plot.indexOf(header)
      const insertAt = plot.indexOf('\n', plot.indexOf('\n', idx + 1) + 1) + 1
      plot = `${plot.slice(0, insertAt)}${row}\n${plot.slice(insertAt)}`
    }
    this.writePlot(plot)
  }

  private touchPlot(id: string, ref: string) {
    let plot = this.readPlot()
    plot = plot.replace(
      new RegExp(`(\\|\\s*${id}\\s*\\|[^\\n]+)`, 'i'),
      (line) => (line.includes('✓') ? line : `${line.trimEnd().replace(/\|\s*$/, '')} | 已推进@${ref} ✓ |`),
    )
    this.writePlot(plot)
  }

  private read(filePath: string): string {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : ''
  }

  private write(filePath: string, content: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
  }
}

export function ensureNovelMemory(dramaId: number, seed?: { outline?: string; premise?: string; title?: string }) {
  const mgr = new NovelMemoryManager(dramaId)
  if (!NovelMemoryManager.exists(dramaId)) mgr.init(seed)
  return mgr
}

export async function applyNovelMemoryFromChapter(args: {
  dramaId: number
  chapterNumber: number
  content: string
  meta: { outline?: string; long_memory_enabled?: boolean; anchor_echo_enabled?: boolean }
  billing?: TextBillingContext
}): Promise<string> {
  let working = args.content
  const anchorLine = await ensureAnchor(args.dramaId, args.chapterNumber)

  if (args.meta.anchor_echo_enabled !== false) {
    working = stripLeadingAnchorEcho(working, anchorLine)
  }

  let chapterMeta: ChapterEndMeta | null = null
  if (args.meta.long_memory_enabled !== false) {
    const mgr = ensureNovelMemory(args.dramaId, { outline: args.meta.outline })
    const vol = mgr.resolveVol(args.chapterNumber, args.meta.outline)
    const applied = mgr.applyChapterEnd({
      vol,
      chapter: args.chapterNumber,
      fullContent: working,
    })
    working = applied.prose.trim() || working
    chapterMeta = applied.meta
  } else {
    chapterMeta = splitChapterProseAndMeta(working).meta
    working = splitChapterProseAndMeta(working).prose || working
  }

  const summary = chapterMeta?.summary?.trim()
  if (args.meta.anchor_echo_enabled !== false && summary) {
    await updateAnchorFromSummary({
      dramaId: args.dramaId,
      oldAnchor: readAnchor(args.dramaId) || anchorLine,
      summary,
      chapterNumber: args.chapterNumber,
      billing: args.billing
        ? { ...args.billing, reason: 'anchor.txt 更新' }
        : undefined,
    })
  }

  return working
}

export const NOVEL_MEMORY_CHAPTER_END_FORMAT = `
【章末必须输出 — 正文之后空一行写 --- 再写以下四段】
---
【本章事件摘要】（50字内）
【状态变更清单】
- 角色/状态项/值：…
【伏笔记录】
- [V-XXX] … 或 [NEW: …, 预计回收]
【一致性自检】
- [✓] …
`.trim()
