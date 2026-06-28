/**
 * 火火 — Agent 技能目录 HTTP 接口
 */
import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import {
  absorbSkillUpload,
  bootstrapSkillDir,
  enumerateSkillEntries,
  fetchSkillMarkdown,
  persistSkillMarkdown,
  purgeSkillDir,
  stripSkillApiPrefix,
} from '../../services/skill/skill-catalog-service.js'

async function mountAgentSkillRoutes(router: Hono) {
  // 写操作优先注册，避免通配符与固定路径冲突
  router.post('/upload', async (ctx) => {
    const form = await ctx.req.parseBody()
    const uploadFile = form['file']
    if (!uploadFile || !(uploadFile instanceof File)) {
      return badRequest(ctx, '请上传文件')
    }

    const agentType = typeof form.agent_type === 'string' ? form.agent_type.trim() : ''
    const overwrite = form.overwrite === '1' || form.overwrite === 'true'
    const subId = typeof form.sub_id === 'string' ? form.sub_id.trim() : ''

    try {
      const imported = await absorbSkillUpload({ file: uploadFile, agentType, overwrite, subId })
      return success(ctx, { imported })
    } catch (err: any) {
      return badRequest(ctx, err?.message || '上传失败')
    }
  })

  router.post('/', async (ctx) => {
    const payload = await ctx.req.json()
    if (!payload.id) return badRequest(ctx, 'Skill id is required')
    try {
      const row = bootstrapSkillDir(payload)
      return success(ctx, row)
    } catch (err: any) {
      return badRequest(ctx, err.message)
    }
  })

  router.put('/*', async (ctx) => {
    const skillId = stripSkillApiPrefix(ctx.req.path)
    const { content } = await ctx.req.json()
    persistSkillMarkdown(skillId, content)
    return success(ctx)
  })

  router.delete('/*', (ctx) => {
    const skillId = stripSkillApiPrefix(ctx.req.path)
    try {
      purgeSkillDir(skillId)
      return success(ctx)
    } catch (err: any) {
      return badRequest(ctx, err.message)
    }
  })

  router.get('/', (ctx) => success(ctx, enumerateSkillEntries()))

  router.get('/*', (ctx) => {
    const skillId = stripSkillApiPrefix(ctx.req.path)
    const doc = fetchSkillMarkdown(skillId)
    if (!doc) return badRequest(ctx, 'Skill not found')
    return success(ctx, doc)
  })
}

const agentSkillRouter = new Hono()
mountAgentSkillRoutes(agentSkillRouter)

export default agentSkillRouter
