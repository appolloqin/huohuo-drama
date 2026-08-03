import fs from 'fs'
import { chatCompletionTextAudit, type TextBillingContext } from '../../ai/ai.js'
import { novelMemoryPaths } from '../novel-memory/novel-memory-paths.js'
import { causalChainTemplate } from './causal-chain-template.js'
import {
  extractChangeRecordFromChapter,
  splitProseAndChangeRecord,
  type CausalChangeEntry,
} from './causal-chain-parser.js'

const UPDATE_SYSTEM = `你是网文 continuity 编辑。根据本章正文与【变更记录】，重写 causal_chain.md。

要求：
- 只保留「当前状态（第N章末）」+「未闭合因果」+「环境伏笔」
- 状态须反映变更记录合并后的结果，不要历史流水账
- 未闭合因果用 - [ ] / - [x] 维护；已在本章解释的标 [x]
- 输出纯 Markdown，不要代码块，不要解释

结构：
# 当前状态（第N章末）

## 场景
## 时间
## 人物
## 进行中的动作
## 未闭合因果
## 环境伏笔`

export function readCausalChain(dramaId: number): string {
  const p = novelMemoryPaths(dramaId).causalChain
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf-8')
}

/** 从 causal_chain.md 标题解析「第N章末」 */
export function parseCausalChainAsOfChapter(md: string): number | null {
  const m = md.match(/当前状态[（(]\s*第\s*(\d+)\s*章末\s*[）)]/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
}

export type CausalOriginResolve = {
  /** 可注入的 markdown；不可用时为空 */
  markdown: string
  asOfChapter: number | null
  /** 是否与「第 chapterNumber-1 章末」对齐（或可接受的偏旧快照） */
  usable: boolean
  note?: string
}

/**
 * 第 N 章的因果起点应为「第 N-1 章末」。
 * causal_chain.md 是滚动最新快照：回写前章时若快照已远超 N-1，不得注入，以免把第100章末当成第1章末。
 */
export function resolveCausalOriginForChapter(dramaId: number, chapterNumber: number): CausalOriginResolve {
  if (chapterNumber < 2) {
    return { markdown: '', asOfChapter: null, usable: false }
  }
  const raw = ensureCausalChain(dramaId, chapterNumber).trim()
  if (!raw) {
    return {
      markdown: '',
      asOfChapter: null,
      usable: false,
      note: '（尚无因果链快照，请以上章正文为准）',
    }
  }
  const asOf = parseCausalChainAsOfChapter(raw)
  const need = chapterNumber - 1
  if (asOf == null) {
    return {
      markdown: raw,
      asOfChapter: null,
      usable: true,
      note: '（未能解析因果链章号，请同时严格对齐上章正文）',
    }
  }
  if (asOf === need) {
    return { markdown: raw, asOfChapter: asOf, usable: true }
  }
  if (asOf > need) {
    return {
      markdown: '',
      asOfChapter: asOf,
      usable: false,
      note:
        `因果链文件当前为第${asOf}章末快照，与第${chapterNumber}章所需的第${need}章末不符；` +
        `本次不以该快照为因果起点，请严格以上章正文 / 前序已写为准。`,
    }
  }
  return {
    markdown: raw,
    asOfChapter: asOf,
    usable: true,
    note: `（因果链快照仅至第${asOf}章末；第${asOf + 1}～${need}章请以上章正文补齐）`,
  }
}

export function formatCausalOriginInjectBlock(origin: CausalOriginResolve, maxChars = 2800): string {
  if (origin.usable && origin.markdown.trim()) {
    const head = origin.asOfChapter != null
      ? `【因果起点（审校对照·第${origin.asOfChapter}章末）】`
      : '【因果起点（审校对照）】'
    const body = origin.markdown.slice(0, maxChars)
    return origin.note ? `${head}\n${body}\n${origin.note}` : `${head}\n${body}`
  }
  return `【因果起点】\n${origin.note || '（无可用同进度因果快照，以上章正文为准）'}`
}

export function writeCausalChain(dramaId: number, content: string) {
  const p = novelMemoryPaths(dramaId).causalChain
  fs.mkdirSync(novelMemoryPaths(dramaId).root, { recursive: true })
  fs.writeFileSync(p, content.trim() + '\n', 'utf-8')
}

export function ensureCausalChain(dramaId: number, chapterNumber = 0): string {
  const p = novelMemoryPaths(dramaId).causalChain
  if (!fs.existsSync(p)) {
    const tpl = causalChainTemplate(chapterNumber > 0 ? chapterNumber - 1 : 0)
    writeCausalChain(dramaId, tpl)
    return tpl
  }
  return readCausalChain(dramaId)
}

export async function updateCausalChainFromChapter(args: {
  dramaId: number
  chapterNumber: number
  fullContent: string
  dramaTitle?: string
  billing?: TextBillingContext
}): Promise<{ updated: boolean; content: string; entries: CausalChangeEntry[]; skipped?: boolean }> {
  const { dramaId, chapterNumber, fullContent, dramaTitle, billing } = args
  const prev = ensureCausalChain(dramaId, chapterNumber)
  const asOf = parseCausalChainAsOfChapter(prev)
  // 回写前章时禁止用早期状态覆盖全书最新因果链
  if (asOf != null && chapterNumber < asOf) {
    return { updated: false, content: prev, entries: extractChangeRecordFromChapter(fullContent), skipped: true }
  }
  const entries = extractChangeRecordFromChapter(fullContent)
  const { prose } = splitProseAndChangeRecord(fullContent)

  if (!entries.length && chapterNumber >= 2) {
    return { updated: false, content: prev, entries }
  }

  const changeText = entries.length
    ? entries.map(e => [
      `- ${e.dimension}: ${e.change}`,
      e.causal ? `  因果: ${e.causal}` : '',
      e.trigger ? `  触发: ${e.trigger}` : '',
      e.cost ? `  代价: ${e.cost}` : '',
      e.perception ? `  感知: ${e.perception}` : '',
      e.duration ? `  耗时: ${e.duration}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')
    : '（模型从正文推断状态）'

  const user = [
    dramaTitle ? `【书名】${dramaTitle}` : '',
    `【章节】第 ${chapterNumber} 章`,
    '【上一章末 causal_chain.md】',
    prev,
    '【本章变更记录】',
    changeText,
    `【本章正文】\n${prose.slice(0, 12000)}`,
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionTextAudit(
    [{ role: 'system', content: UPDATE_SYSTEM }, { role: 'user', content: user }],
    { maxTokens: 2048, temperature: 0.2, billing },
  )

  const next = raw.trim()
  if (next.length < 80) return { updated: false, content: prev, entries }

  writeCausalChain(dramaId, next)
  return { updated: true, content: next, entries }
}
