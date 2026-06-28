/**
 * 小说一致性状态：每章账本存档 + 全书当前状态快照 + 生成时强制注入
 */
import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import { chatCompletionText, type TextBillingContext } from '../ai/ai.js'
import { hashNovelContent } from '../ai/ai-text-detection.js'
import { now } from '../../common/http/response.js'
import { mergeNovelMetadata, parseNovelMetadata } from '../../common/novel/novel-meta.js'
import {
  mergeEpisodeMetadata,
  readEpisodeContinuityLedger,
} from '../../common/drama/episode-meta.js'
import {
  formatContinuityStateBlock,
  ledgerToGlobal,
  normalizeContinuityFields,
  parseContinuityJsonFromModel,
  type NovelContinuityFields,
  type NovelContinuityLedger,
  type NovelGlobalContinuityState,
} from '../../common/novel/novel-continuity-state.js'
import type { NovelMetadata } from '../../common/novel/novel-meta.js'
import { ensureNovelMemory } from './novel-memory/index.js'
import { buildChapter1WorldIntroBlock } from '../../common/novel/novel-worldbuilding.js'
import {
  buildCausalOriginBlock,
  ensureCausalChain,
  isCausalChainEnabled,
} from './novel-causal-chain/index.js'
import { resolveVolumeForChapter } from './novel-memory/novel-memory-parser.js'
import {
  buildProjectCharacterRosterBlock,
  buildSerialContinuityExcerpt,
  findSiblingEpisode,
  truncText,
} from '../../common/drama/project-continuity.js'

const EXTRACT_SYSTEM = `你是网文 continuity 编辑。根据章节正文提取「章末状态账本」，供下一章写作强制对齐。

只输出一个 JSON 对象，不要 markdown、不要解释。字段均为字符串；无信息填「无」或「持平」。键名固定为：
environment, realm, resources, appearance, personality, injuries, timeline, relations, foreshadowing, actions, knowledge, abilities, emotion, reminder, delta

字段要求（须用**全名**与具体事件，禁止「某人」「对方」）：
- relations：关键人物姓名 + 与主角关系/立场（如谁推主角坠崖、谁为仇敌）
- knowledge：主角已确知的事实（含人名、地点、因果）
- actions：本章关键动作及**施动者姓名**（如「楚天绝将林萧推下断魂崖」）
- reminder：下一章**禁止改写**的人名/事件/地点（一条写清，如「推下断魂崖者是楚天绝，下章回忆不得换成他人」）
- delta：本章相对上章主要变化

其余：environment=环境场景；realm=修为境界（须与正文表述完全一致，如「淬体境圆满」或「淬体九层」，禁止混用「圆满/巅峰」与「X层」）；resources=资源道具；appearance=神态衣着；personality=人设口吻；injuries=身体伤势；timeline=时间节奏；foreshadowing=伏笔；abilities=功法能力；emotion=情绪递进。

要求：具体数字与名词；不得模糊；状态只进不退（除非正文有合规降级原因）。`

