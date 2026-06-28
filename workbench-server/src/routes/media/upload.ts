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

const IMAGE_UPLOAD_BYTE_LIMIT = 20 * 1024 * 1024

function assertImageUploadConstraints(file: File): string | null {
  if (!PERMITTED_IMAGE_MIMES.has(file.type)) {
    return `unsupported file type: ${file.type || 'unknown'}`
  }
  if (file.size > IMAGE_UPLOAD_BYTE_LIMIT) {
    return `file too large (max ${IMAGE_UPLOAD_BYTE_LIMIT} bytes)`
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

export default uploadRoutes
