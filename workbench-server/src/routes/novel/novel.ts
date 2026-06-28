import { Hono } from 'hono'
import { success, badRequest, notFound, now } from '../../common/http/response.js'
import { toSnakeCase } from '../../common/http/transform.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { dramaOwnedByUser, episodeAndDramaForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  createNovelChapter,
  listNovelChapters,
  updateNovelChapter,
  updateNovelDrama,
} from '../../services/novel/novel-route-service.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import {
  buildContinueNovelMessages,
  buildGenerateNovelChapterMessages,
  continueNovelChapter,
  generateNovelOutline,
  generateNovelPremise,
  generateNovelWritingBrief,
} from '../../services/novel/novel-writing.js'
import { polishNovelChapterProse } from '../../services/novel/novel-prose-polish.js'
import { streamChatCompletionWithPolish, sseResponse } from '../../common/http/sse-stream.js'
import { batchGenerateNovelChapters } from '../../services/batch/batch-generation.js'
import { runNovelChapterPipeline, postProcessNovelChapterContent, checkAndSaveChapterContinuity } from '../../services/novel/novel-chapter-pipeline.js'
import { checkNovelChapterContinuity } from '../../services/novel/novel-continuity-check.js'
import { resolveFullChapterForAudit } from '../../services/novel/novel-causal-chain/index.js'
import type { TextBillingContext } from '../../services/ai/ai.js'

function novelTextBilling(
  user: { id: number; role?: string },
  reason: string,
  resourceId?: number,
): TextBillingContext {
  return {
    userId: user.id,
    role: user.role,
    reason,
    resourceType: 'novel',
    resourceId,
  }
}
import { isNovelProject, mergeNovelMetadata, parseNovelMetadata, type NovelMetadata } from '../../common/novel/novel-meta.js'
import { extractChapterOutline, resolveChapterDisplayTitle } from '../../common/novel/novel-outline.js'
import { syncChapterTitlesFromOutline } from '../../common/novel/novel-chapter-titles.js'
import {
  buildNovelImportContent,
  listNovelImportChapters,
  listNovelImportSources,
  novelImportAccessible,
} from '../../common/novel/novel-import-access.js'
import { hashNovelContent } from '../../services/ai/ai-text-detection.js'
import {
  detectAiTextStatisticalFallback,
  detectAiTextWithPerplexity,
} from '../../services/ai/ai-perplexity-detection.js'
import { mergeEpisodeMetadata, parseEpisodeMetadata } from '../../common/drama/episode-meta.js'
import { hydrateEpisodeRow } from '../../common/storage/text-blob-repo.js'
import {
  finalizeChapterContinuity,
  getNovelContinuitySummary,
  rebuildNovelContinuityFromChapters,
} from '../../services/novel/novel-continuity.js'
import { NovelMemoryManager, novelMemoryPaths, readAnchor, writeAnchor } from '../../services/novel/novel-memory/index.js'
import fs from 'fs'

function resolveChapterOutline(pack: { episode: { episodeNumber: number; description: string | null }; drama: { metadata: string | null } }) {
  const custom = pack.episode.description?.trim()
  if (custom) return { text: custom, source: 'episode' as const }
  const meta = parseNovelMetadata(pack.drama.metadata)
  const fromBook = extractChapterOutline(meta.outline || '', pack.episode.episodeNumber)
  if (fromBook) return { text: fromBook, source: 'book' as const }
  return { text: '', source: 'empty' as const }
}

function resolveTargetChapterChars(body: { target_length?: unknown }, meta: NovelMetadata): number {
  const fromBody = Number(body.target_length)
  if (Number.isFinite(fromBody) && fromBody >= 500 && fromBody <= 20000) return fromBody
  const fromMeta = meta.target_chapter_chars
  if (fromMeta && fromMeta >= 500 && fromMeta <= 20000) return fromMeta
  return 3000
}

function resolveContinueSegmentChars(body: { length?: unknown }, meta: NovelMetadata): number {
  const fromBody = Number(body.length)
  if (Number.isFinite(fromBody) && fromBody >= 200 && fromBody <= 8000) return fromBody
  const fromMeta = meta.continue_segment_chars
  if (fromMeta && fromMeta >= 200 && fromMeta <= 8000) return fromMeta
  return 800
}

const app = new Hono()