function trunc(s: string, max: number) {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

async function loadEpisodeLedger(episodeId: number, chapterNumber: number): Promise<NovelContinuityLedger | null> {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  if (!ep) return null
  return readEpisodeContinuityLedger(ep.metadata, chapterNumber)
}

async function loadPrevChapterLedger(dramaId: number, beforeChapter: number): Promise<NovelContinuityLedger | null> {
  if (beforeChapter < 1) return null
  const prevNum = beforeChapter - 1
  if (prevNum < 1) return null
  const ep = await findSiblingEpisode(dramaId, prevNum)
  if (!ep) return null
  return readEpisodeContinuityLedger(ep.metadata, ep.episodeNumber)
}

/** 为撰写第 targetChapter 章解析应注入的状态块（同步，供 prompt 构建） */
export async function resolveContinuityInjectBlock(dramaId: number, targetChapter: number): Promise<string> {
  if (targetChapter < 2) return ''

  const prevChapter = targetChapter - 1
  const drama = await dramasRepo.findDramaById(dramaId)
  const meta = parseNovelMetadata(drama?.metadata)
  const global = meta.continuity_state

  if (global?.as_of_chapter === prevChapter) {
    return formatContinuityStateBlock(global, { asOfChapter: global.as_of_chapter })
  }

  const prevLedger = await loadPrevChapterLedger(dramaId, targetChapter)
  if (prevLedger) {
    return formatContinuityStateBlock(prevLedger, { asOfChapter: prevLedger.chapter_number })
  }

  if (global && global.as_of_chapter < prevChapter) {
    return [
      formatContinuityStateBlock(global, { asOfChapter: global.as_of_chapter }),
      `（注：第 ${global.as_of_chapter + 1}～${prevChapter} 章暂无结构化账本，请同时严格对齐【上一章结尾】正文。）`,
    ].join('\n')
  }

  return ''
}

/** 撰写第 targetChapter 章时应对齐的结构化状态（供预检与审校） */
export async function resolveExpectedContinuityFields(
  dramaId: number,
  targetChapter: number,
): Promise<NovelContinuityFields | null> {
  if (targetChapter < 2) return null

  const prevChapter = targetChapter - 1
  const drama = await dramasRepo.findDramaById(dramaId)
  const meta = parseNovelMetadata(drama?.metadata)
  const global = meta.continuity_state

  if (global?.as_of_chapter === prevChapter) {
    const { as_of_chapter: _a, updated_at: _u, ...fields } = global
    return fields
  }

  const prevLedger = await loadPrevChapterLedger(dramaId, targetChapter)
  if (prevLedger) {
    const { chapter_number: _n, updated_at: _u, content_hash: _h, ...fields } = prevLedger
    return fields
  }

  if (global) {
    const { as_of_chapter: _a, updated_at: _u, ...fields } = global
    return fields
  }

  return null
}

/** 写作/审校前强制注入的锁定事实（reminder + 关键 actions/knowledge） */
export async function buildCanonLockPrefix(dramaId: number, targetChapter: number): Promise<string> {
  if (targetChapter < 2) return ''

  const fields = await resolveExpectedContinuityFields(dramaId, targetChapter)
  if (!fields) return ''

  const lines: string[] = []
  if (fields.reminder && fields.reminder !== '无' && fields.reminder !== '持平') {
    lines.push(fields.reminder)
  }
  if (fields.actions && fields.actions !== '无' && fields.actions !== '持平') {
    lines.push(`关键动作：${fields.actions}`)
  }
  if (fields.knowledge && fields.knowledge !== '无' && fields.knowledge !== '持平') {
    lines.push(`主角已知：${fields.knowledge}`)
  }
  if (fields.relations && fields.relations !== '无' && fields.relations !== '持平') {
    lines.push(`人物关系：${fields.relations}`)
  }
  if (fields.realm && fields.realm !== '无' && fields.realm !== '持平') {
    lines.push(`章初境界须为：${fields.realm}（禁止无故倒退；若上章为「圆满/巅峰」则本章不得改写成「X层」）`)
  }
  if (!lines.length) return ''

  return [
    '【前序已锁定事实 — 优先级高于本章大纲与写作说明；冲突时以前序为准，禁止换名/改事件】',
    lines.join('\n'),
  ].join('\n')
}

/** 上一章完整正文 */
export async function loadPrevChapterContent(dramaId: number, beforeChapter: number): Promise<string> {
  if (beforeChapter < 2) return ''
  const prevNum = beforeChapter - 1
  const ep = await findSiblingEpisode(dramaId, prevNum)
  if (!ep) return ''
  return (ep.scriptContent || ep.content || '').trim()
}

/** 上一章正文尾部（跨章衔接预检） */
export async function loadPrevChapterContentTail(dramaId: number, beforeChapter: number, maxChars = 2000): Promise<string> {
  const body = await loadPrevChapterContent(dramaId, beforeChapter)
  if (!body) return ''
  return body.length <= maxChars ? body : body.slice(-maxChars)
}

/** 上章开篇+结尾摘录（ cliff/起因 常在开篇，勿只注入章末） */
export async function loadPrevChapterContentAnchors(
  dramaId: number,
  beforeChapter: number,
  opts?: { headMax?: number; tailMax?: number },
): Promise<string> {
  const body = await loadPrevChapterContent(dramaId, beforeChapter)
  if (!body) return ''
  const headMax = opts?.headMax ?? 1600
  const tailMax = opts?.tailMax ?? 2200
  const parts: string[] = []
  const head = body.slice(0, Math.min(body.length, headMax))
  if (head) parts.push(`【上章开篇摘录 — 关键起因/人名勿改】\n${head}`)
  if (body.length > headMax + 400) {
    const tail = body.slice(-tailMax)
    parts.push(`【上章结尾摘录 — 须自然衔接】\n${tail}`)
  }
  return parts.join('\n\n')
}

/** 第 N 章（N≥2）写作上下文：前序已写正文 + 可选章末账本 */
export async function buildSerialWrittenContextBlock(
  dramaId: number,
  targetChapter: number,
  opts?: { skipLedger?: boolean },
): Promise<string> {
  if (targetChapter < 2) return ''

  const prevNum = targetChapter - 1
  const scale = novelContextScale(targetChapter)
  const parts: string[] = [
    opts?.skipLedger
      ? '【前序已写正文 — 吃书/人名/事件对照；境界与突破以【因果起点】【变更记录】为准，勿对照旧状态账本冻结】'
      : '【前序已写章节 — 已发生事实以此为准；本章仅结合「本章大纲」+ 此处上下文续写，勿引用全书大纲其他章未写成的人名/事件】',
  ]

  if (!opts?.skipLedger) {
    const ledger = await loadPrevChapterLedger(dramaId, targetChapter)
    if (ledger) {
      const body = formatContinuityStateBlock(ledger, {
        asOfChapter: prevNum,
        title: `【第 ${prevNum} 章末状态账本】`,
      })
      if (body) parts.push(body)
    }
  }

  const anchors = await loadPrevChapterContentAnchors(dramaId, targetChapter, {
    headMax: scale.headMax,
    tailMax: scale.tailMax,
  })
  if (anchors) parts.push(anchors)

  return parts.filter(Boolean).join('\n\n')
}

function novelContextScale(chapterNumber: number) {
  if (chapterNumber <= 2) {
    return { headMax: 1600, tailMax: 2200, retrievalLimit: 3, olderSummaryMax: 400 }
  }
  if (chapterNumber <= 5) {
    return { headMax: 1000, tailMax: 1600, retrievalLimit: 2, olderSummaryMax: 320 }
  }
  return { headMax: 700, tailMax: 1200, retrievalLimit: 2, olderSummaryMax: 260 }
}

/** 统一写作上下文（对齐短剧 buildGenerateContinuityBlocks + 结构化状态 + 角色表） */
export async function buildNovelWriteContext(args: {
  dramaId: number
  chapterNumber: number
  chapterId: number
  meta: NovelMetadata
  retrievalQuery?: string
  includeSelfHint?: boolean
  writingBrief?: string
  bookOutline?: string
}) {
  const {
    dramaId, chapterNumber, chapterId, meta, retrievalQuery, includeSelfHint = true,
    writingBrief, bookOutline,
  } = args
  const scale = novelContextScale(chapterNumber)

  const { continuity, selfHint } = await buildSerialContinuityExcerpt({
    dramaId,
    currentUnitNumber: chapterNumber,
    currentUnitId: chapterId,
    unitLabel: '章',
    skipImmediatePrev: chapterNumber >= 2,
    olderSummaryMax: scale.olderSummaryMax,
  })

  // 第 1 章：全书大纲 + 梗概；第 2 章起：只用本章大纲（在 writing 层注入）+ 前序已写上下文
  let outlineBlock = ''
  if (chapterNumber === 1 && meta.outline?.trim()) {
    outlineBlock = `【全书大纲】\n${truncText(meta.outline.trim(), 6000)}`
  }

  const premiseBlock = chapterNumber === 1 && meta.premise?.trim()
    ? `【创意梗概】\n${truncText(meta.premise.trim(), 1200)}`
    : (chapterNumber >= 2 && meta.premise?.trim()
      ? `【全书梗概（仅背景方向，不含未写章节细节）】\n${truncText(meta.premise.trim(), 600)}`
      : '')

  const causalEnabled = isCausalChainEnabled(meta)
  const serialWrittenBlock = await buildSerialWrittenContextBlock(dramaId, chapterNumber, {
    skipLedger: causalEnabled,
  })
  const canonLockBlock = causalEnabled ? '' : await buildCanonLockPrefix(dramaId, chapterNumber)
  const stateBlock = !causalEnabled && chapterNumber >= 2
    ? await resolveContinuityInjectBlock(dramaId, chapterNumber)
    : ''
  let causalBlock = ''
  if (causalEnabled) {
    const chain = ensureCausalChain(dramaId, chapterNumber)
    const vol = resolveVolumeForChapter(bookOutline || meta.outline, chapterNumber)
    causalBlock = buildCausalOriginBlock(chain, {
      vol,
      chapter: chapterNumber,
      chapterGoal: writingBrief,
    })
  }
  let retrievalBlock = ''
  if (chapterNumber >= 2 && retrievalQuery?.trim() && !causalEnabled) {
    const hits = await searchChapterLedgers({
      dramaId,
      beforeChapter: chapterNumber,
      query: retrievalQuery,
      limit: scale.retrievalLimit,
    })
    retrievalBlock = formatRetrievedLedgersBlock(hits)
  }

  const characterBlock = await buildProjectCharacterRosterBlock(dramaId)

  let memoryBlock = ''
  if (meta.long_memory_enabled !== false) {
    const mgr = ensureNovelMemory(dramaId, {
      outline: bookOutline || meta.outline,
      premise: meta.premise,
    })
    const vol = mgr.resolveVol(chapterNumber, bookOutline || meta.outline)
    memoryBlock = await mgr.buildInjectBlock({
      vol, chapter: chapterNumber, brief: writingBrief, causalMode: causalEnabled,
    })
  }

  const worldbuildingBlock = chapterNumber === 1
    ? buildChapter1WorldIntroBlock({ outline: bookOutline || meta.outline, dramaId })
    : ''

  const structuredBlock = [
    memoryBlock,
    causalBlock,
    canonLockBlock,
    serialWrittenBlock,
    stateBlock,
    retrievalBlock,
  ].filter(Boolean).join('\n\n')

  return {
    outlineBlock,
    premiseBlock,
    worldbuildingBlock,
    memoryBlock,
    causalBlock,
    serialWrittenBlock,
    canonLockBlock,
    structuredBlock,
    continuity,
    characterBlock,
    selfHint: includeSelfHint ? selfHint : '',
    causalEnabled,
  }
}

/** 简单关键词检索历史章账本（供长程设定补全，固定 Top-K，不随章数膨胀） */
export async function searchChapterLedgers(args: {
  dramaId: number
  beforeChapter: number
  query: string
  limit?: number
}): Promise<NovelContinuityLedger[]> {
  const { dramaId, beforeChapter, query, limit = 3 } = args
  const q = query.trim()
  if (!q || beforeChapter < 2) return []

  const tokens = [...new Set(
    q.split(/[\s，,。；;：:、\n]+/).map(t => t.trim()).filter(t => t.length >= 2),
  )].slice(0, 12)
  if (!tokens.length) return []

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)

  type Scored = { ledger: NovelContinuityLedger; score: number }
  const scored: Scored[] = []

  for (const ep of episodes) {
    if (ep.episodeNumber >= beforeChapter) continue
    const ledger = readEpisodeContinuityLedger(ep.metadata, ep.episodeNumber)
    if (!ledger) continue
    const blob = JSON.stringify(ledger)
    let score = 0
    for (const tok of tokens) {
      if (blob.includes(tok)) score += 1
    }
    if (score > 0) scored.push({ ledger, score })
  }

  scored.sort((a, b) => b.score - a.score || b.ledger.chapter_number - a.ledger.chapter_number)
  return scored.slice(0, limit).map(s => s.ledger)
}

