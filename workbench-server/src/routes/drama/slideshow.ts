import { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { episodeAndDramaForUser, storyboardEpisodeForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  getEpisodeSlideshowStatus,
  renderSingleStoryboardSlideshow,
  startEpisodeBatchSlideshow,
} from '../../services/drama/slideshow-batch-service.js'
import { formatFfmpegError } from '../../common/media/ffmpeg-path.js'

const app = new Hono()

app.post('/storyboards/:id/slideshow', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const id = Number(c.req.param('id'))
  if (!(await storyboardEpisodeForUser(id, authUser.id))) return notFound(c, '镜头不存在')

  try {
    return success(c, await renderSingleStoryboardSlideshow(id))
  } catch (err: any) {
    return badRequest(c, formatFfmpegError(err))
  }
})

app.post('/episodes/:id/slideshow-all', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')

  try {
    const result = await startEpisodeBatchSlideshow(episodeId)
    if (!result.ok) return badRequest(c, result.error)
    return success(c, { message: result.message, total: result.total })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.get('/episodes/:id/slideshow-status', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
  return success(c, await getEpisodeSlideshowStatus(episodeId))
})

export default app
