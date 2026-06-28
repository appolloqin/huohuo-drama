import { Hono } from 'hono'
import { success, badRequest, notFound, created } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { dramaOwnedByUser } from '../../services/drama/drama-access-service.js';
import * as dramaCatalog from '../../services/drama/drama-catalog-service.js'
import * as templateCatalog from '../../services/template/template-catalog-service.js'
import {
  cloneDramaFromTemplate,
  createAndPublishTemplateFromText,
  createAndPublishTemplateFromUrl,
  publishProjectAsTemplate,
} from '../../services/template/project-template.js'
import { fetchPageContentFromUrl } from '../../services/template/url-content-service.js'

const app = new Hono()

app.get('/', async (c) => {
  const result = await templateCatalog.listPublishedTemplates({
    projectType: c.req.query('project_type'),
    keyword: (c.req.query('keyword') || '').trim(),
  })
  return success(c, result)
})

app.post('/create', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({}))
  const source = typeof body.source === 'string' ? body.source.trim() : ''
  const summary = typeof body.template_summary === 'string' ? body.template_summary.trim() : ''
  if (summary.length > 2000) return badRequest(c, '模板说明过长')

  try {
    if (source === 'project') {
      const dramaId = Number(body.drama_id)
      if (!dramaId) return badRequest(c, '请选择项目')
      if (!(await dramaOwnedByUser(dramaId, user.id))) return notFound(c, '项目不存在')
      await publishProjectAsTemplate(dramaId, user.id, summary)
      const drama = await templateCatalog.findDramaSnapshot(dramaId)
      if (!drama) return badRequest(c, '创建失败')
      return created(c, drama)
    }

    const projectType = body.project_type === 'novel' ? 'novel' : 'drama'

    if (source === 'url') {
      const url = typeof body.url === 'string' ? body.url.trim() : ''
      if (!url) return badRequest(c, '请输入链接地址')
      const title = typeof body.title === 'string' ? body.title.trim() : undefined
      const id = await createAndPublishTemplateFromUrl({
        userId: user.id,
        url,
        projectType,
        title,
        templateSummary: summary,
      })
      const drama = await templateCatalog.findDramaSnapshot(id)
      if (!drama) return badRequest(c, '创建失败')
      return created(c, drama)
    }

    if (source === 'manual') {
      const title = typeof body.title === 'string' ? body.title.trim() : ''
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      if (!title) return badRequest(c, '请输入模板标题')
      if (!content) return badRequest(c, '请输入正文内容')
      if (content.length > 200000) return badRequest(c, '内容过长（最多 20 万字）')
      const genre = typeof body.genre === 'string' ? body.genre.trim() : undefined
      const id = await createAndPublishTemplateFromText({
        userId: user.id,
        title,
        projectType,
        templateSummary: summary,
        description: typeof body.description === 'string' ? body.description.trim() : undefined,
        genre,
        rawText: content,
      })
      const drama = await templateCatalog.findDramaSnapshot(id)
      if (!drama) return badRequest(c, '创建失败')
      return created(c, drama)
    }

    return badRequest(c, '无效的创建方式')
  } catch (err: any) {
    return badRequest(c, err.message || '创建失败')
  }
})

app.post('/fetch-url', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!url) return badRequest(c, '请输入链接地址')
  try {
    const { title, text } = await fetchPageContentFromUrl(url)
    return success(c, { title, text, char_count: text.replace(/\s/g, '').length })
  } catch (err: any) {
    return badRequest(c, err.message || '提取失败')
  }
})

app.post('/publish/:dramaId', async (c) => {
  const user = getAuthUser(c)
  const dramaId = Number(c.req.param('dramaId'))
  if (!(await dramaOwnedByUser(dramaId, user.id))) return notFound(c, '项目不存在')

  const body = await c.req.json().catch(() => ({}))
  const summary = typeof body.template_summary === 'string' ? body.template_summary.trim() : ''
  if (summary.length > 2000) return badRequest(c, '模板说明过长')

  try {
    await publishProjectAsTemplate(dramaId, user.id, summary)
    return success(c, { is_template: true, template_summary: summary })
  } catch (err: any) {
    return badRequest(c, err.message || '发布失败')
  }
})

app.post('/unpublish/:dramaId', async (c) => {
  const user = getAuthUser(c)
  const dramaId = Number(c.req.param('dramaId'))
  if (!(await dramaOwnedByUser(dramaId, user.id))) return notFound(c, '项目不存在')

  await templateCatalog.unpublishTemplate(dramaId)
  return success(c, { is_template: false })
})

app.delete('/:id', async (c) => {
  const user = getAuthUser(c)
  if (user.role !== 'admin') return c.json({ code: 403, message: '仅管理员可操作' }, 403)
  const id = Number(c.req.param('id'))
  if (!id) return badRequest(c, '无效的模板 id')
  try {
    const result = await templateCatalog.deleteTemplate(id)
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message || '删除失败')
  }
})

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const payload = await templateCatalog.getPublishedTemplateDetail(id)
  if (!payload) return notFound(c, '模板不存在')
  return success(c, payload)
})

app.post('/:id/use', async (c) => {
  const user = getAuthUser(c)
  const id = Number(c.req.param('id'))
  try {
    const newId = await cloneDramaFromTemplate(id, user.id)
    const drama = await dramaCatalog.getProjectById(newId)
    if (!drama) return badRequest(c, '创建失败')
    return created(c, drama)
  } catch (err: any) {
    return badRequest(c, err.message || '创建失败')
  }
})

export default app