// GET /novel/import-sources — 短剧原始内容可引用的小说项目列表
app.get('/import-sources', async (c) => {
  const user = getAuthUser(c)
  const keyword = (c.req.query('keyword') || '').trim()
  const page = Math.max(1, Number(c.req.query('page') || 1))
  const pageSize = Math.max(1, Math.min(100, Number(c.req.query('page_size') || 20)))
  return success(c, await listNovelImportSources(user.id, user.role, keyword, page, pageSize))
})

// GET /novel/import-sources/:id/chapters — 可导入的章节列表
app.get('/import-sources/:id/chapters', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const pack = await novelImportAccessible(id, user.id, user.role)
  if (!pack) return notFound(c, '小说不存在或无权访问')
  return success(c, { chapters: await listNovelImportChapters(id) })
})

// GET /novel/import-sources/:id/content — 导入小说正文（对应章节或全书）
app.get('/import-sources/:id/content', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const pack = await novelImportAccessible(id, user.id, user.role)
  if (!pack) return notFound(c, '小说不存在或无权访问')

  const mode = c.req.query('mode') === 'full' ? 'full' : 'chapter'
  const episodeNumber = Math.max(1, Number(c.req.query('episode_number') || 1))

  try {
    const body = await buildNovelImportContent(id, mode, episodeNumber)
    return success(c, {
      ...body,
      novel_id: id,
      novel_title: pack.drama.title,
      source: pack.source,
    })
  } catch (err: any) {
    return badRequest(c, err?.message || '导入失败')
  }
})

// POST /novel/generate-premise — 根据关键词生成创意梗概（创建项目前可用）
app.post('/generate-premise', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const body = await c.req.json().catch(() => ({}))
  const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : ''
  if (!keywords) return badRequest(c, '关键词不能为空')
  if (keywords.length > 500) return badRequest(c, '关键词过长（最多 500 字）')

  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const genre = typeof body.genre === 'string' ? body.genre.trim() : undefined
  const totalChapters = Number(body.total_chapters) || undefined

  logTaskStart('Novel', 'generate-premise', { keywordLen: keywords.length })
  try {
    const premise = await generateNovelPremise(
      { title, keywords, genre, totalChapters },
      novelTextBilling(user, '小说梗概生成'),
    )
    logTaskSuccess('Novel', 'generate-premise', { len: premise.length })
    return success(c, { premise })
  } catch (err: any) {
    logTaskError('Novel', 'generate-premise', { error: err.message })
    return badRequest(c, err.message || '生成梗概失败')
  }
})

async function requireNovelDrama(dramaId: number, userId: number) {
  const drama = await dramaOwnedByUser(dramaId, userId)
  if (!drama) return null
  if (!isNovelProject(drama)) return null
  return drama
}

// GET /novel/dramas/:id/meta
app.get('/dramas/:id/meta', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const drama = await requireNovelDrama(id, user.id)
  if (!drama) return notFound(c, '小说项目不存在')
  const meta = parseNovelMetadata(drama.metadata)
  return success(c, {
    outline: meta.outline || '',
    premise: meta.premise || drama.description || '',
    novel_genre: meta.novel_genre || drama.genre || '',
    context_chars: meta.context_chars || 4000,
    target_chapter_chars: meta.target_chapter_chars || 3000,
    continue_segment_chars: meta.continue_segment_chars || 800,
  })
})

// PUT /novel/dramas/:id/meta
app.put('/dramas/:id/meta', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const drama = await requireNovelDrama(id, user.id)
  if (!drama) return notFound(c, '小说项目不存在')
  const body = await c.req.json().catch(() => ({}))
  const patch: Record<string, string | number | undefined> = {}
  if (typeof body.outline === 'string') patch.outline = body.outline
  if (typeof body.premise === 'string') patch.premise = body.premise
  if (typeof body.novel_genre === 'string') patch.novel_genre = body.novel_genre
  if (body.context_chars !== undefined) {
    const n = Number(body.context_chars)
    if (Number.isFinite(n) && n >= 512 && n <= 12000) patch.context_chars = n
  }
  if (body.target_chapter_chars !== undefined) {
    const n = Number(body.target_chapter_chars)
    if (Number.isFinite(n) && n >= 500 && n <= 20000) patch.target_chapter_chars = n
  }
  if (body.continue_segment_chars !== undefined) {
    const n = Number(body.continue_segment_chars)
    if (Number.isFinite(n) && n >= 200 && n <= 8000) patch.continue_segment_chars = n
  }
  const metadata = mergeNovelMetadata(drama.metadata, patch)
  const updates: Record<string, unknown> = { metadata, updatedAt: now() }
  if (typeof body.novel_genre === 'string') updates.genre = body.novel_genre
  await updateNovelDrama(id, updates)
  if (typeof body.outline === 'string' && body.outline.trim()) {
    void syncChapterTitlesFromOutline(id, body.outline)
  }
  return success(c)
})

