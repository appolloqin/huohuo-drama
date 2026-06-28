/**
 * Unified media location for image/video generation rows (F3).
 * Legacy columns (image_url/video_url, minio_url, local_path) stay in sync on write;
 * reads prefer storage_kind + storage_uri when set.
 */
export type GenerationStorageKind = 'local' | 'remote' | 'object'

export type GenerationStorageFields = {
  storageKind?: string | null
  storageUri?: string | null
  localPath?: string | null
  minioUrl?: string | null
  imageUrl?: string | null
  videoUrl?: string | null
}

function trimOrNull(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t || null
}

/** Pick canonical kind + uri from legacy triple (local > object > remote). */
export function inferGenerationStorage(input: {
  localPath?: string | null
  minioUrl?: string | null
  remoteUrl?: string | null
}): { storageKind: GenerationStorageKind | null; storageUri: string | null } {
  const local = trimOrNull(input.localPath)
  if (local) return { storageKind: 'local', storageUri: local }
  const object = trimOrNull(input.minioUrl)
  if (object) return { storageKind: 'object', storageUri: object }
  const remote = trimOrNull(input.remoteUrl)
  if (remote) return { storageKind: 'remote', storageUri: remote }
  return { storageKind: null, storageUri: null }
}

/** Build patch with legacy URL columns + unified storage fields. */
export function buildGenerationStoragePatch(input: {
  localPath?: string | null
  minioUrl?: string | null
  imageUrl?: string | null
  videoUrl?: string | null
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (input.localPath !== undefined) patch.localPath = input.localPath
  if (input.minioUrl !== undefined) patch.minioUrl = input.minioUrl
  if (input.imageUrl !== undefined) patch.imageUrl = input.imageUrl
  if (input.videoUrl !== undefined) patch.videoUrl = input.videoUrl

  const { storageKind, storageUri } = inferGenerationStorage({
    localPath: input.localPath ?? null,
    minioUrl: input.minioUrl ?? null,
    remoteUrl: trimOrNull(input.imageUrl ?? input.videoUrl),
  })
  patch.storageKind = storageKind
  patch.storageUri = storageUri
  return patch
}

/** Resolve best playable URI; optional localExists gates stale local_path rows. */
export function resolveGenerationStorageUri(
  row: GenerationStorageFields,
  localExists?: (localPath: string) => boolean,
): string | null {
  const checkLocal = localExists ?? (() => true)

  if (row.storageKind && row.storageUri) {
    if (row.storageKind === 'local') {
      if (checkLocal(row.storageUri)) return row.storageUri
    } else {
      return row.storageUri
    }
  }

  const local = trimOrNull(row.localPath)
  if (local && checkLocal(local)) return local
  const object = trimOrNull(row.minioUrl)
  if (object) return object
  return trimOrNull(row.imageUrl) ?? trimOrNull(row.videoUrl)
}