export function formatRetrievedLedgersBlock(ledgers: NovelContinuityLedger[]): string {
  if (!ledgers.length) return ''
  const parts = ledgers.map((l) => {
    const body = formatContinuityStateBlock(l, { asOfChapter: l.chapter_number })
    return body ? `--- 第 ${l.chapter_number} 章存档 ---\n${body}` : ''
  }).filter(Boolean)
  if (!parts.length) return ''
  return [
    '【相关章节状态存档（检索补充，勿与当前状态矛盾）】',
    parts.join('\n\n'),
  ].join('\n')
}

export async function extractChapterContinuityLedger(args: {
  content: string
  chapterNumber: number
  dramaTitle?: string
  previousState?: NovelContinuityFields | null
  billing?: TextBillingContext
}): Promise<NovelContinuityFields | null> {
  const { content, chapterNumber, dramaTitle, previousState, billing } = args
  const body = content.trim()
  if (!body) return null

  const prevBlock = previousState
    ? formatContinuityStateBlock(previousState, { title: '【上一状态参考】' })
    : ''

  const user = [
    dramaTitle ? `【书名】${dramaTitle}` : '',
    `【章节】第 ${chapterNumber} 章`,
    prevBlock,
    `【正文（分析章末状态）】\n${trunc(body, 12000)}`,
  ].filter(Boolean).join('\n\n')

  const raw = await chatCompletionText(
    [{ role: 'system', content: EXTRACT_SYSTEM }, { role: 'user', content: user }],
    { maxTokens: 2048, temperature: 0.25, billing },
  )

  return parseContinuityJsonFromModel(raw)
}