// POST /novel/dramas/:id/sync-chapter-titles — 从全书大纲同步章节标题
app.post('/dramas/:id/sync-chapter-titles', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const drama = await requireNovelDrama(id, user.id)
  if (!drama) return notFound(c, '小说项目不存在')
  const meta = parseNovelMetadata(drama.metadata)
  const outline = (meta.outline || '').trim()
  if (!outline) return badRequest(c, '请先填写全书大纲')
  const updated = await syncChapterTitlesFromOutline(id, outline)
  return success(c, { updated })
})

// POST /novel/dramas/:id/outline — AI 生成大纲
app.post('/dramas/:id/outline', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const drama = await requireNovelDrama(id, user.id)
  if (!drama) return notFound(c, '小说项目不存在')

  const body = await c.req.json().catch(() => ({}))
  const meta = parseNovelMetadata(drama.metadata)
  const premise = typeof body.premise === 'string' && body.premise.trim()
    ? body.premise.trim()
    : (meta.premise || drama.description || '').trim()
  if (!premise) return badRequest(c, '请先填写创意梗概')

  const chapters = await listNovelChapters(id)
  const totalChapters = chapters.length || drama.totalEpisodes || 10

  logTaskStart('Novel', 'generate-outline', { dramaId: id })
  try {
    const outline = await generateNovelOutline({
      title: drama.title,
      premise,
      genre: meta.novel_genre || drama.genre || undefined,
      totalChapters,
    }, novelTextBilling(user, '小说大纲生成', id))
    const metadata = mergeNovelMetadata(drama.metadata, { outline, premise })
    await updateNovelDrama(id, { metadata, updatedAt: now() })
    const titlesUpdated = await syncChapterTitlesFromOutline(id, outline)
    logTaskSuccess('Novel', 'generate-outline', { dramaId: id, len: outline.length, titlesUpdated })
    return success(c, { outline, titles_updated: titlesUpdated })
  } catch (err: any) {
    logTaskError('Novel', 'generate-outline', { dramaId: id, error: err.message })
    return badRequest(c, err.message || '生成大纲失败')
  }
})

// POST /novel/dramas/:id/chapters — 添加章节（无需音视频配置）
app.post('/dramas/:id/chapters', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')

  const body = await c.req.json().catch(() => ({}))
  const ep = await createNovelChapter(id, body.title)
  if (!ep) return badRequest(c, '创建章节失败')
  return success(c, toSnakeCase(ep))
})

// GET /novel/chapters/:id/brief — 本章大纲（从全书大纲解析或章节自定义）
app.get('/chapters/:id/brief', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const episode = hydrateEpisodeRow(pack.episode)
  const { text, source } = resolveChapterOutline({ episode, drama: pack.drama })
  const meta = parseNovelMetadata(pack.drama.metadata)
  const writingBrief = (episode.scriptContent || '').trim()
  const displayTitle = resolveChapterDisplayTitle({
    episodeTitle: episode.title,
    chapterNumber: episode.episodeNumber,
    bookOutline: meta.outline,
  })
  const epMeta = parseEpisodeMetadata(episode.metadata)
  const contentForHash = (episode.content || '').trim()
  const aiDetection = epMeta.ai_detection
    ? {
      ...epMeta.ai_detection,
      is_stale: aiDetectionIsStale(epMeta.ai_detection, contentForHash),
    }
    : null

  return success(c, {
    chapter_number: episode.episodeNumber,
    chapter_title: episode.title,
    display_title: displayTitle,
    chapter_outline: text,
    writing_brief: writingBrief,
    source,
    has_book_outline: !!(meta.outline || '').trim(),
    ai_detection: aiDetection,
    continuity_ledger: epMeta.continuity_ledger ?? null,
    continuity_check: epMeta.continuity_check ?? null,
  })
})

