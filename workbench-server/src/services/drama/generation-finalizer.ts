import * as charactersRepo from '../../db/repos/characters/index.js'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import { now } from '../../common/http/response.js'
import { appendReferenceImagePath, seedSlideshowReferenceImages } from '../../common/drama/storyboard-frame-meta.js'
import { downloadFile, saveBase64Image } from '../../common/media/storage.js'
import { buildGenerationStoragePatch } from '../../common/media/generation-storage.js'
import { logTaskSuccess } from '../../common/task/task-logger.js'
import { indexImageGenerationAsset, indexVideoGenerationAsset } from '../media/asset-index-service.js'
import type { ImageGenerationRow } from '../../db/repos/types.js'

async function applyStoryboardImage(
  record: ImageGenerationRow,
  localPath: string,
) {
  if (!record.storyboardId) return

  const patch: Record<string, unknown> = { updatedAt: now() }
  if (record.frameType === 'first_frame') patch.firstFrameImage = localPath
  else if (record.frameType === 'last_frame') patch.lastFrameImage = localPath
  else if (record.frameType === 'reference') {
    const sb = await storyboardsRepo.findStoryboardById(record.storyboardId)
    const seeded = sb ? seedSlideshowReferenceImages(sb.referenceImages, sb) : null
    if (seeded && sb) {
      await storyboardsRepo.updateStoryboard(record.storyboardId, {
        referenceImages: seeded,
        updatedAt: now(),
      })
    }
    const fresh = await storyboardsRepo.findStoryboardById(record.storyboardId)
    patch.referenceImages = appendReferenceImagePath(fresh?.referenceImages, localPath)
  } else patch.composedImage = localPath

  await storyboardsRepo.updateStoryboard(record.storyboardId, patch)
}

async function applyLinkedEntityImages(record: ImageGenerationRow, localPath: string) {
  if (record.characterId) {
    await charactersRepo.updateCharacter(record.characterId, {
      imageUrl: localPath,
      updatedAt: now(),
    })
  }
  if (record.sceneId) {
    await scenesRepo.updateScene(record.sceneId, {
      imageUrl: localPath,
      status: 'completed',
      updatedAt: now(),
    })
  }
}

export async function markLinkedSceneFailed(imageGenerationId: number) {
  const record = await imageGenerationsRepo.findImageGenerationById(imageGenerationId)
  if (!record?.sceneId) return

  await scenesRepo.updateScene(record.sceneId, { status: 'failed', updatedAt: now() })
}

export async function finalizeImageFromUrl(id: number, provider: string, imageUrl: string) {
  const localPath = await downloadFile(imageUrl, 'images')
  const record = await imageGenerationsRepo.findImageGenerationById(id)
  await imageGenerationsRepo.updateImageGeneration(id, {
    ...buildGenerationStoragePatch({ imageUrl, localPath }),
    status: 'completed',
    updatedAt: now(),
  })

  logTaskSuccess('ImageTask', 'downloaded', { id, provider, localPath })
  if (record) {
    await applyStoryboardImage(record, localPath)
    await applyLinkedEntityImages(record, localPath)
    const fresh = await imageGenerationsRepo.findImageGenerationById(id)
    if (fresh) await indexImageGenerationAsset(fresh)
  }
}

export async function finalizeImageFromBase64(
  id: number,
  provider: string,
  base64Data: string,
  mimeType: string,
) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  const record = await imageGenerationsRepo.findImageGenerationById(id)
  await imageGenerationsRepo.updateImageGeneration(id, {
    ...buildGenerationStoragePatch({ localPath }),
    status: 'completed',
    updatedAt: now(),
  })

  logTaskSuccess('ImageTask', 'saved-base64', { id, provider, localPath })
  if (record) {
    await applyStoryboardImage(record, localPath)
    await applyLinkedEntityImages(record, localPath)
    const fresh = await imageGenerationsRepo.findImageGenerationById(id)
    if (fresh) await indexImageGenerationAsset(fresh)
  }
}

export async function finalizeVideoFromUrl(
  id: number,
  videoUrl: string,
  duration: number | null | undefined,
  storyboardId: number | null | undefined,
) {
  const localPath = await downloadFile(videoUrl, 'videos')
  const patch: Record<string, unknown> = {
    ...buildGenerationStoragePatch({ videoUrl, localPath }),
    status: 'completed',
    updatedAt: now(),
  }
  if (duration != null) patch.duration = duration

  await videoGenerationsRepo.updateVideoGeneration(id, patch)

  if (storyboardId) {
    await storyboardsRepo.updateStoryboard(storyboardId, {
      videoUrl: localPath,
      updatedAt: now(),
    })
  }

  const fresh = await videoGenerationsRepo.findVideoGenerationById(id)
  if (fresh) await indexVideoGenerationAsset(fresh)

  logTaskSuccess('VideoTask', 'downloaded', { id, localPath, storyboardId })
}