export async function finalizeChapterContinuity(args: {
  dramaId: number
  episodeId: number
  chapterNumber: number
  content: string
  dramaTitle?: string
  billing?: TextBillingContext
  skipIfUnchanged?: boolean
}): Promise<{ ledger: NovelContinuityLedger | null; globalUpdated: boolean }> {
  const {
    dramaId, episodeId, chapterNumber, content, dramaTitle, billing, skipIfUnchanged = true,
  } = args
  const trimmed = content.trim()
  if (!trimmed) return { ledger: null, globalUpdated: false }

  const contentHash = hashNovelContent(trimmed)
  const existing = await loadEpisodeLedger(episodeId, chapterNumber)
  if (skipIfUnchanged && existing?.content_hash === contentHash) {
    return { ledger: existing, globalUpdated: false }
  }

  const prevLedger = await loadPrevChapterLedger(dramaId, chapterNumber)

  const fields = await extractChapterContinuityLedger({
    content: trimmed,
    chapterNumber,
    dramaTitle,
    previousState: prevLedger ?? undefined,
    billing,
  })
  if (!fields) return { ledger: null, globalUpdated: false }

  const ledger: NovelContinuityLedger = {
    ...fields,
    chapter_number: chapterNumber,
    updated_at: new Date().toISOString(),
    content_hash: contentHash,
  }

  const ep = await episodesRepo.findEpisodeById(episodeId)
  const epMetadata = mergeEpisodeMetadata(ep?.metadata, { continuity_ledger: ledger })
  await episodesRepo.updateEpisode(episodeId, { metadata: epMetadata, updatedAt: now() })

  const drama = await dramasRepo.findDramaById(dramaId)
  const meta = parseNovelMetadata(drama?.metadata)
  const currentGlobal = meta.continuity_state
  let globalUpdated = false

  if (!currentGlobal || chapterNumber >= currentGlobal.as_of_chapter) {
    const global: NovelGlobalContinuityState = ledgerToGlobal(ledger)
    const metadata = mergeNovelMetadata(drama?.metadata, { continuity_state: global })
    await dramasRepo.updateDrama(dramaId, { metadata, updatedAt: now() })
    globalUpdated = true
  }

  return { ledger, globalUpdated }
}

