import * as dramasRepo from '../../db/repos/dramas/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as usersRepo from '../../db/repos/users/index.js'
import type { DramaRow } from '../../db/repos/types.js'
import { isNovelProject } from './novel-meta.js'
import { countNovelChars } from './novel-char-limit.js'

export type NovelImportSourceKind = 'own' | 'template' | 'platform'

async function authorName(userId: number | null | undefined): Promise<string> {
  if (!userId) return '用户'
  const u = await usersRepo.findUserById(userId)
  return u?.username || '用户'
}

export async function novelImportAccessible(
  dramaId: number,
  userId: number,
  role?: string,
): Promise<{ drama: DramaRow; source: NovelImportSourceKind } | null> {
  const drama = await dramasRepo.findDramaById(dramaId)
  if (!drama || drama.deletedAt || !isNovelProject(drama)) return null

  if (role === 'admin') {
    const source: NovelImportSourceKind = drama.isTemplate
      ? 'template'
      : (drama.userId === userId ? 'own' : 'platform')
    return { drama, source }
  }
  if (drama.isTemplate) return { drama, source: 'template' }
  if (drama.userId === userId) return { drama, source: 'own' }
  return null
}

export async function listNovelImportSources(
  userId: number,
  role?: string,
  keyword = '',
  page = 1,
  pageSize = 20,
) {
  // Push role-based visibility, project_type='novel' filter, keyword match,
  // and pagination into SQL so we never materialize the user's full project
  // set (or every published template) on the server. The chapter-stats
  // enrichment is bounded to the page (pageSize) rows.
  const { items: pageRows, total } = await dramasRepo.listNovelImportSourcesPage({
    viewerUserId: userId,
    isAdmin: role === 'admin',
    keyword,
    page,
    pageSize,
  })

  const items: Array<{
    id: number
    title: string
    source: NovelImportSourceKind
    author_name: string
    chapter_count: number
    filled_chapter_count: number
    updated_at: string
  }> = []

  for (const d of pageRows) {
    const source: NovelImportSourceKind = d.scope
    const eps = await dramasRepo.listActiveEpisodesByDrama(d.id)
    const filled = eps.filter(e => (e.content || '').trim().length > 0).length

    items.push({
      id: d.id,
      title: d.title,
      source,
      author_name: await authorName(d.userId),
      chapter_count: eps.length,
      filled_chapter_count: filled,
      updated_at: d.updatedAt,
    })
  }

  // pageRows already comes back ordered by updated_at desc from the SQL
  // layer, so no in-memory sort is needed.
  return {
    items,
    pagination: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

export async function buildNovelImportContent(
  dramaId: number,
  mode: 'chapter' | 'full',
  episodeNumber: number,
): Promise<{
  content: string
  mode: 'chapter' | 'full'
  char_count: number
  chapter_number?: number
  chapter_title?: string
  chapter_count?: number
}> {
  const eps = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  if (mode === 'chapter') {
    const ep = eps.find(e => e.episodeNumber === episodeNumber)
    const content = ep?.content?.trim() || ''
    if (!content) {
      throw new Error(`第 ${episodeNumber} 章暂无正文，可尝试导入全书或先撰写小说章节`)
    }
    return {
      content,
      mode: 'chapter',
      char_count: countNovelChars(content),
      chapter_number: ep!.episodeNumber,
      chapter_title: ep!.title,
    }
  }

  const parts = eps
    .filter(e => (e.content || '').trim().length > 0)
    .map(e => {
      const title = e.title?.trim() || `第${e.episodeNumber}章`
      return `${title}\n\n${e.content!.trim()}`
    })
  if (!parts.length) throw new Error('该小说暂无章节正文')
  const content = parts.join('\n\n')
  return {
    content,
    mode: 'full',
    char_count: countNovelChars(content),
    chapter_count: parts.length,
  }
}

export async function listNovelImportChapters(dramaId: number) {
  const eps = await episodesRepo.listSiblingEpisodesOrdered(dramaId)
  return eps.map(ep => {
    const content = ep.content?.trim() || ''
    return {
      chapter_number: ep.episodeNumber,
      title: ep.title || `第${ep.episodeNumber}章`,
      char_count: countNovelChars(content),
      has_content: content.length > 0,
    }
  })
}
