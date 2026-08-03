/**
 * 一行锚点 anchor.txt + 回声规则 — 对抗 LLM 中段遗忘约束
 *
 * 第2章起禁止使用「时间:故事开端」默认锚点——会强制模型按日循环重开。
 */
import fs from 'fs'
import { chatCompletionTextAudit, type TextBillingContext } from '../../ai/ai.js'
import { novelMemoryPaths } from './novel-memory-paths.js'
import { loadPrevChapterContentTail } from '../novel-continuity.js'

/** 仅第1章可用的默认锚点 */
export const DEFAULT_ANCHOR = '场景:待定 | 时间:故事开端 | 人物:主角 | 禁令:不起名,不转场,不跳时间'

const STORY_START_MARK = /时间\s*[:：]\s*故事开端/

export function isStaleStoryStartAnchor(line: string): boolean {
  return !line.trim() || STORY_START_MARK.test(line) || line.trim() === DEFAULT_ANCHOR
}

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

  // 第2章起：若仍是第1章默认「故事开端」，必须按上章末重写
  if (chapterNumber >= 2 && isStaleStoryStartAnchor(line)) {
    const tail = await loadPrevChapterContentTail(dramaId, chapterNumber, 600)
    line = inferAnchorFromPrevTail(tail)
    writeAnchor(dramaId, line)
    return line
  }

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
  if (!tail.trim()) {
    return '场景:紧接上章末 | 时间:紧接上章已发生事实之后 | 人物:见上章末 | 禁令:不回放上章高潮,不开篇早于上章末'
  }
  const snippet = tail.replace(/\s+/g, ' ').slice(-200)
  return `场景:紧接上章末 | 时间:紧接上章已发生事实之后 | 人物:见上章末 | 禁令:不回放上章高潮,不开篇早于上章末（上章末：${snippet.slice(0, 80)}…）`
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
  let a = anchor.trim()
  if (chapter >= 2 && isStaleStoryStartAnchor(a)) {
    a = '场景:紧接上章末 | 时间:紧接上章已发生事实之后 | 人物:见上章末 | 禁令:不回放上章高潮,不开篇早于上章末'
  }
  if (!a) {
    a = chapter >= 2
      ? '场景:紧接上章末 | 时间:紧接上章已发生事实之后 | 人物:见上章末 | 禁令:不回放上章高潮,不开篇早于上章末'
      : DEFAULT_ANCHOR
  }

  // 第2章起：锚点只作约束，禁止抄「故事开端」进正文
  if (chapter >= 2) {
    return [
      '═══════════════════════════════════════',
      `【第${vol}卷第${chapter}章 — 章缝锚点（最高优先级）】`,
      a,
      '',
      `写正文 ${minLen}～${maxLen} 字。`,
      '**硬性**：开篇时空必须紧接上章末已发生事实之后；禁止把锚点行抄进读者正文；禁止日循环式重开（清晨离家等上章已越过的节点）。',
      '章末可另附【本章事件摘要】（50字内）。',
      '═══════════════════════════════════════',
    ].join('\n')
  }

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
  const out = text.trim()
  const anchorLine = anchor.trim().split('\n')[0]?.trim()
  const lines = out.split('\n')
  let i = 0
  while (i < lines.length) {
    const t = lines[i]?.trim() || ''
    if (!t) {
      i++
      continue
    }
    const isAnchor = (anchorLine && t === anchorLine)
      || (/^场景\s*[:：].+\|/.test(t) && /禁令\s*[:：]/.test(t))
      || STORY_START_MARK.test(t)
    if (!isAnchor) break
    i++
  }
  if (i > 0) return lines.slice(i).join('\n').trimStart()
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
只改摘要中明确变化了的字段；未变的字段保持原样。
第2章起时间字段禁止写成「故事开端」；应写成「紧接上章…」或具体已推进的时间。
禁令默认保留「不回放上章高潮,不开篇早于上章末」除非摘要表明已解除。
只输出一行，不要解释。`

  const user = [
    `【旧锚点】\n${oldAnchor}`,
    `【第 ${chapterNumber} 章摘要】\n${trimmed}`,
    '【输出】新的一行 anchor：',
  ].join('\n\n')

  try {
    const raw = await chatCompletionTextAudit(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { maxTokens: 256, temperature: 0.2, billing },
    )
    const line = (raw || '').trim().split('\n')[0]?.trim() || ''
    if (line.includes('场景') && line.includes('|')) {
      const safe = chapterNumber >= 2 && isStaleStoryStartAnchor(line)
        ? inferAnchorFromPrevTail('')
        : line
      writeAnchor(dramaId, safe)
      return safe
    }
  } catch {
    /* keep old */
  }
  return oldAnchor
}