export async function getNovelContinuitySummary(dramaId: number) {
  const drama = await dramasRepo.findDramaById(dramaId)
  const meta = parseNovelMetadata(drama?.metadata)
  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const chapter_ledgers = episodes
    .map(ep => readEpisodeContinuityLedger(ep.metadata, ep.episodeNumber))
    .filter((l): l is NovelContinuityLedger => !!l)
    .map(l => ({ chapter_number: l.chapter_number, updated_at: l.updated_at, reminder: l.reminder }))

  return {
    global_state: meta.continuity_state ?? null,
    chapter_ledger_count: chapter_ledgers.length,
    chapter_ledgers,
  }
}

/** 从已有章节正文批量重建账本（按章号顺序，供导入后使用） */
export async function rebuildNovelContinuityFromChapters(args: {
  dramaId: number
  billing?: TextBillingContext
  onProgress?: (chapterNumber: number, total: number) => void
}): Promise<{ processed: number; skipped: number }> {
  const { dramaId, billing, onProgress } = args
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama) return { processed: 0, skipped: 0 }

  const episodes = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  const withContent = episodes.filter(e => (e.content || e.scriptContent || '').trim())
  let processed = 0
  let skipped = 0
  let idx = 0

  for (const ep of withContent) {
    idx += 1
    onProgress?.(ep.episodeNumber, withContent.length)
    const text = (ep.content || ep.scriptContent || '').trim()
    const hash = hashNovelContent(text)
    const existing = readEpisodeContinuityLedger(ep.metadata, ep.episodeNumber)
    if (existing?.content_hash === hash) {
      skipped += 1
      continue
    }
    await finalizeChapterContinuity({
      dramaId,
      episodeId: ep.id,
      chapterNumber: ep.episodeNumber,
      content: text,
      dramaTitle: drama.title,
      billing,
      skipIfUnchanged: false,
    })
    processed += 1
  }

  return { processed, skipped }
}

export { normalizeContinuityFields }
