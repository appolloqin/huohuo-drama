import { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import { extractLessonsFromProject } from '../../services/lesson/lesson-extract.js'
import {
  GenerationLessonValidationError,
  batchCreateGenerationLessons,
  createGenerationLesson,
  deleteGenerationLesson,
  getGenerationLesson,
  listGenerationLessons,
  updateGenerationLesson,
} from '../../services/lesson/generation-lesson-service.js'

const app = new Hono()

function mapLessonError(c: Parameters<typeof badRequest>[0], err: unknown) {
  if (err instanceof GenerationLessonValidationError) return badRequest(c, err.message)
  throw err
}

app.get('/', async (c) => {
  const items = await listGenerationLessons({
    projectKind: c.req.query('project_kind'),
    agentType: c.req.query('agent_type'),
    verdict: c.req.query('verdict') as 'recommend' | 'avoid' | undefined,
  })
  return success(c, items)
})

app.post('/extract', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json()
  const dramaId = Number(body.drama_id)
  if (!dramaId) return badRequest(c, 'drama_id required')
  try {
    const result = await extractLessonsFromProject({
      dramaId,
      userId: user.id,
      hint: typeof body.hint === 'string' ? body.hint : undefined,
      maxItems: Number(body.max_items) || undefined,
    })
    return success(c, result)
  } catch (err: any) {
    return badRequest(c, err.message || '提取失败')
  }
})

app.post('/batch', async (c) => {
  const body = await c.req.json()
  const items = Array.isArray(body.lessons) ? body.lessons : []
  try {
    return success(c, await batchCreateGenerationLessons(items))
  } catch (err) {
    return mapLessonError(c, err)
  }
})

app.get('/:id', async (c) => {
  const row = await getGenerationLesson(Number(c.req.param('id')))
  if (!row) return notFound(c, 'Not found')
  return success(c, row)
})

app.post('/', async (c) => {
  const body = await c.req.json()
  try {
    return success(c, await createGenerationLesson(body))
  } catch (err) {
    return mapLessonError(c, err)
  }
})

app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  try {
    return success(c, await updateGenerationLesson(id, body))
  } catch (err) {
    return mapLessonError(c, err)
  }
})

app.delete('/:id', async (c) => {
  await deleteGenerationLesson(Number(c.req.param('id')))
  return success(c)
})

export default app