// GET /novel/dramas/:id/continuity — 全书当前状态与各章账本摘要
app.get('/dramas/:id/continuity', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  return success(c, await getNovelContinuitySummary(id))
})

// POST /novel/chapters/:id/continuity/check — 一致性审校（不写正文）
app.post('/chapters/:id/continuity/check', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const fromBody = typeof body.text === 'string' ? body.text.trim() : ''
  const epMeta = parseEpisodeMetadata(pack.episode.metadata)
  const prose = fromBody || (pack.episode.content || pack.episode.scriptContent || '').trim()
  if (!prose) return badRequest(c, '章节正文为空，无法审校')
  const content = fromBody
    ? prose
    : resolveFullChapterForAudit(prose, epMeta.causal_change_record)

  const { text: chapterOutline } = resolveChapterOutline(pack)
  const meta = parseNovelMetadata(pack.drama.metadata)

  logTaskStart('Novel', 'continuity-check', { chapterId: id })
  try {
    const check = await checkNovelChapterContinuity({
      content,
      chapterNumber: pack.episode.episodeNumber,
      dramaId: pack.drama.id,
      dramaTitle: pack.drama.title,
      meta,
      chapterOutline,
      billing: novelTextBilling(user, '小说一致性审校', id),
    })
    const metadata = mergeEpisodeMetadata(pack.episode.metadata, { continuity_check: check })
    await updateNovelChapter(id, { metadata, updatedAt: now() })
    logTaskSuccess('Novel', 'continuity-check', { chapterId: id, score: check.score, passed: check.passed })
    return success(c, check)
  } catch (err: any) {
    logTaskError('Novel', 'continuity-check', { chapterId: id, error: err?.message })
    return badRequest(c, err?.message || '审校失败')
  }
})

// POST /novel/chapters/:id/continuity/refresh — 从正文重新提取本章账本并更新全局状态
app.post('/chapters/:id/continuity/refresh', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const fromBody = typeof body.text === 'string' ? body.text.trim() : ''
  const content = fromBody || (pack.episode.content || pack.episode.scriptContent || '').trim()
  if (!content) return badRequest(c, '章节正文为空，无法提取状态账本')

  logTaskStart('Novel', 'continuity-refresh', { chapterId: id })
  try {
    const result = await finalizeChapterContinuity({
      dramaId: pack.drama.id,
      episodeId: id,
      chapterNumber: pack.episode.episodeNumber,
      content,
      dramaTitle: pack.drama.title,
      billing: novelTextBilling(user, '小说一致性账本提取', id),
      skipIfUnchanged: body.force !== true,
    })
    logTaskSuccess('Novel', 'continuity-refresh', {
      chapterId: id,
      globalUpdated: result.globalUpdated,
      hasLedger: !!result.ledger,
    })
    return success(c, {
      ledger: result.ledger,
      global_updated: result.globalUpdated,
    })
  } catch (err: any) {
    logTaskError('Novel', 'continuity-refresh', { chapterId: id, error: err?.message })
    return badRequest(c, err?.message || '状态账本提取失败')
  }
})

// POST /novel/dramas/:id/continuity/rebuild — 按章号顺序批量重建账本
app.post('/dramas/:id/continuity/rebuild', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')

  logTaskStart('Novel', 'continuity-rebuild', { dramaId: id })
  try {
    const summary = await rebuildNovelContinuityFromChapters({
      dramaId: id,
      billing: novelTextBilling(user, '小说一致性账本批量重建', id),
    })
    logTaskSuccess('Novel', 'continuity-rebuild', { dramaId: id, ...summary })
    return success(c, summary)
  } catch (err: any) {
    logTaskError('Novel', 'continuity-rebuild', { dramaId: id, error: err?.message })
    return badRequest(c, err?.message || '批量重建失败')
  }
})

function aiDetectionIsStale(
  saved: { content_hash?: string; char_count?: number },
  currentText: string,
): boolean {
  if (!saved.content_hash) return true
  const trimmed = currentText.trim()
  if (!trimmed) return true
  return saved.content_hash !== hashNovelContent(trimmed)
}

