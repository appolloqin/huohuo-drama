/**
 * 火火 — Agent 非流式 HTTP 路由
 */
import { Hono } from 'hono'
import { validAgentTypes } from '../../agents/index.js'
import { success, badRequest, notFound } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { episodeAndDramaForUser } from '../../services/drama/drama-access-service.js';
import { logTaskError } from '../../common/task/task-logger.js'
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import { executeAgentChat } from '../../services/agent/agent-chat-service.js'

const agentRouter = new Hono()

agentRouter.post('/:type/chat', async (ctx) => {
  const agentType = ctx.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(ctx, `Invalid agent type: ${agentType}`)
  }

  const payload = await ctx.req.json()
  const { message, drama_id: dramaId, episode_id: episodeId } = payload

  if (!episodeId || !dramaId) {
    logTaskError('Agent', agentType, { reason: 'missing drama_id or episode_id' })
    return badRequest(ctx, 'drama_id and episode_id are required')
  }

  const authUser = getAuthUser(ctx)
  try {
    await assertUserCanGenerate(authUser.id, authUser.role)
  } catch (err: any) {
    return badRequest(ctx, err.message)
  }

  const episodePack = await episodeAndDramaForUser(Number(episodeId), authUser.id)
  if (!episodePack || episodePack.drama.id !== Number(dramaId)) {
    logTaskError('Agent', agentType, { reason: 'forbidden or drama mismatch' })
    return notFound(ctx, '剧集不存在')
  }

  try {
    const reply = await executeAgentChat({
      agentType,
      userId: authUser.id,
      role: authUser.role,
      message,
      dramaId: Number(dramaId),
      episodeId: Number(episodeId),
    })
    return success(ctx, reply)
  } catch (err: any) {
    logTaskError('Agent', agentType, { error: err.message })
    console.error(err.stack || err)
    return badRequest(ctx, err.message || 'Agent execution failed')
  }
})

agentRouter.get('/:type/debug', (ctx) => {
  const agentType = ctx.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(ctx, 'Invalid agent type')
  return success(ctx, { agent_type: agentType, valid: true })
})

export default agentRouter
