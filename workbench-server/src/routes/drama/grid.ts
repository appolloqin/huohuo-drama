import { Hono } from 'hono'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { dramaOwnedByUser, imageGenerationForUser, storyboardEpisodeForUser, storyboardsOwnedByUser } from '../../services/drama/drama-access-service.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import {
  applyGridSplitAssignments,
  buildDramaImagePromptBundle,
  enqueueGridImageGeneration,
  readGridGenerationStatus,
} from '../../services/drama/grid-workflow.js'

const app = new Hono()

app.post('/prompt', async (c) => {
  const authUser = getAuthUser(c)
  const body = await c.req.json()
  const {
    storyboard_ids,
    drama_id,
    episode_id,
    rows,
    cols,
    mode = 'first_frame',
  } = body

  if (!storyboard_ids?.length) return badRequest(c, 'storyboard_ids required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (!(await storyboardsOwnedByUser(storyboard_ids, authUser.id))) return notFound(c, '镜头不存在')
  if (drama_id && !(await dramaOwnedByUser(Number(drama_id), authUser.id))) return notFound(c, '剧本不存在')

  try {
    const payload = await buildDramaImagePromptBundle({
      storyboardIds: storyboard_ids,
      dramaId: drama_id ? Number(drama_id) : undefined,
      episodeId: episode_id ? Number(episode_id) : undefined,
      rows,
      cols,
      mode,
      configOpts: { userId: authUser.id, role: authUser.role },
    })
    return success(c, payload)
  } catch (err: any) {
    if (err.message === 'episode_id required') return badRequest(c, err.message)
    if (err.message?.includes('storyboard')) return badRequest(c, 'No storyboards found')
    return badRequest(c, err.message)
  }
})

app.post('/generate', async (c) => {
  const authUser = getAuthUser(c)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const body = await c.req.json()
  const {
    storyboard_ids,
    drama_id,
    rows,
    cols,
    mode = 'first_frame',
    custom_prompt,
  } = body

  if (!storyboard_ids?.length) return badRequest(c, 'storyboard_ids required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (!(await storyboardsOwnedByUser(storyboard_ids, authUser.id))) return notFound(c, '镜头不存在')
  if (drama_id && !(await dramaOwnedByUser(Number(drama_id), authUser.id))) return notFound(c, '剧本不存在')

  try {
    const payload = await enqueueGridImageGeneration({
      userId: authUser.id,
      userRole: authUser.role,
      storyboardIds: storyboard_ids,
      dramaId: drama_id ? Number(drama_id) : undefined,
      rows,
      cols,
      mode,
      customPrompt: custom_prompt,
    })
    return success(c, payload)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.post('/split', async (c) => {
  const authUser = getAuthUser(c)
  const body = await c.req.json()
  const { image_generation_id, rows, cols, assignments } = body

  if (!image_generation_id) return badRequest(c, 'image_generation_id required')
  if (!rows || !cols) return badRequest(c, 'rows and cols required')
  if (!assignments?.length) return badRequest(c, 'assignments required')

  const imgRecord = await imageGenerationForUser(Number(image_generation_id), authUser.id)
  if (!imgRecord) return notFound(c, 'Image generation not found')
  for (const a of assignments) {
    if (a.storyboard_id && !(await storyboardEpisodeForUser(Number(a.storyboard_id), authUser.id))) {
      return notFound(c, '镜头不存在')
    }
  }

  try {
    const payload = await applyGridSplitAssignments({
      imageGenerationId: Number(image_generation_id),
      rows,
      cols,
      assignments,
    })
    return success(c, payload)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

app.get('/status/:id', async (c) => {
  const authUser = getAuthUser(c)
  const id = Number(c.req.param('id'))
  if (!(await imageGenerationForUser(id, authUser.id))) return notFound(c, 'Not found')
  const payload = await readGridGenerationStatus(id)
  if (!payload) return notFound(c, 'Not found')
  return success(c, payload)
})

export default app