// POST /novel/chapters/:id/detect-ai — 困惑度检测（优先）+ 统计特征回退
app.post('/chapters/:id/detect-ai', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const fromBody = typeof body.text === 'string' ? body.text.trim() : ''
  const content = fromBody || (pack.episode.content || '').trim()
  if (!content) return badRequest(c, '章节正文为空，无法检测')

  logTaskStart('Novel', 'detect-ai', { chapterId: id, charCount: content.length })
  try {
    let result
    try {
      result = await detectAiTextWithPerplexity(content, novelTextBilling(user, '小说章节 AI 率检测（困惑度）', id))
    } catch (perplexityErr: any) {
      const reason = perplexityErr?.message || '困惑度检测不可用'
      logTaskError('Novel', 'detect-ai-perplexity-fallback', { chapterId: id, error: reason })
      result = detectAiTextStatisticalFallback(content, reason)
    }

    const metadata = mergeEpisodeMetadata(pack.episode.metadata, { ai_detection: result })
    await updateNovelChapter(id, { metadata, updatedAt: now() })

    logTaskSuccess('Novel', 'detect-ai', {
      chapterId: id,
      probability: result.probability,
      method: result.method,
      perplexity: result.perplexity,
    })
    return success(c, {
      ...result,
      is_stale: false,
    })
  } catch (err: any) {
    logTaskError('Novel', 'detect-ai', { chapterId: id, error: err?.message })
    return badRequest(c, err?.message || '检测失败')
  }
})

// POST /novel/chapters/:id/generate-brief — 根据关键词生成本章写作说明
app.post('/chapters/:id/generate-brief', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : ''
  if (!keywords) return badRequest(c, '关键词不能为空')
  if (keywords.length > 500) return badRequest(c, '关键词过长（最多 500 字）')

  const { text: chapterOutline } = resolveChapterOutline(pack)
  const meta = parseNovelMetadata(pack.drama.metadata)

  logTaskStart('Novel', 'generate-brief', { chapterId: id })
  try {
    const brief = await generateNovelWritingBrief({
      keywords,
      dramaTitle: pack.drama.title,
      chapterNumber: pack.episode.episodeNumber,
      chapterTitle: pack.episode.title,
      chapterOutline,
      genre: meta.novel_genre || pack.drama.genre || undefined,
      dramaId: pack.drama.id,
      chapterId: id,
      meta,
    }, novelTextBilling(user, '小说写作说明', id))
    logTaskSuccess('Novel', 'generate-brief', { chapterId: id, len: brief.length })
    return success(c, { writing_brief: brief })
  } catch (err: any) {
    logTaskError('Novel', 'generate-brief', { chapterId: id, error: err.message })
    return badRequest(c, err.message || '生成写作说明失败')
  }
})

// POST /novel/chapters/:id/continue — 续写（参考 AI-Writer 取文末上下文）
app.post('/chapters/:id/continue', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const existingText = typeof body.text === 'string' ? body.text : (pack.episode.content || '')
  const meta = parseNovelMetadata(pack.drama.metadata)
  const lengthHint = resolveContinueSegmentChars(body, meta)
  const skipCheck = body.skip_continuity_check === true
  const { text: chapterOutline } = resolveChapterOutline(pack)

  logTaskStart('Novel', 'continue', { chapterId: id })
  try {
    const segment = await continueNovelChapter({
      dramaTitle: pack.drama.title,
      chapterNumber: pack.episode.episodeNumber,
      chapterTitle: pack.episode.title,
      existingText,
      meta,
      dramaId: pack.drama.id,
      chapterId: id,
      lengthHint,
    }, novelTextBilling(user, '小说续写', id))
    let continuity_check = null
    if (!skipCheck) {
      const fullText = `${existingText}${existingText && !existingText.endsWith('\n') ? '\n' : ''}${segment}`
      continuity_check = await checkAndSaveChapterContinuity({
        content: fullText,
        dramaId: pack.drama.id,
        episodeId: id,
        chapterNumber: pack.episode.episodeNumber,
        dramaTitle: pack.drama.title,
        meta,
        chapterOutline,
        billing: novelTextBilling(user, '小说续写一致性审校', id),
      })
    }
    logTaskSuccess('Novel', 'continue', { chapterId: id, segmentLen: segment.length })
    return success(c, { segment, continuity_check })
  } catch (err: any) {
    logTaskError('Novel', 'continue', { chapterId: id, error: err.message })
    return badRequest(c, err.message || '续写失败')
  }
})

