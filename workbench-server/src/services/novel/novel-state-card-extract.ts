/**
 * 单章状态卡 LLM 抽取（一章一次；正文窗口限长防截断）
 */
import { chatCompletionTextAudit, type TextBillingContext } from '../ai/ai.js'
import {
  normalizeChapterStateCard,
  type ChapterStateCard,
} from '../../common/novel/novel-state-card.js'

/** 章首 + 章末汉字预算（合计约 6k） */
export const STATE_CARD_HEAD_CHARS = 1200
export const STATE_CARD_TAIL_CHARS = 4800

const EXTRACT_SYSTEM = `你是网文 continuity 编辑。根据「单章正文窗口」与「上一章状态卡」提取本章末状态卡。

只输出一个 JSON 对象，不要 markdown。键名固定：
timeline, place, scene, cast, last_event, open_threads, closed_beats, props, summary_line, catalyst_done

要求（短句，禁止旅程表/人物小传）：
- timeline：章内起止时辰或跨日（≤40字）
- place：章末主场地点（≤40字；只写章末落脚点，禁止全章旅程串联）
- scene：章末场合状态，如室内/门口/途中/林中（≤40字；以章末为准）
- cast：在场人物**全名**（姓+名，顿号分隔；禁止动作短语/代词/状语碎片）
- last_event：章末刚发生（一句，须能在正文中找到相近表述；可用全名，勿用「她/他」起句；勿带多余引号）
- open_threads / closed_beats：可空
- props：衣着/武器/关键物件与归属（≤50字）
- summary_line：≤40字摘要
- catalyst_done：true/false/unknown（本章大纲起因是否落地；不确定用 unknown）

须用全名；状态只进不退（除非正文有合规原因）。`

function truncChars(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if ([...t].length <= max) return t
  return [...t].slice(0, max).join('')
}

/** 组装单章正文窗口（可单测：不含多章） */
export function buildStateCardContentWindow(content: string): string {
  const prose = content.replace(/\s+/g, ' ').trim()
  if (!prose) return ''
  const chars = [...prose]
  if (chars.length <= STATE_CARD_HEAD_CHARS + STATE_CARD_TAIL_CHARS) return prose
  const head = chars.slice(0, STATE_CARD_HEAD_CHARS).join('')
  const tail = chars.slice(-STATE_CARD_TAIL_CHARS).join('')
  return `${head}\n…\n${tail}`
}

function parseCardJson(raw: string, chapterNumber: number, contentHash: string): ChapterStateCard | null {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>
    return normalizeChapterStateCard({
      ...obj,
      chapter_number: chapterNumber,
      content_hash: contentHash,
      progress: {
        catalyst_done: obj.catalyst_done,
        last_event: obj.last_event,
        open_threads: obj.open_threads,
        closed_beats: obj.closed_beats,
      },
      updated_at: new Date().toISOString(),
    }, chapterNumber)
  } catch {
    return null
  }
}

export async function extractChapterStateCard(args: {
  content: string
  chapterNumber: number
  contentHash: string
  prevCard?: ChapterStateCard | null
  outlineBeats?: string
  dramaTitle?: string
  billing?: TextBillingContext
}): Promise<ChapterStateCard | null> {
  const window = buildStateCardContentWindow(args.content)
  if ([...window].length < 40) return null

  const user = [
    args.dramaTitle ? `作品：${args.dramaTitle}` : '',
    `本章：第${args.chapterNumber}章`,
    args.prevCard
      ? `上一章状态卡：\n${JSON.stringify({
        timeline: args.prevCard.timeline,
        place: args.prevCard.place,
        scene: args.prevCard.scene,
        cast: args.prevCard.cast,
        last_event: args.prevCard.progress.last_event,
        props: args.prevCard.props,
      })}`
      : '上一章状态卡：无',
    args.outlineBeats ? `本章大纲要点：${truncChars(args.outlineBeats, 400)}` : '',
    '本章正文窗口：',
    window,
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionTextAudit(
    [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content: user }],
    { maxTokens: 1024, temperature: 0.2, billing: args.billing },
  )
  return parseCardJson(raw, args.chapterNumber, args.contentHash)
}
