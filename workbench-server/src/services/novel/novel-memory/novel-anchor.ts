/**
 * 一行锚点 anchor.txt + 回声规则 — 对抗 LLM 中段遗忘约束
 */
import fs from 'fs'
import { chatCompletionText, type TextBillingContext } from '../../ai/ai.js'
import { novelMemoryPaths } from './novel-memory-paths.js'
import { loadPrevChapterContentTail } from '../novel-continuity.js'

export const DEFAULT_ANCHOR = '场景:待定 | 时间:故事开端 | 人物:主角 | 禁令:不起名,不转场,不跳时间'

export function readAnchor(dramaId: number): string {
  const p = novelMemoryPaths(dramaId).anchor
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf-8').trim().split('\n')[0]?.trim() || ''
}

export function writeAnchor(dramaId: number, line: string) {
  const p = novelMemoryPaths(dramaId).anchor
  fs.mkdirSync(novelMemoryPaths(dramaId).root, { recursive: true })
  fs.writeFileSync(p, `${line.trim()}\n`, 'utf-8')
}

export async function ensureAnchor(dramaId: number, chapterNumber: number): Promise<string> {
  let line = readAnchor(dramaId)
  if (line) return line

  if (chapterNumber >= 2) {
    const tail = await loadPrevChapterContentTail(dramaId, chapterNumber, 600)
    line = inferAnchorFromPrevTail(tail)
  } else {
    line = DEFAULT_ANCHOR
  }
  writeAnchor(dramaId, line)
  return line
}

function inferAnchorFromPrevTail(tail: string): string {
  if (!tail.trim()) return DEFAULT_ANCHOR
  const snippet = tail.replace(/\s+/g, ' ').slice(-200)
  return `场景:紧接上章末 | 时间:紧接上章 | 人物:见上章末 | 禁令:不起名,不转场,不跳时间（上章末：${snippet.slice(0, 80)}…）`
}

/** 写作 user prompt 末尾注入：锚点 + 回声规则（近因效应） */
export function buildAnchorEchoPromptBlock(args: {
  vol: number
  chapter: number
  anchor: string
  minLen: number
  maxLen: number
}): string {
  const { vol, chapter, anchor, minLen, maxLen } = args
  const a = anchor.trim() || DEFAULT_ANCHOR

  return [
    '═══════════════════════════════════════',
    `【第${vol}卷第${chapter}章 — 锚点回声写作（最高优先级，覆盖其他参考性说明）】`,
    '',
    '第一步：**把下面这行锚点原样抄到你回答的最第一行**（独占一行，后空一行再写正文）：',
    a,
    '',
    `第二步：写正文，${minLen}～${maxLen} 字。`,
    '',
    '第三步（唯一硬规则 — 改变锚点前必须先回声）：',
    '若要改变**场景、时间、或让人物报名字/新身份**，必须先**原样重复**锚点中对应字段（如「时间:…」「人物:…」），紧接一行再写变化。',
    '',
    '正确：时间:雨停次日白天。太阳西沉，暮色四合，入了夜。',
    '正确：人物:2个未命名的人逼近。高个子沉声道："在下王虎。"',
    '错误：直接写「入夜后…」而未先写「时间:雨停次日白天」',
    '错误：直接写「王虎冷笑道」而未先写「人物:2个未命名的人逼近」',
    '',
    '第四步：章末 --- 后写【本章事件摘要】（50字内，供更新 anchor.txt）。',
    '',
    '开始写。',
    '═══════════════════════════════════════',
  ].join('\n')
}

/** 去掉模型可能在开头复读的锚点行 */
export function stripLeadingAnchorEcho(text: string, anchor: string): string {
  let out = text.trim()
  const anchorLine = anchor.trim().split('\n')[0]?.trim()
  if (!anchorLine) return out

  const lines = out.split('\n')
  if (lines[0]?.trim() === anchorLine) {
    return lines.slice(1).join('\n').trimStart()
  }
  if (/^场景:.+\|/.test(lines[0]?.trim() || '') && lines[0]!.includes('禁令:')) {
    return lines.slice(1).join('\n').trimStart()
  }
  return out
}

/** 用章末摘要更新 anchor */
export async function updateAnchorFromSummary(args: {
  dramaId: number
  oldAnchor: string
  summary: string
  chapterNumber: number
  billing?: TextBillingContext
}): Promise<string> {
  const { dramaId, oldAnchor, summary, chapterNumber, billing } = args
  const trimmed = summary.trim()
  if (!trimmed) return oldAnchor

  const system = `你是小说 continuity 编辑。根据「旧锚点」和「本章摘要」，输出**新的一行** anchor（便利贴格式）。
格式固定：场景:… | 时间:… | 人物:… | 禁令:…
只改摘要中明确变化了的字段；未变的字段保持原样。禁令默认保留「不起名,不转场,不跳时间」除非摘要表明已解除。
只输出一行，不要解释。`

  const user = [
    `【旧锚点】\n${oldAnchor}`,
    `【第 ${chapterNumber} 章摘要】\n${trimmed}`,
    '【输出】新的一行 anchor：',
  ].join('\n\n')

  try {
    const raw = await chatCompletionText(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { maxTokens: 256, temperature: 0.2, billing },
    )
    const line = raw.trim().split('\n').find(l => l.includes('场景:') && l.includes('|')) || raw.trim()
    if (line.includes('场景:') && line.includes('|')) {
      writeAnchor(dramaId, line)
      return line
    }
  } catch {
    // keep old
  }
  return oldAnchor
}