// POST /novel/chapters/:id/continue/stream — 续写（SSE 流式）
app.post('/chapters/:id/continue/stream', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const existingText = typeof body.text === 'string' ? body.text : (pack.episode.content || '')
  const meta = parseNovelMetadata(pack.drama.metadata)
  const lengthHint = resolveContinueSegmentChars(body, meta)
  const skipCheck = body.skip_continuity_check === true
  const { text: chapterOutline } = resolveChapterOutline(pack)

  const { messages, options } = await buildContinueNovelMessages({
    dramaTitle: pack.drama.title,
    chapterNumber: pack.episode.episodeNumber,
    chapterTitle: pack.episode.title,
    existingText,
    meta,
    dramaId: pack.drama.id,
    chapterId: id,
    lengthHint,
  })

  logTaskStart('Novel', 'continue-stream', { chapterId: id })
  const billing = novelTextBilling(user, '小说续写（流式）', id)
  return streamChatCompletionWithPolish(c, messages, { ...options, billing }, draft =>
    polishNovelChapterProse(draft, { ...billing, reason: '小说续写润色（流式）' }, { mode: 'segment' }),
    async (polished) => {
      if (skipCheck) return {}
      const fullText = `${existingText}${existingText && !existingText.endsWith('\n') ? '\n' : ''}${polished}`
      const continuity_check = await checkAndSaveChapterContinuity({
        content: fullText,
        dramaId: pack.drama.id,
        episodeId: id,
        chapterNumber: pack.episode.episodeNumber,
        dramaTitle: pack.drama.title,
        meta,
        chapterOutline,
        billing: novelTextBilling(user, '小说续写一致性审校', id),
      })
      return { continuity_check }
    },
  )
})

// POST /novel/chapters/:id/generate/stream — 一次生成长章节（SSE 流式）
app.post('/chapters/:id/generate/stream', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const { text: chapterOutline } = resolveChapterOutline(pack)
  let prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt && chapterOutline) prompt = chapterOutline
  if (!prompt) return badRequest(c, '写作说明不能为空（请填写本章大纲或写作说明）')
  if (prompt.length > 4000) return badRequest(c, '写作说明过长')

  const existingText = typeof body.text === 'string' ? body.text : (pack.episode.content || '')
  const meta = parseNovelMetadata(pack.drama.metadata)
  const targetLength = resolveTargetChapterChars(body, meta)

  const { messages, options, minLen, maxLen } = await buildGenerateNovelChapterMessages({
    dramaTitle: pack.drama.title,
    chapterNumber: pack.episode.episodeNumber,
    chapterTitle: pack.episode.title,
    prompt,
    chapterOutline,
    meta,
    dramaId: pack.drama.id,
    chapterId: id,
    existingText,
    targetLength,
  })

  logTaskStart('Novel', 'generate-chapter-stream', { chapterId: id, targetLength, maxLen })
  const billing = novelTextBilling(user, '小说章节生成（流式）', id)
  const skipCheck = body.skip_continuity_check === true
  return streamChatCompletionWithPolish(
    c,
    messages,
    { ...options, billing },
    draft => polishNovelChapterProse(draft, { ...billing, reason: '小说章节润色（流式）' }, { minLen, maxLen, mode: 'chapter' }),
    async (polished) => {
      const post = await postProcessNovelChapterContent({
        content: polished,
        dramaId: pack.drama.id,
        episodeId: id,
        chapterNumber: pack.episode.episodeNumber,
        dramaTitle: pack.drama.title,
        meta,
        chapterOutline,
        billing,
        skipCheck,
      })
      return {
        continuity_check: post.check,
        continuity_ledger: post.ledger,
      }
    },
  )
})

