/**
 * 火火 — 角色衍生形态 HTTP 路由
 */
import { Hono } from 'hono'
import { success, created, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import {
  characterDramaForUser,
  characterFormDramaForUser,
  dramaOwnedByUser,
  episodeAndDramaForUser,
} from '../../services/drama/drama-access-service.js'
import { ensureCanGenerate } from '../../common/drama/generation-route-kit.js'
import * as characterFormsRepo from '../../db/repos/character-forms/index.js'
import {
  archiveCharacterForm,
  batchEnqueueCharacterFormPortraits,
  enqueueCharacterFormPortrait,
  insertCharacterFormRecord,
  patchCharacterFormRecord,
} from '../../services/drama/character-form-route-service.js'

const characterFormRouter = new Hono()

characterFormRouter.get('/drama/:dramaId', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const dramaId = Number(ctx.req.param('dramaId'))
  if (!(await dramaOwnedByUser(dramaId, authUser.id))) return notFound(ctx, '剧本不存在')
  const characterId = ctx.req.query('character_id')
  const rows = characterId
    ? await characterFormsRepo.listCharacterFormsByCharacter(Number(characterId))
    : await characterFormsRepo.listActiveCharacterFormsByDrama(dramaId)
  return success(ctx, rows.filter(r => r.dramaId === dramaId))
})

characterFormRouter.post('/', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const body = await ctx.req.json()
  if (!body.drama_id || !(await dramaOwnedByUser(Number(body.drama_id), authUser.id))) {
    return notFound(ctx, '剧本不存在')
  }
  if (!body.character_id || !body.name?.trim()) return badRequest(ctx, 'character_id 与 name 必填')
  try {
    return created(ctx, await insertCharacterFormRecord(body))
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

characterFormRouter.put('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const formId = Number(ctx.req.param('id'))
  if (!(await characterFormDramaForUser(formId, authUser.id))) return notFound(ctx, '衍生形态不存在')
  await patchCharacterFormRecord(formId, await ctx.req.json())
  return success(ctx)
})

characterFormRouter.delete('/:id', async (ctx) => {
  const authUser = getAuthUser(ctx)
  const formId = Number(ctx.req.param('id'))
  if (!(await characterFormDramaForUser(formId, authUser.id))) return notFound(ctx, '衍生形态不存在')
  await archiveCharacterForm(formId)
  return success(ctx)
})

characterFormRouter.post('/:id/generate-image', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const formId = Number(ctx.req.param('id'))
  const pack = await characterFormDramaForUser(formId, gate.userId)
  if (!pack) return notFound(ctx, '衍生形态不存在')

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')
  if (epPack.episode.dramaId !== pack.form.dramaId) {
    return badRequest(ctx, 'episode 与衍生形态不属于同一项目')
  }

  const basePack = await characterDramaForUser(pack.form.characterId, gate.userId)
  if (!basePack) return badRequest(ctx, '基础角色不存在')

  try {
    return success(ctx, await enqueueCharacterFormPortrait({
      userId: gate.userId,
      userRole: gate.role,
      formId,
      dramaId: pack.form.dramaId,
      episodeId: epPack.episode.id,
      formName: pack.form.name,
      baseCharacterId: pack.form.characterId,
      baseCharacterName: basePack.character.name,
      appearance: pack.form.appearance,
      description: pack.form.description,
      prompt: pack.form.prompt,
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

characterFormRouter.post('/batch-generate-images', async (ctx) => {
  const gate = await ensureCanGenerate(ctx)
  if (!gate.ok) return gate.response

  const body = await ctx.req.json()
  if (!body.episode_id) return badRequest(ctx, 'episode_id is required')

  const epPack = await episodeAndDramaForUser(Number(body.episode_id), gate.userId)
  if (!epPack) return notFound(ctx, 'Episode not found')

  try {
    return success(ctx, await batchEnqueueCharacterFormPortraits({
      userId: gate.userId,
      userRole: gate.role,
      episodeId: epPack.episode.id,
      dramaId: epPack.episode.dramaId,
      formIds: body.character_form_ids || body.form_ids || [],
      dramaImageConfigId: epPack.episode.dramaImageConfigId,
      episodeMetadata: epPack.episode.metadata,
      size: body.size,
      aspectRatio: body.aspect_ratio,
      referenceSheet: !!(body.reference_sheet ?? body.referenceSheet),
      lookup: async (fid) => {
        const pack = await characterFormDramaForUser(fid, gate.userId)
        if (!pack) return null
        const basePack = await characterDramaForUser(pack.form.characterId, gate.userId)
        if (!basePack) return null
        return {
          formName: pack.form.name,
          baseCharacterId: pack.form.characterId,
          baseCharacterName: basePack.character.name,
          appearance: pack.form.appearance,
          description: pack.form.description,
          prompt: pack.form.prompt,
          dramaId: pack.form.dramaId,
        }
      },
    }))
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }
})

export default characterFormRouter
