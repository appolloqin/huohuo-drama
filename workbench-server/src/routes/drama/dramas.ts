import { Hono } from 'hono'
import { success, badRequest, notFound, created } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import { getDramaStyleCatalog } from '../../common/drama/drama-style.js'
import { isNovelProject } from '../../common/novel/novel-meta.js'
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import { sseResponse } from '../../common/http/sse-stream.js'
import { batchGenerateDramaEpisodes } from '../../services/batch/batch-generation.js'
import type { EpisodeListFilter } from '../../services/drama/episode-service.js'
import * as episodeService from '../../services/drama/episode-service.js'
import * as dramaCatalog from '../../services/drama/drama-catalog-service.js'
import { generateDramaSynopsis } from '../../services/drama/drama-synopsis.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import type { TextBillingContext } from '../../services/ai/ai.js'

function dramaTextBilling(
  user: { id: number; role?: string },
  reason: string,
): TextBillingContext {
  return {
    userId: user.id,
    role: user.role,
    reason,
    resourceType: 'drama',
  }
}

const projectCatalogRouter = new Hono()

projectCatalogRouter.get('/', async (c) => {
  const authUser = getAuthUser(c)
  const result = await dramaCatalog.listUserProjects({
    userId: authUser.id,
    page: Number(c.req.query('page') || 1),
    pageSize: Number(c.req.query('page_size') || 20),
    status: c.req.query('status'),
    keyword: c.req.query('keyword'),
    projectType: c.req.query('project_type'),
  })
  return success(c, result)
})

projectCatalogRouter.post('/', async (c) => {
  const authUser = getAuthUser(c)
  const body = await c.req.json()
  try {
    return created(c, await dramaCatalog.createUserProject(authUser.id, body))
  } catch (err: any) {
    return badRequest(c, err.message || '创建项目失败')
  }
})

projectCatalogRouter.get('/stats', async (c) => {
  const authUser = getAuthUser(c)
  return success(c, await dramaCatalog.getUserProjectStats(authUser.id))
})

projectCatalogRouter.get('/styles', async (c) => {
  return success(c, getDramaStyleCatalog())
})

projectCatalogRouter.post('/generate-synopsis', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const body = await c.req.json().catch(() => ({}))
  const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : ''
  if (!keywords) return badRequest(c, '关键词不能为空')
  if (keywords.length > 500) return badRequest(c, '关键词过长（最多 500 字）')

  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  const style = typeof body.style === 'string' ? body.style.trim() : undefined
  const totalEpisodes = Number(body.total_episodes) || undefined

  logTaskStart('Drama', 'generate-synopsis', { keywordLen: keywords.length })
  try {
    const synopsis = await generateDramaSynopsis(
      { title, keywords, style, totalEpisodes },
      dramaTextBilling(authUser, '短剧简介生成'),
    )
    logTaskSuccess('Drama', 'generate-synopsis', { len: synopsis.length })
    return success(c, { synopsis })
  } catch (err: any) {
    logTaskError('Drama', 'generate-synopsis', { error: err.message })
    return badRequest(c, err.message || '生成简介失败')
  }
})

projectCatalogRouter.get('/:id/episodes/:episodeNumber', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  const episodeNumber = Number(c.req.param('episodeNumber'))
  const payload = await episodeService.getOwnedEpisodeByNumber(authUser.id, dramaId, episodeNumber)
  if (!payload) return notFound(c, '分集不存在')
  return success(c, payload)
})

projectCatalogRouter.get('/:id/episodes', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  const filterRaw = c.req.query('filter') || 'all'
  const listFilter: EpisodeListFilter = ['all', 'written', 'pending'].includes(filterRaw)
    ? filterRaw as EpisodeListFilter
    : 'all'
  const result = await dramaCatalog.listOwnedProjectEpisodes(authUser.id, dramaId, {
    page: Number(c.req.query('page') || 1),
    pageSize: Number(c.req.query('page_size') || 20),
    filter: listFilter,
  })
  if (!result) return notFound(c, '剧本不存在')

  return success(c, {
    items: result.items,
    pagination: result.pagination,
    stats: result.stats,
  })
})

projectCatalogRouter.get('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  const payload = await dramaCatalog.getOwnedProjectDetail(
    authUser.id,
    dramaId,
    c.req.query('include_episodes') !== '0',
    c.req.query('include_assets') !== '0',
  )
  if (!payload) return notFound(c, '剧本不存在')
  return success(c, payload)
})

projectCatalogRouter.put('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  if (!(await dramaCatalog.updateOwnedProjectMetadata(authUser.id, dramaId, body))) {
    return notFound(c, '剧本不存在')
  }
  return success(c)
})

projectCatalogRouter.delete('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  if (!(await dramaCatalog.deleteOwnedProject(authUser.id, dramaId))) {
    return notFound(c, '剧本不存在')
  }
  return success(c)
})

projectCatalogRouter.put('/:id/characters', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  if (!(await dramaCatalog.saveOwnedProjectCharacters(authUser.id, dramaId, body.characters || []))) {
    return notFound(c, '剧本不存在')
  }
  return success(c)
})

projectCatalogRouter.put('/:id/episodes', async (c) => {
  const authUser = getAuthUser(c)
  const dramaId = Number(c.req.param('id'))
  const body = await c.req.json()
  if (!(await dramaCatalog.saveOwnedProjectEpisodes(authUser.id, dramaId, body.episodes || []))) {
    return notFound(c, '剧本不存在')
  }
  return success(c)
})

projectCatalogRouter.post('/:id/generate-remaining/stream', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const dramaId = Number(c.req.param('id'))
  const drama = await dramaCatalog.requireOwnedProject(authUser.id, dramaId)
  if (!drama) return notFound(c, '剧本不存在')
  if (isNovelProject(drama)) return badRequest(c, '小说项目请使用小说批量生成接口')

  return sseResponse(c, async (emit) => {
    const signal = c.req.raw.signal
    const summary = await batchGenerateDramaEpisodes({
      dramaId,
      userId: authUser.id,
      userRole: authUser.role,
      onProgress: (progress) => emit({ progress }),
      shouldStop: () => signal.aborted,
    })
    emit({ summary, stopped: signal.aborted })
  })
})

export default projectCatalogRouter