// POST /novel/chapters/:id/generate — 一次生成长章节
app.post('/chapters/:id/generate', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const pack = await episodeAndDramaForUser(id, user.id)
  if (!pack || !isNovelProject(pack.drama)) return notFound(c, '章节不存在')

  const body = await c.req.json().catch(() => ({}))
  const { text: chapterOutline } = resolveChapterOutline(pack)
  let prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt && chapterOutline) prompt = chapterOutline
  if (!prompt) return badRequest(c, '写作说明不能为空（请填写本章大纲或写作说明）')
  if (prompt.length > 4000) return badRequest(c, '写作说明过长')

  const existingText = typeof body.text === 'string' ? body.text : (pack.episode.content || '')
  const meta = parseNovelMetadata(pack.drama.metadata)
  const targetLength = resolveTargetChapterChars(body, meta)

  logTaskStart('Novel', 'generate-chapter', { chapterId: id })
  try {
    const strictContinuity = body.skip_continuity_rewrite === true
      ? false
      : meta.continuity_strict !== false
    const pipeline = await runNovelChapterPipeline({
      generateArgs: {
        dramaTitle: pack.drama.title,
        chapterNumber: pack.episode.episodeNumber,
        chapterTitle: pack.episode.title,
        prompt,
        chapterOutline,
        meta,
        dramaId: pack.drama.id,
        chapterId: id,
        existingText,
        targetLength,
      },
      dramaId: pack.drama.id,
      episodeId: id,
      chapterNumber: pack.episode.episodeNumber,
      dramaTitle: pack.drama.title,
      meta,
      chapterOutline,
      billing: novelTextBilling(user, '小说章节生成', id),
      strictContinuity,
      skipFinalizeWhenCheckFails: strictContinuity,
      skipCheck: body.skip_continuity_check === true,
    })

    logTaskSuccess('Novel', 'generate-chapter', {
      chapterId: id,
      len: pipeline.content.length,
      rewritten: pipeline.rewritten,
      rewriteAttempts: pipeline.rewrite_attempts,
      checkScore: pipeline.check?.score,
    })

    const metaPatch: Partial<import('../../common/drama/episode-meta.js').EpisodeMetadata> = {}
    if (pipeline.causal_change_record) metaPatch.causal_change_record = pipeline.causal_change_record
    if (pipeline.check) metaPatch.continuity_check = pipeline.check
    const nextMetadata = Object.keys(metaPatch).length
      ? mergeEpisodeMetadata(pack.episode.metadata, metaPatch)
      : pack.episode.metadata
    await updateNovelChapter(id, {
      content: pipeline.content,
      ...(nextMetadata !== pack.episode.metadata ? { metadata: nextMetadata } : {}),
      updatedAt: now(),
    })

    return success(c, {
      content: pipeline.content,
      causal_change_record: pipeline.causal_change_record,
      continuity_check: pipeline.check,
      continuity_ledger: pipeline.ledger,
      rewritten: pipeline.rewritten,
      rewrite_attempts: pipeline.rewrite_attempts,
    })
  } catch (err: any) {
    logTaskError('Novel', 'generate-chapter', { chapterId: id, error: err.message })
    return badRequest(c, err.message || '生成失败')
  }
})

// POST /novel/dramas/:id/generate-remaining/stream — 批量撰写章节（SSE 进度）
app.post('/dramas/:id/generate-remaining/stream', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')

  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const scope = {
    mode: body.mode as 'remaining' | 'all' | 'range' | 'chapters' | undefined,
    chapter_numbers: Array.isArray(body.chapter_numbers)
      ? body.chapter_numbers.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
      : undefined,
    from_chapter: body.from_chapter != null ? Number(body.from_chapter) : undefined,
    to_chapter: body.to_chapter != null ? Number(body.to_chapter) : undefined,
    overwrite: body.overwrite === true,
  }

  return sseResponse(c, async (send) => {
    const signal = c.req.raw.signal
    const summary = await batchGenerateNovelChapters({
      dramaId: id,
      userId: user.id,
      userRole: user.role,
      scope,
      onProgress: (progress) => send({ progress }),
      shouldStop: () => signal.aborted,
    })
    send({ summary, stopped: signal.aborted })
  })
})

// --- 三层长记忆（world_bible / character_sheets / plot_ledger）---

// POST /novel/dramas/:id/memory/init
app.post('/dramas/:id/memory/init', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const pack = await requireNovelDrama(id, user.id)
  if (!pack) return notFound(c, '小说项目不存在')
  const meta = parseNovelMetadata(pack.metadata)
  const mgr = new NovelMemoryManager(id)
  const result = mgr.init({
    outline: meta.outline,
    premise: meta.premise,
    title: pack.title,
  })
  return success(c, { ...result, paths: novelMemoryPaths(id) })
})

