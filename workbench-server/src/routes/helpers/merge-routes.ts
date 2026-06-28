import type { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { episodeAndDramaForUser } from '../../services/drama/drama-access-service.js';
import { ensureCanGenerate } from '../../common/drama/generation-route-kit.js'
import {
  fetchEpisodeMergeStatus,
  triggerEpisodeMerge,
} from '../../services/drama/episode-merge-route-service.js'
import { parseMotionPipelineQuery } from '../../common/drama/episode-meta.js'

export async function attachEpisodeMergeRoutes(app: Hono) {
  app.post('/episodes/:id/merge', async (c) => {
    const gate = await ensureCanGenerate(c)
    if (!gate.ok) return gate.response

    const episodeId = Number(c.req.param('id'))
    const pack = await episodeAndDramaForUser(episodeId, gate.userId)
    if (!pack) return notFound(c, 'Episode not found')

    try {
      const motionPipeline = parseMotionPipelineQuery(c.req.query('motion_pipeline'))
      return success(c, await triggerEpisodeMerge(episodeId, pack.episode.dramaId, motionPipeline))
    } catch (err: any) {
      return badRequest(c, err.message)
    }
  })

  app.get('/episodes/:id/merge', async (c) => {
    const authUser = getAuthUser(c)
    const episodeId = Number(c.req.param('id'))
    if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
    const motionPipeline = parseMotionPipelineQuery(c.req.query('motion_pipeline'))
    const mergeIdRaw = c.req.query('merge_id')
    const mergeId = mergeIdRaw ? Number(mergeIdRaw) : undefined
    return success(c, await fetchEpisodeMergeStatus(episodeId, motionPipeline, mergeId))
  })
}
