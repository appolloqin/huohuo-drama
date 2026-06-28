import type { Hono } from 'hono'
import { success, created, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import {
  auditGenerationScope,
  auditListScope,
  ensureCanGenerate,
  numericFilters,
  respondScopeViolation,
} from '../../common/drama/generation-route-kit.js'
import { logTaskError } from '../../common/task/task-logger.js'

interface GenerationRouteBindings<TRecord> {
  logTag: string
  resourceForUser: (id: number, userId: number) => Promise<TRecord | null | undefined>
  enqueue: (userId: number, role: string, body: Record<string, any>) => Promise<{ record: TRecord | undefined }>
  list: (filters: { storyboardId?: number; dramaId?: number; page?: number; pageSize?: number }) => TRecord[] | Promise<TRecord[]>
  count?: (filters: { storyboardId?: number; dramaId?: number }) => number | Promise<number>
  remove: (id: number) => void | Promise<void>
}

export async function registerGenerationRoutes<TRecord>(app: Hono, bindings: GenerationRouteBindings<TRecord>) {
  app.post('/', async (c) => {
    const gate = await ensureCanGenerate(c)
    if (!gate.ok) return gate.response

    const body = await c.req.json()
    const scope = await auditGenerationScope(gate.userId, body)
    if (scope.kind !== 'ok') return respondScopeViolation(c, scope)

    try {
      const { record } = await bindings.enqueue(gate.userId, gate.role, body)
      return created(c, record)
    } catch (err: any) {
      logTaskError(bindings.logTag, 'generate', { error: err.message })
      return badRequest(c, err.message)
    }
  })

  app.get('/', async (c) => {
    const authUser = getAuthUser(c)
    const storyboardId = c.req.query('storyboard_id')
    const dramaId = c.req.query('drama_id')
    const page = Math.max(1, Number(c.req.query('page') || 1))
    const pageSize = Math.max(1, Math.min(200, Number(c.req.query('page_size') || 50)))
    const scope = await auditListScope(authUser.id, { storyboardId, dramaId })
    if (scope.kind !== 'ok') return respondScopeViolation(c, scope)

    const filters = numericFilters({ storyboardId, dramaId, page, pageSize })
    const [items, total] = await Promise.all([
      bindings.list(filters),
      bindings.count ? bindings.count(filters) : Promise.resolve(undefined),
    ])
    return success(c, {
      items,
      pagination: { page, page_size: pageSize, total: total ?? items.length, total_pages: Math.max(1, Math.ceil((total ?? items.length) / pageSize)) },
    })
  })

  app.get('/:id', async (c) => {
    const authUser = getAuthUser(c)
    const id = Number(c.req.param('id'))
    return success(c, (await bindings.resourceForUser(id, authUser.id)) || null)
  })

  app.delete('/:id', async (c) => {
    const authUser = getAuthUser(c)
    const id = Number(c.req.param('id'))
    if (!(await bindings.resourceForUser(id, authUser.id))) return notFound(c, 'Not found')
    await bindings.remove(id)
    return success(c)
  })
}
