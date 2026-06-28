import type { Context } from 'hono'
import { badRequest, notFound } from '../http/response.js'
import { getAuthUser } from '../auth/http-auth.js';
import { dramaOwnedByUser, storyboardEpisodeForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'

export type ScopeCheckResult =
  | { kind: 'ok' }
  | { kind: 'not_found'; message: string }
  | { kind: 'bad_request'; message: string }

export async function auditGenerationScope(
  userId: number,
  input: { prompt?: string; storyboard_id?: number; drama_id?: number },
): Promise<ScopeCheckResult> {
  if (!input.prompt) return { kind: 'bad_request', message: 'prompt is required' }

  if (input.storyboard_id) {
    if (!(await storyboardEpisodeForUser(Number(input.storyboard_id), userId))) {
      return { kind: 'not_found', message: '镜头不存在' }
    }
    return { kind: 'ok' }
  }

  if (input.drama_id) {
    if (!(await dramaOwnedByUser(Number(input.drama_id), userId))) {
      return { kind: 'not_found', message: '剧本不存在' }
    }
    return { kind: 'ok' }
  }

  return { kind: 'bad_request', message: '需要 storyboard_id 或 drama_id' }
}

export async function auditListScope(
  userId: number,
  filters: { storyboardId?: string; dramaId?: string },
): Promise<ScopeCheckResult> {
  if (!filters.storyboardId && !filters.dramaId) {
    return { kind: 'bad_request', message: '请指定 storyboard_id 或 drama_id' }
  }
  if (filters.storyboardId && !(await storyboardEpisodeForUser(Number(filters.storyboardId), userId))) {
    return { kind: 'not_found', message: '镜头不存在' }
  }
  if (filters.dramaId && !(await dramaOwnedByUser(Number(filters.dramaId), userId))) {
    return { kind: 'not_found', message: '剧本不存在' }
  }
  return { kind: 'ok' }
}

export function respondScopeViolation(c: Context, result: ScopeCheckResult) {
  if (result.kind === 'not_found') return notFound(c, result.message)
  if (result.kind === 'bad_request') return badRequest(c, result.message)
  return badRequest(c, 'invalid scope')
}

export async function ensureCanGenerate(c: Context): Promise<
  { ok: true; userId: number; role: string } | { ok: false; response: Response }
> {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
    return { ok: true, userId: authUser.id, role: authUser.role }
  } catch (err: any) {
    return { ok: false, response: badRequest(c, err.message) }
  }
}

export function numericFilters(query: {
  storyboardId?: string
  dramaId?: string
  page?: number
  pageSize?: number
}) {
  return {
    storyboardId: query.storyboardId ? Number(query.storyboardId) : undefined,
    dramaId: query.dramaId ? Number(query.dramaId) : undefined,
    page: query.page,
    pageSize: query.pageSize,
  }
}
