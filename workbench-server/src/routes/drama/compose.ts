import { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { episodeAndDramaForUser, storyboardEpisodeForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  composeSingleStoryboard,
  getEpisodeComposeStatus,
  startEpisodeBatchCompose,
} from '../../services/drama/compose-batch-service.js'
import { parseMotionPipelineQuery } from '../../common/drama/episode-meta.js'
import { formatFfmpegError } from '../../common/media/ffmpeg-path.js'

const app = new Hono()

app.post('/storyboards/:id/compose', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const id = Number(c.req.param('id'))
  if (!(await storyboardEpisodeForUser(id, authUser.id))) return notFound(c, '镜头不存在')

  try {
    const motionPipeline = parseMotionPipelineQuery(c.req.query('motion_pipeline'))
    return success(c, await composeSingleStoryboard(id, motionPipeline))
  } catch (err: any) {
    return badRequest(c, formatFfmpegError(err))
  }
})

app.post('/episodes/:id/compose-all', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')

  const motionPipeline = parseMotionPipelineQuery(c.req.query('motion_pipeline'))
  const result = await startEpisodeBatchCompose(episodeId, motionPipeline)
  if (!result.ok) return badRequest(c, result.error)
  return success(c, { message: result.message, total: result.total })
})

app.get('/episodes/:id/compose-status', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Yeah Episode not found')
  const motionPipeline = parseMotionPipelineQuery(c.req.query('motion_pipeline'))
  return success(c, await getEpisodeComposeStatus(episodeId, motionPipeline))
})

export default app
