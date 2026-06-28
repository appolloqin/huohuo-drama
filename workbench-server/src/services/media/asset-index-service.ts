import * as assetsRepo from '../../db/repos/assets/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import type { ImageGenerationRow, VideoGenerationRow } from '../../db/repos/types.js'
import { now } from '../../common/http/response.js'
import { resolveGenerationStorageUri } from '../../common/media/generation-storage.js'

function truncateLabel(text: string | null | undefined, max = 120): string | null {
  const t = (text || '').trim()
  if (!t) return null
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

async function resolveStoryboardContext(storyboardId: number | null | undefined) {
  if (!storyboardId) return { episodeId: null as number | null, storyboardNum: null as number | null }
  const sb = await storyboardsRepo.findStoryboardById(storyboardId)
  return {
    episodeId: sb?.episodeId ?? null,
    storyboardNum: sb?.storyboardNumber ?? null,
  }
}

export async function indexImageGenerationAsset(record: ImageGenerationRow) {
  const uri = resolveGenerationStorageUri(record)
  if (!uri) return

  const ts = now()
  const { episodeId, storyboardNum } = await resolveStoryboardContext(record.storyboardId)
  const isLocal = uri.startsWith('static/') || uri.startsWith('/static/')

  await assetsRepo.upsertAssetByImageGenId({
    dramaId: record.dramaId,
    episodeId,
    storyboardId: record.storyboardId,
    storyboardNum,
    name: truncateLabel(record.prompt) || `image #${record.id}`,
    description: record.prompt,
    type: 'image',
    category: record.imageType || record.frameType || 'generation',
    url: isLocal ? null : uri,
    localPath: isLocal ? uri.replace(/^\//, '') : null,
    imageGenId: record.id,
    width: record.width,
    height: record.height,
    createdAt: record.createdAt || ts,
    updatedAt: ts,
  })
}

export async function indexVideoGenerationAsset(record: VideoGenerationRow) {
  const uri = resolveGenerationStorageUri(record)
  if (!uri) return

  const ts = now()
  const { episodeId, storyboardNum } = await resolveStoryboardContext(record.storyboardId)
  const isLocal = uri.startsWith('static/') || uri.startsWith('/static/')

  await assetsRepo.upsertAssetByVideoGenId({
    dramaId: record.dramaId,
    episodeId,
    storyboardId: record.storyboardId,
    storyboardNum,
    name: truncateLabel(record.prompt) || `video #${record.id}`,
    description: record.prompt,
    type: 'video',
    category: record.referenceMode || 'generation',
    url: isLocal ? null : uri,
    localPath: isLocal ? uri.replace(/^\//, '') : null,
    videoGenId: record.id,
    width: record.width,
    height: record.height,
    duration: record.duration,
    createdAt: record.createdAt || ts,
    updatedAt: ts,
  })
}
