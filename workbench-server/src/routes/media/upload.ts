import { Hono } from 'hono'
import { success, badRequest } from '../../common/http/response.js'
import { saveUploadedFile } from '../../common/media/storage.js'

const uploadRoutes = new Hono()

const PERMITTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const PERMITTED_AUDIO_MIMES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/aac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
  'audio/flac',
])

const IMAGE_UPLOAD_BYTE_LIMIT = 20 * 1024 * 1024
const AUDIO_UPLOAD_BYTE_LIMIT = 30 * 1024 * 1024

function assertImageUploadConstraints(file: File): string | null {
  if (!PERMITTED_IMAGE_MIMES.has(file.type)) {
    return `unsupported file type: ${file.type || 'unknown'}`
  }
  if (file.size > IMAGE_UPLOAD_BYTE_LIMIT) {
    return `file too large (max ${IMAGE_UPLOAD_BYTE_LIMIT} bytes)`
  }
  return null
}

function assertAudioUploadConstraints(file: File): string | null {
  const name = (file.name || '').toLowerCase()
  const typeOk = PERMITTED_AUDIO_MIMES.has(file.type)
    || /\.(mp3|wav|aac|m4a|ogg|flac)$/.test(name)
  if (!typeOk) {
    return `unsupported audio type: ${file.type || 'unknown'}`
  }
  if (file.size > AUDIO_UPLOAD_BYTE_LIMIT) {
    return `file too large (max ${AUDIO_UPLOAD_BYTE_LIMIT} bytes)`
  }
  return null
}

uploadRoutes.post('/image', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }

  const validationError = assertImageUploadConstraints(file)
  if (validationError) {
    return badRequest(c, validationError)
  }

  const buffer = await file.arrayBuffer()
  const storedPath = await saveUploadedFile(buffer, 'uploads', file.name)
  return success(c, { url: `/${storedPath}`, path: storedPath })
})

uploadRoutes.post('/audio', async (c) => {
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }

  const validationError = assertAudioUploadConstraints(file)
  if (validationError) {
    return badRequest(c, validationError)
  }

  const buffer = await file.arrayBuffer()
  const storedPath = await saveUploadedFile(buffer, 'bgm/uploads', file.name)
  return success(c, { url: `/${storedPath}`, path: storedPath })
})

export default uploadRoutes
