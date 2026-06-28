import fs from 'fs'
import { chatCompletionText, type TextBillingContext } from '../../ai/ai.js'
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
}): Promise<{ updated: boolean; content: string; entries: CausalChangeEntry[] }> {
  const { dramaId, chapterNumber, fullContent, dramaTitle, billing } = args
  const prev = ensureCausalChain(dramaId, chapterNumber)
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

  const raw = await chatCompletionText(
    [{ role: 'system', content: UPDATE_SYSTEM }, { role: 'user', content: user }],
    { maxTokens: 2048, temperature: 0.2, billing },
  )

  const next = raw.trim()
  if (next.length < 80) return { updated: false, content: prev, entries }

  writeCausalChain(dramaId, next)
  return { updated: true, content: next, entries }
}
