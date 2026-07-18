/**
 * 火火 — 道具 HTTP 路由
 */
import { Hono } from 'hono'
import { success, created, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import {
  dramaOwnedByUser,
  episodeAndDramaForUser,
  propDramaForUser,
} from '../../services/drama/drama-access-service.js'
import { ensureCanGenerate } from '../../common/drama/generation-route-kit.js'
import * as propsRepo from '../../db/repos/props/index.js'
import {
  archiveProp,
  batchEnqueuePropImages,
  enqueuePropImage,
  insertPropRecord,
  patchPropRecord,
} from '../../services/drama/prop-route-service.js'

const propRouter = new Hono()

propRouter.get('/drama/:dramaId', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const dramaId = Number(ctx.req.param('dramaId'))
  if (!(await dramaOwnedByUser(dramaId, authUser.id))) return notFound(ctx, '剧本不存在')
  const characterId = ctx.req.query('character_id')
  let rows = await propsRepo.listActivePropsByDrama(dramaId)
  if (characterId) {
    rows = rows.filter(r => r.characterId === Number(characterId) || r.characterId == null)
  }
  return success(ctx, rows)
})

propRouter.post('/', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const body = await ctx.req.json()
  if (!body.drama_id || !(await dramaOwnedByUser(Number(body.drama_id), authUser.id))) {
    return notFound(ctx, '剧本不存在')
  }
  if (!body.name?.trim()) return badRequest(ctx, 'name 必填')
  try {
    return created(ctx, await insertPropRecord(body))
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

propRouter.put('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const propId = Number(ctx.req.param('id'))
  if (!(await propDramaForUser(propId, authUser.id))) return notFound(ctx, '道具不存在')
  await patchPropRecord(propId, await ctx.req.json())
  return success(ctx)
})

propRouter.delete('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const propId = Number(ctx.req.param('id'))
  if (!(await propDramaForUser(propId, authUser.id))) return notFound(ctx, '道具不存在')
  await archiveProp(propId)
  return success(ctx)
})

propRouter.post('/:id/generate-image', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const propId = Number(ctx.req.param('id'))
  const pack = await propDramaForUser(propId, gate.userId)
  if (!pack) return notFound(ctx, '道具不存在')

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')
  if (epPack.episode.dramaId !== pack.prop.dramaId) {
    return badRequest(ctx, 'episode 与道具不属于同一项目')
  }

  try {
    return success(ctx, await enqueuePropImage({
      userId: gate.userId,
      userRole: gate.role,
      propId,
      dramaId: pack.prop.dramaId,
      name: pack.prop.name,
      type: pack.prop.type,
      description: pack.prop.description,
      prompt: pack.prop.prompt,
      dramaImageConfigId: epPack.episode.dramaImageConfigId,
      episodeMetadata: epPack.episode.metadata,
      size: body.size,
      aspectRatio: body.aspect_ratio,
      whiteBackground: !!(body.white_background ?? body.whiteBackground),
    }))
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

propRouter.post('/batch-generate-images', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')

  return success(ctx, await batchEnqueuePropImages({
    userId: gate.userId,
    userRole: gate.role,
    dramaId: epPack.episode.dramaId,
    propIds: body.prop_ids || [],
    dramaImageConfigId: epPack.episode.dramaImageConfigId,
    episodeMetadata: epPack.episode.metadata,
    size: body.size,
    aspectRatio: body.aspect_ratio,
    whiteBackground: !!(body.white_background ?? body.whiteBackground),
    lookup: async (pid) => {
      const pack = await propDramaForUser(pid, gate.userId)
      if (!pack) return null
      return {
        name: pack.prop.name,
        type: pack.prop.type,
        description: pack.prop.description,
        prompt: pack.prop.prompt,
        dramaId: pack.prop.dramaId,
      }
    },
  }))
})

export default propRouter