// GET /novel/dramas/:id/memory
app.get('/dramas/:id/memory', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  const mgr = new NovelMemoryManager(id)
  if (!NovelMemoryManager.exists(id)) {
    return success(c, { initialized: false, paths: novelMemoryPaths(id) })
  }
  return success(c, {
    initialized: true,
    paths: novelMemoryPaths(id),
    anchor: readAnchor(id) || null,
    world_bible: mgr.readWorld(),
    character_sheets: mgr.readChars(),
    plot_ledger: mgr.readPlot(),
  })
})

// PUT /novel/dramas/:id/memory/:file
app.put('/dramas/:id/memory/:file', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  const file = c.req.param('file') as 'world_bible' | 'character_sheets' | 'plot_ledger'
  if (!['world_bible', 'character_sheets', 'plot_ledger'].includes(file)) {
    return badRequest(c, '无效文件键')
  }
  const body = await c.req.json().catch(() => ({} as { content?: string }))
  if (typeof body.content !== 'string') return badRequest(c, '缺少 content')
  const mgr = new NovelMemoryManager(id)
  if (!NovelMemoryManager.exists(id)) mgr.init()
  if (file === 'world_bible') mgr.writeWorld(body.content)
  else if (file === 'character_sheets') mgr.writeChars(body.content)
  else mgr.writePlot(body.content)
  return success(c, { saved: file })
})

// POST /novel/dramas/:id/memory/brief — 生成创作提示词
app.post('/dramas/:id/memory/brief', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const pack = await requireNovelDrama(id, user.id)
  if (!pack) return notFound(c, '小说项目不存在')
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const chapter = Number(body.chapter)
  const vol = body.vol != null ? Number(body.vol) : undefined
  if (!Number.isFinite(chapter) || chapter < 1) return badRequest(c, '无效 chapter')
  const meta = parseNovelMetadata(pack.metadata)
  const mgr = new NovelMemoryManager(id)
  if (!NovelMemoryManager.exists(id)) {
    mgr.init({ outline: meta.outline, premise: meta.premise, title: pack.title })
  }
  const resolvedVol = vol ?? mgr.resolveVol(chapter, meta.outline)
  const title = typeof body.title === 'string' ? body.title : undefined
  const brief = typeof body.brief === 'string' ? body.brief : undefined
  const prompt = await mgr.buildChapterPrompt({
    vol: resolvedVol,
    chapter,
    title,
    brief,
    outline: meta.outline,
  })
  const outPath = `${novelMemoryPaths(id).root}/prompt_vol${resolvedVol}_ch${chapter}.txt`
  fs.writeFileSync(outPath, prompt, 'utf-8')
  return success(c, { prompt, path: outPath, vol: resolvedVol, chapter })
})

// POST /novel/dramas/:id/memory/review
app.post('/dramas/:id/memory/review', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const vol = Number(body.vol) || 1
  const lastChapter = Number(body.last_chapter)
  if (!Number.isFinite(lastChapter) || lastChapter < 1) return badRequest(c, '无效 last_chapter')
  const mgr = new NovelMemoryManager(id)
  if (!NovelMemoryManager.exists(id)) return badRequest(c, '长记忆未初始化')
  const issues = await mgr.review(vol, lastChapter)
  return success(c, { issues, passed: issues.length === 0 })
})

// POST /novel/dramas/:id/memory/snapshot
app.post('/dramas/:id/memory/snapshot', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const vol = Number(body.vol) || 1
  const mgr = new NovelMemoryManager(id)
  if (!NovelMemoryManager.exists(id)) return badRequest(c, '长记忆未初始化')
  const path = mgr.snapshot(vol)
  return success(c, { path })
})

// GET /novel/dramas/:id/memory/anchor
app.get('/dramas/:id/memory/anchor', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  return success(c, { anchor: readAnchor(id) || null, path: novelMemoryPaths(id).anchor })
})

// PUT /novel/dramas/:id/memory/anchor
app.put('/dramas/:id/memory/anchor', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!await requireNovelDrama(id, user.id)) return notFound(c, '小说项目不存在')
  const body = await c.req.json().catch(() => ({} as { anchor?: string }))
  if (typeof body.anchor !== 'string' || !body.anchor.trim()) return badRequest(c, '缺少 anchor 一行文本')
  writeAnchor(id, body.anchor)
  return success(c, { anchor: body.anchor.trim() })
})

export default app
