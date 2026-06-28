/**
 * 火火 — 场景 HTTP 路由
 */
import { Hono } from 'hono'
import { success, created, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { dramaOwnedByUser, episodeAndDramaForUser, sceneDramaForUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  enqueueSceneBackdrop,
  insertSceneRecord,
  patchSceneRecord,
  removeSceneRecord,
} from '../../services/drama/scene-route-service.js'

const sceneRouter = new Hono()

sceneRouter.post('/', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const payload = await ctx.req.json()

  if (!payload.drama_id || !(await dramaOwnedByUser(Number(payload.drama_id), authUser.id))) {
    return notFound(ctx, '剧本不存在')
  }
  if (payload.episode_id) {
    const epPack = await episodeAndDramaForUser(Number(payload.episode_id), authUser.id)
    if (!epPack) return notFound(ctx, 'Episode not found')
    if (epPack.episode.dramaId !== Number(payload.drama_id)) {
      return badRequest(ctx, 'episode 与 drama 不匹配')
    }
  }

  return created(ctx, await insertSceneRecord(payload))
})

sceneRouter.put('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const sceneId = Number(ctx.req.param('id'))
  if (!(await sceneDramaForUser(sceneId, authUser.id))) return notFound(ctx, 'Scene not found')
  await patchSceneRecord(sceneId, await ctx.req.json())
  return success(ctx)
})

sceneRouter.post('/:id/generate-image', async (ctx) => {
  const authUser = getAuthUser(ctx)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }

  const sceneId = Number(ctx.req.param('id'))
  const scenePack = await sceneDramaForUser(sceneId, authUser.id)
  if (!scenePack) return notFound(ctx, 'Scene not found')

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), authUser.id)
  if (!epPack) return notFound(ctx, 'Episode not found')
  if (epPack.episode.dramaId !== scenePack.scene.dramaId) {
    return badRequest(ctx, 'episode 与场景不属于同一项目')
  }

  try {
    const result = await enqueueSceneBackdrop({
      userId: authUser.id,
      userRole: authUser.role,
      sceneId,
      dramaId: scenePack.scene.dramaId,
      episodeId: epPack.episode.id,
      location: scenePack.scene.location,
      time: scenePack.scene.time,
      prompt: scenePack.scene.prompt,
      dramaImageConfigId: epPack.episode.dramaImageConfigId,
      episodeMetadata: epPack.episode.metadata,
      size: body.size,
      aspectRatio: body.aspect_ratio,
    })
    return success(ctx, result)
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

sceneRouter.delete('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const sceneId = Number(ctx.req.param('id'))
  if (!(await sceneDramaForUser(sceneId, authUser.id))) return notFound(ctx, 'Scene not found')
  await removeSceneRecord(sceneId)
  return success(ctx)
})

export default sceneRouter
