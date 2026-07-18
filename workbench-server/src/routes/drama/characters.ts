/**
 * 火火 — 角色 HTTP 路由
 */
import { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { characterDramaForUser, episodeAndDramaForUser } from '../../services/drama/drama-access-service.js';
import { ensureCanGenerate } from '../../common/drama/generation-route-kit.js'
import {
  archiveCharacter,
  batchEnqueueCharacterPortraits,
  enqueueCharacterPortrait,
  patchCharacterRecord,
  synthesizeCharacterVoiceSample,
} from '../../services/drama/character-route-service.js'

const castRouter = new Hono()

castRouter.put('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const castId = Number(ctx.req.param('id'))
  if (!(await characterDramaForUser(castId, authUser.id))) return notFound(ctx, 'Character not found')
  await patchCharacterRecord(castId, await ctx.req.json())
  return success(ctx)
})

castRouter.delete('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const castId = Number(ctx.req.param('id'))
  if (!(await characterDramaForUser(castId, authUser.id))) return notFound(ctx, 'Character not found')
  await archiveCharacter(castId)
  return success(ctx)
})

castRouter.post('/:id/generate-voice-sample', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const castId = Number(ctx.req.param('id'))
  const castPack = await characterDramaForUser(castId, gate.userId)
  if (!castPack) return notFound(ctx, 'Character not found')

  const body = await ctx.req.json().catch(() => ({}))
  if (!castPack.character.voiceId) return badRequest(ctx, '请先分配音色')
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')
  if (epPack.episode.dramaId !== castPack.character.dramaId) {
    return badRequest(ctx, 'episode 与角色不属于同一项目')
  }

  try {
    return success(ctx, await synthesizeCharacterVoiceSample({
      characterId: castId,
      characterName: castPack.character.name,
      voiceId: castPack.character.voiceId,
      episodeId: epPack.episode.id,
      dramaAudioConfigId: epPack.episode.dramaAudioConfigId,
    }))
  } catch (err: any) {
    return badRequest(ctx, `TTS 生成失败: ${err.message}`)
  }
})

castRouter.post('/:id/generate-image', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const castId = Number(ctx.req.param('id'))
  const castPack = await characterDramaForUser(castId, gate.userId)
  if (!castPack) return notFound(ctx, 'Character not found')

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')
  if (epPack.episode.dramaId !== castPack.character.dramaId) {
    return badRequest(ctx, 'episode 与角色不属于同一项目')
  }

  try {
    return success(ctx, await enqueueCharacterPortrait({
      userId: gate.userId,
      userRole: gate.role,
      characterId: castId,
      dramaId: castPack.character.dramaId,
      episodeId: epPack.episode.id,
      name: castPack.character.name,
      role: castPack.character.role,
      appearance: castPack.character.appearance,
      description: castPack.character.description,
      personality: castPack.character.personality,
      dramaImageConfigId: epPack.episode.dramaImageConfigId,
      episodeMetadata: epPack.episode.metadata,
      size: body.size,
      aspectRatio: body.aspect_ratio,
      referenceSheet: !!(body.reference_sheet ?? body.referenceSheet),
    }))
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

castRouter.post('/batch-generate-images', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')

  try {
    return success(ctx, await batchEnqueueCharacterPortraits({
      userId: gate.userId,
      userRole: gate.role,
      episodeId: epPack.episode.id,
      dramaId: epPack.episode.dramaId,
      characterIds: body.character_ids || [],
      dramaImageConfigId: epPack.episode.dramaImageConfigId,
      episodeMetadata: epPack.episode.metadata,
      size: body.size,
      aspectRatio: body.aspect_ratio,
      referenceSheet: !!(body.reference_sheet ?? body.referenceSheet),
      lookup: async (cid) => {
        const pack = await characterDramaForUser(cid, gate.userId)
        if (!pack) return null
        return {
          name: pack.character.name,
          role: pack.character.role,
          appearance: pack.character.appearance,
          description: pack.character.description,
          personality: pack.character.personality,
          dramaId: pack.character.dramaId,
        }
      },
    }))
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

export default castRouter
