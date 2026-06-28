import { Hono } from 'hono'
import { success, notFound } from '../../common/http/response.js'
import { requireSiteAuth } from '../../middleware/site-auth.js'
import {
  getShowcaseEntries,
  getShowcaseImageById,
  getShowcaseMedia,
  getShowcaseMediaByIndustry,
  getShowcaseVideoById,
  listKnownIndustrySlugs,
} from '../../services/showcase/showcase-service.js'

const app = new Hono()

app.use('*', requireSiteAuth)

app.get('/media', async (c) => {
  const imageLimit = Math.min(Math.max(Number(c.req.query('image_limit') || 6), 1), 24)
  const videoLimit = Math.min(Math.max(Number(c.req.query('video_limit') || 3), 1), 12)
  return success(c, await getShowcaseMedia(imageLimit, videoLimit))
})

/** 全量已完成条目 ID（供 sitemap / 预渲染路由） */
app.get('/entries', async (c) => {
  return success(c, await getShowcaseEntries())
})

/** 已知行业 slug 列表（供 site 端动态落地页的 prerender 路径生成） */
app.get('/industries', async (c) => {
  return success(c, { industries: listKnownIndustrySlugs() })
})

/**
 * 单行业 showcase feed。SQL 端按行业关键词 OR-LIKE 过滤，不再回 Node 推断。
 * image_limit / video_limit 默认 12 / 6，最大 24 / 12，与 /media 对齐。
 */
app.get('/industry/:slug', async (c) => {
  const slug = c.req.param('slug')
  const imageLimit = Math.min(Math.max(Number(c.req.query('image_limit') || 12), 1), 24)
  const videoLimit = Math.min(Math.max(Number(c.req.query('video_limit') || 6), 1), 12)
  try {
    const data = await getShowcaseMediaByIndustry(slug, imageLimit, videoLimit)
    return success(c, data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.startsWith('Unknown industry slug')) return notFound(c, msg)
    throw err
  }
})

app.get('/image/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return notFound(c, 'Not found')
  const item = await getShowcaseImageById(id)
  if (!item) return notFound(c, 'Not found')
  return success(c, item)
})

app.get('/video/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return notFound(c, 'Not found')
  const item = await getShowcaseVideoById(id)
  if (!item) return notFound(c, 'Not found')
  return success(c, item)
})

export default app
