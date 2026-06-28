import { Hono } from 'hono'
import { success, created, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { episodeAndDramaForUser, storyboardEpisodeForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  createStoryboardRecord,
  removeStoryboardRecord,
  synthesizeStoryboardTTS,
  updateStoryboardRecord,
} from '../../services/drama/storyboard-route-service.js'

const app = new Hono()

app.post('/', async (c) => {
  const authUser = getAuthUser(c)
  const body = await c.req.json()
  if (!(await episodeAndDramaForUser(Number(body.episode_id), authUser.id))) {
    return notFound(c, 'Episode not found')
  }
  const payload = await createStoryboardRecord(body)
  return created(c, payload)
})

app.put('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const access = await storyboardEpisodeForUser(id, authUser.id)
  if (!access) return notFound(c, '镜头不存在')

  const body = await c.req.json()
  await updateStoryboardRecord(id, access.storyboard.episodeId, access.storyboard.sceneId, body)
  return success(c)
})

app.post('/:id/generate-tts', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const id = Number(c.req.param('id'))
  const access = await storyboardEpisodeForUser(id, authUser.id)
  if (!access) return notFound(c, '镜头不存在')

  try {
    const payload = await synthesizeStoryboardTTS(access.storyboard)
    return success(c, payload)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.delete('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!(await storyboardEpisodeForUser(id, authUser.id))) return notFound(c, '镜头不存在')
  await removeStoryboardRecord(id)
  return success(c)
})

export default app
