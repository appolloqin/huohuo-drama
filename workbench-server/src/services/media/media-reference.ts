import { readImageAsCompressedDataUrl } from '../../common/media/storage.js'
import { logTaskWarn } from '../../common/task/task-logger.js'

const LOCAL_STATIC_PREFIX = /^(\/)?static\//

async function compressLocalImage(pathValue: string, scope: string): Promise<string | null> {
  const localPath = pathValue.startsWith('/static/') ? pathValue.slice(1) : pathValue
  try {
    return await readImageAsCompressedDataUrl(localPath, {
      maxWidth: 768,
      maxHeight: 768,
      quality: 68,
    })
  } catch (err) {
    logTaskWarn(scope, 'reference-read-failed', {
      path: localPath,
      error: (err as Error).message,
    })
    return null
  }
}

export async function normalizeMediaReference(value: string | null | undefined, scope: string): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (LOCAL_STATIC_PREFIX.test(raw)) {
    return compressLocalImage(raw, scope)
  }
  return raw
}

export async function normalizeMediaReferenceList(
  raw: string | null | undefined,
  scope: string,
  limit = 6,
): Promise<string[]> {
  if (!raw) return []

  let refs: string[] = []
  try {
    refs = JSON.parse(raw)
  } catch {
    refs = []
  }

  const unique = Array.from(new Set(refs.map(item => String(item || '').trim()).filter(Boolean)))
  const normalized = await Promise.all(unique.map(item => normalizeMediaReference(item, scope)))
  return normalized.filter((item): item is string => !!item).slice(0, limit)
}

export async function normalizeMediaReferenceArray(
  raw: string | string[] | null | undefined,
  scope: string,
): Promise<string[]> {
  if (!raw) return []
  const list = Array.isArray(raw) ? raw : (() => {
    try {
      const parsed = JSON.parse(String(raw))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()

  const normalized = await Promise.all(
    Array.from(new Set(list.map(item => String(item || '').trim()).filter(Boolean)))
      .map(item => normalizeMediaReference(item, scope)),
  )
  return normalized.filter((item): item is string => !!item)
}
