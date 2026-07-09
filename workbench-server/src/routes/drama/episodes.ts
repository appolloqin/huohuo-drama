import { Hono } from 'hono'
import { success, notFound, badRequest } from '../../common/http/response.js'
import { toSnakeCaseArray } from '../../common/http/transform.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { dramaOwnedByUser, episodeAndDramaForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import * as episodeService from '../../services/drama/episode-service.js'

const episodeUnitRouter = new Hono()

episodeUnitRouter.get('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const payload = await episodeService.getOwnedEpisodeById(authUser.id, id)
  if (!payload) return notFound(c, 'Episode not found')
  return success(c, payload)
})

episodeUnitRouter.post('/', async (c) => {
  const authUser = getAuthUser(c)
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id required')
  if (!(await dramaOwnedByUser(Number(body.drama_id), authUser.id))) return notFound(c, '剧本不存在')
  if (!body.drama_image_config_id || !body.drama_video_config_id || !body.drama_audio_config_id) {
    return badRequest(c, 'drama_image_config_id, drama_video_config_id and drama_audio_config_id are required')
  }
  try {
    return success(c, await episodeService.createEpisodeForDrama(body))
  } catch (err: any) {
    return badRequest(c, err.message || '创建分集失败')
  }
})

episodeUnitRouter.put('/:id', async (c) => {
  const authUser = getAuthUser(c)
  const id = Number(c.req.param('id'))
  const ownedEpisode = await episodeAndDramaForUser(id, authUser.id)
  if (!ownedEpisode) return notFound(c, 'Episode not found')
  const body = await c.req.json()
  try {
    await episodeService.updateOwnedEpisode(id, ownedEpisode, body)
    return success(c)
  } catch (err: any) {
    return badRequest(c, err.message || '更新失败')
  }
})

episodeUnitRouter.post('/:id/generate-content', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const id = Number(c.req.param('id'))
  const ownedEpisode = await episodeAndDramaForUser(id, authUser.id)
  if (!ownedEpisode) return notFound(c, 'Episode not found')

  const body = await c.req.json().catch(() => ({}))
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) return badRequest(c, 'prompt 不能为空')
  if (prompt.length > 4000) return badRequest(c, '提示过长（最多 4000 字）')

  logTaskStart('Episode', 'generate-content', { episodeId: id, dramaId: ownedEpisode.episode.dramaId, promptLen: prompt.length })
  try {
    const content = await episodeService.generateEpisodeContent(id, ownedEpisode, prompt, {
      userId: authUser.id,
      role: authUser.role,
    })
    logTaskSuccess('Episode', 'generate-content', { episodeId: id, wordCount: content.length })
    return success(c, { content })
  } catch (err: any) {
    logTaskError('Episode', 'generate-content', { episodeId: id, error: err.message })
    return badRequest(c, err.message || '生成失败')
  }
})

episodeUnitRouter.get('/:id/characters', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
  const castRows = await episodeService.listEpisodeCastRows(episodeId)
  return success(c, toSnakeCaseArray(castRows))
})

episodeUnitRouter.get('/:id/scenes', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
  const scenes = await episodeService.listEpisodeScenes(episodeId)
  return success(c, toSnakeCaseArray(scenes))
})

episodeUnitRouter.get('/:id/character-forms', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
  const forms = await episodeService.listEpisodeCharacterForms(episodeId)
  return success(c, toSnakeCaseArray(forms))
})

episodeUnitRouter.get('/:id/props', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
  const props = await episodeService.listEpisodeProps(episodeId)
  return success(c, toSnakeCaseArray(props))
})

episodeUnitRouter.get('/:episode_id/storyboards', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('episode_id'))
  if (!(await episodeAndDramaForUser(episodeId, authUser.id))) return notFound(c, 'Episode not found')
  const payload = await episodeService.assembleEpisodeStoryboardPayload(episodeId)
  return success(c, payload)
})

episodeUnitRouter.get('/:id/pipeline-status', async (c) => {
  const authUser = getAuthUser(c)
  const episodeId = Number(c.req.param('id'))
  const ownedEpisode = await episodeAndDramaForUser(episodeId, authUser.id)
  if (!ownedEpisode) return notFound(c, 'Episode not found')
  const snapshot = await episodeService.composeEpisodePipelineSnapshot(episodeId, ownedEpisode.episode)
  return success(c, snapshot)
})

export default episodeUnitRouter
