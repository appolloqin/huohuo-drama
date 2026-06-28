import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import { getAuthUser } from '../../common/auth/http-auth.js';
import { assertUserCanGenerate } from '../../services/credits/credits.js'
import { saveUploadedFile } from '../../common/media/storage.js'
import {
  detectHubAudioFile,
  detectHubText,
  detectHubTextFile,
  detectHubVideoFile,
  resolveUploadedPath,
} from '../../services/ai/ai-detect-hub.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'
import { humanizeAiText, type HumanizeDetectionHint } from '../../services/ai/ai-dehumanizer.js'

const app = new Hono()

// POST /ai-detect/text — 直接输入文本
app.post('/text', async (c) => {
  const user = getAuthUser(c)
  try {
    await assertUserCanGenerate(user.id, user.role)
  } catch (err: any) {
    return badRequest(c, err.message)
  }
  const body = await c.req.json().catch(() => ({}))
  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) return badRequest(c, '请输入待检测文本')

  logTaskStart('AiDetect', 'text', { userId: user.id, chars: text.length })
  try {
    const result = await detectHubText(text, user.id, user.role)
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

  logTaskStart('AiDetect', kind, { userId: user.id, name: file.name, size: file.size })
  try {
    const buffer = await file.arrayBuffer()
    const relative = await saveUploadedFile(buffer, 'ai-detect-uploads', file.name)
    const absPath = resolveUploadedPath(relative)

    let result
    if (kind === 'file') {
      result = await detectHubTextFile(absPath, file.name, user.id, user.role)
    } else if (kind === 'audio') {
      result = await detectHubAudioFile(absPath, file.name, user.id, user.role)
    } else {
      result = await detectHubVideoFile(absPath, file.name, user.id, user.role)
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

export default app
