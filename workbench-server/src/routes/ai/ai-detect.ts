import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js'
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import { saveUploadedFile } from '../../common/media/storage.js'
import {
  detectHubAudioFile,
  detectHubText,
  detectHubTextFile,
  detectHubVideoFile,
  resolveUploadedPath,
  type DetectHubOptions,
} from '../../services/ai/ai-detect-hub.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { humanizeAiText, type HumanizeDetectionHint } from '../../services/ai/ai-dehumanizer.js'
import { requireAdmin } from '../../middleware/auth.js'
import * as aiDetectRetrain from '../../services/ai/ai-detect-retrain.js'
import { rebuildFingerprintProfile } from '../../services/ai/ai-detect-model-fingerprint.js'
import * as aiDetectStore from '../../services/ai/ai-detect-store.js'
import { now } from '../../common/http/response.js'

const app = new Hono()

function parseDetectOpts(body: Record<string, unknown>): DetectHubOptions {
  const genre = typeof body.genre === 'string' ? body.genre : undefined
  const enableAdversarial = body.enable_adversarial === false ? false : undefined
  const tier = typeof body.budget_tier === 'string' ? body.budget_tier : undefined
  const budgetTier = tier === 'short' || tier === 'standard' || tier === 'long' ? tier : undefined
  return { genre, enableAdversarial, budgetTier }
}

function parseDetectOptsFromForm(body: Record<string, unknown>): DetectHubOptions {
  return parseDetectOpts(body)
}

// POST /ai-detect/text — 直接输入文本
app.post('/text', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) return badRequest(c, '请输入待检测文本')

  logTaskStart('AiDetect', 'text', { userId: user.id, chars: text.length })
  try {
    const result = await detectHubText(text, user.id, user.role, parseDetectOpts(body))
    logTaskSuccess('AiDetect', 'text', { probability: result.probability, method: result.method })
    return success(c, result)
  } catch (err: any) {
    logTaskError('AiDetect', 'text', { error: err?.message })
    return badRequest(c, err?.message || '检测失败')
  }
})

async function handleUpload(
  c: any,
  kind: 'file' | 'audio' | 'video',
) {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) return badRequest(c, '请上传文件')
  const opts = parseDetectOptsFromForm(body as Record<string, unknown>)

  logTaskStart('AiDetect', kind, { userId: user.id, name: file.name, size: file.size })
  try {
    const buffer = await file.arrayBuffer()
    const relative = await saveUploadedFile(buffer, 'ai-detect-uploads', file.name)
    const absPath = resolveUploadedPath(relative)

    let result
    if (kind === 'file') {
      result = await detectHubTextFile(absPath, file.name, user.id, user.role, opts)
    } else if (kind === 'audio') {
      result = await detectHubAudioFile(absPath, file.name, user.id, user.role, opts)
    } else {
      result = await detectHubVideoFile(absPath, file.name, user.id, user.role, opts)
    }

    logTaskSuccess('AiDetect', kind, {
      probability: result.probability,
      source: result.transcript_source,
    })
    return success(c, result)
  } catch (err: any) {
    logTaskError('AiDetect', kind, { error: err?.message })
    return badRequest(c, err?.message || '检测失败')
  }
}

// POST /ai-detect/file — 长文本文件
app.post('/file', c => handleUpload(c, 'file'))

// POST /ai-detect/audio — 音频转写后检测
app.post('/audio', c => handleUpload(c, 'audio'))

// POST /ai-detect/video — 字幕/转写后检测
app.post('/video', c => handleUpload(c, 'video'))

// POST /ai-detect/humanize — 去 AI 味改写（引用 ai_dehumanizer Agent + Skill）
app.post('/humanize', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const body = await c.req.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text : ''
  const detection = (body.detection || null) as HumanizeDetectionHint | null

  logTaskStart('AiDetect', 'humanize', { userId: user.id, chars: text.length })
  try {
    const out = await humanizeAiText(
      { text, detection },
      {
        userId: user.id,
        role: user.role,
        reason: '去AI味改写',
        resourceType: 'ai_dehumanizer',
      },
    )
    logTaskSuccess('AiDetect', 'humanize', { char_count: out.char_count })
    return success(c, out)
  } catch (err: any) {
    logTaskError('AiDetect', 'humanize', { error: err?.message })
    return badRequest(c, err?.message || '改写失败')
  }
})

// POST /ai-detect/feedback — 用户反馈（可选授权存 excerpt）
app.post('/feedback', async (c) => {
  const user = getAuthUser(c)
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const contentHash = typeof body.content_hash === 'string' ? body.content_hash.trim() : ''
  const label = body.label === 'human' || body.label === 'ai' ? body.label : null
  if (!contentHash || !label) return badRequest(c, '缺少 content_hash 或 label（human/ai）')
  const consent = body.consent_store === true || body.consent_store === 1
  const excerpt = consent && typeof body.text === 'string'
    ? [...body.text.trim()].slice(0, 4000).join('')
    : ''
  const id = await aiDetectStore.feedbackRepo.insert({
    runId: Number.isFinite(Number(body.run_id)) ? Number(body.run_id) : null,
    contentHash,
    userId: user.id,
    sourceType: typeof body.source_type === 'string' ? body.source_type : 'text',
    declaredLabel: label,
    adminLabel: null,
    consentStore: excerpt ? 1 : 0,
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    excerpt: excerpt || null,
    genre: typeof body.genre === 'string' ? body.genre : 'web_fiction',
    createdAt: now(),
  })
  return success(c, { id })
})

app.get('/admin/calibration/status', requireAdmin, async (c) => {
  return success(c, await aiDetectRetrain.getCalibrationStatus())
})

app.post('/admin/calibration/retrain', requireAdmin, async (c) => {
  const result = await aiDetectRetrain.retrainFromSamplesFile()
  if (!result.ok) return badRequest(c, result.reason || '重训失败')
  return success(c, result)
})

app.post('/admin/calibration/rollback', requireAdmin, async (c) => {
  const r = await aiDetectRetrain.rollbackProfile()
  if (!r.ok) return badRequest(c, r.reason || '回滚失败')
  return success(c, r)
})

app.post('/admin/calibration/fingerprints/rebuild', requireAdmin, async (c) => {
  return success(c, await rebuildFingerprintProfile())
})

app.post('/admin/feedback/:id/review', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>))
  const label = body.admin_label === 'human' || body.admin_label === 'ai' ? body.admin_label : null
  if (!Number.isFinite(id) || !label) return badRequest(c, 'id 与 admin_label(human/ai) 必填')
  await aiDetectStore.feedbackRepo.setAdminLabel(id, label)
  return success(c, { ok: true })
})

export default app
