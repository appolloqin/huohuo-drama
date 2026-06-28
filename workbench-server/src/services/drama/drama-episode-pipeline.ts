/**
 * 单集短剧完整生产流水线：剧本 → 提取 → 分镜 → 素材 → 视频 → 合成 → 集级合并
 */
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as imageGenerationsRepo from '../../db/repos/image-generations/index.js'
import * as scenesRepo from '../../db/repos/scenes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import * as videoGenerationsRepo from '../../db/repos/video-generations/index.js'
import type { CharacterRow, DramaRow, EpisodeRow, StoryboardRow } from '../../db/repos/types.js'
import { createAgent } from '../../agents/index.js'
import { assignDramaVoicesByHeuristic } from '../../agents/tools/drama-voice-assign-tools.js'
import { generateEpisodeRawContent } from './episode-raw-content.js'
import { generateImage } from '../media/image-generation.js'
import { generateVideo } from '../media/video-generation.js'
import { resolveImageAspectRatio, resolveVideoAspectRatio } from '../../common/media/image-aspect-presets.js'
import { enhanceVideoPrompt, readVideoGenOptionsFromMetadata } from '../../common/media/video-gen-options.js'
import { readProductionPipeline, mergeEpisodeMetadata, type ProductionPipeline } from '../../common/drama/episode-meta.js'
import {
  collectSlideshowKeyframePaths,
  resolveSlideshowFrameTargetCount,
  seedSlideshowReferenceImages,
} from '../../common/drama/storyboard-frame-meta.js'
import {
  alignStoryboardSlideshowToTargetDuration,
  storyboardHasSlideshowClip,
  storyboardHasMotionVideo,
  storyboardHasComposedVideo,
  generateStoryboardSlideshow,
} from './storyboard-slideshow-service.js'
import { synthesizeStoryboardTTS } from './storyboard-route-service.js'
import { parseDialogueForTTS } from './compose-dialogue.js'
import { getSlideshowServicePaths } from './ffmpeg-slideshow.js'
import { composeStoryboard } from './ffmpeg-compose.js'
import { mergeEpisodeVideosAndWait } from './ffmpeg-merge.js'
import { assertUserCanGenerate } from '../credits/credits.js'
import { assertEpisodeMediaConfigReady, assertUserServiceConfigReady, getConfigById, resolveUserServiceConfig } from '../ai/ai.js'
import { now } from '../../common/http/response.js'
import { isDramaEpisodeMergedForPipeline } from '../../common/drama/drama-episode-status.js'
import { isTransientNetworkError } from '../../common/http/fetch-retry.js'
import { logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../../common/task/task-logger.js'

export type DramaPipelinePhase =
  | 'raw' | 'rewrite' | 'extract' | 'voice' | 'storyboards'
  | 'char_images' | 'scene_images' | 'shot_images' | 'dubbing'
  | 'videos' | 'slideshow' | 'compose' | 'merge'

export type DramaPipelineProgressStatus = 'start' | 'done' | 'skip' | 'error'

export class BatchStoppedError extends Error {
  constructor() {
    super('批量任务已停止')
    this.name = 'BatchStoppedError'
  }
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function checkStop(shouldStop?: () => boolean) {
  if (shouldStop?.()) throw new BatchStoppedError()
}

async function loadEpisode(episodeId: number): Promise<EpisodeRow> {
  const ep = await episodesRepo.findEpisodeById(episodeId)
  if (!ep) throw new Error('剧集不存在')
  return ep
}

function buildDramaEpisodePrompt(drama: { title: string; description: string | null }, ep: { episodeNumber: number; title: string }) {
  const desc = (drama.description || '').trim()
  const epLine = `第${ep.episodeNumber}集${ep.title ? `《${ep.title}》` : ''}`
  if (desc) {
    return `根据项目简介与集标题，撰写本集短剧正文初稿。项目：${drama.title}。本集：${epLine}。\n项目简介：${desc.slice(0, 1200)}`
  }
  return `撰写短剧项目「${drama.title}」的${epLine}正文初稿，保持与前集剧情连贯，包含对白与场景叙述。`
}

async function buildDramaStoryboardBreakdownMessage(
  videoConfigId: number | null | undefined,
  configOpts?: { userId: number; role: string },
) {
  const config = configOpts
    ? (await resolveUserServiceConfig('video', { ...configOpts, configId: videoConfigId ?? null })).config
    : (videoConfigId ? await getConfigById(videoConfigId) : null)
  const label = config ? `${config.model} (${config.provider})` : '默认'
  return `请拆解分镜并生成视频提示词。视频模型：${label}，请根据该模型的特性和时长限制生成合适的视频提示词。`
}

function isNarratorCharacter(char: CharacterRow) {
  const role = (char.role || '').trim()
  const name = (char.name || '').trim()
  return /旁白|画外音|narrator/i.test(role) || /^(旁白|画外音|narrator)$/i.test(name)
}

async function getEpisodeCharacterIds(episodeId: number) {
  const linked = (await episodesRepo.listEpisodeCharacterLinks(episodeId)).map(l => l.characterId)
  const sbIds = await episodesRepo.listStoryboardIdsByEpisode(episodeId)
  const sbCharIds = (await episodesRepo.listAllStoryboardCharacterLinks())
    .filter(l => sbIds.includes(l.storyboardId))
    .map(l => l.characterId)
  return [...new Set([...linked, ...sbCharIds])]
}

async function getEpisodeCharacters(episodeId: number, dramaId: number) {
  const ids = new Set(await getEpisodeCharacterIds(episodeId))
  const chars = await charactersRepo.listActiveCharactersByDrama(dramaId)
  return chars.filter(ch => ids.has(ch.id))
}

async function getEpisodeScenes(episodeId: number, dramaId: number) {
  const sbs = await episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
  const sbSceneIds = new Set(
    sbs.map(sb => sb.sceneId).filter(Boolean) as number[],
  )
  const scenes = await scenesRepo.listActiveScenesByDrama(dramaId)
  return scenes.filter(s => s.episodeId === episodeId || sbSceneIds.has(s.id))
}

async function getStoryboards(episodeId: number) {
  return episodesRepo.listStoryboardsByEpisodeOrdered(episodeId)
}

async function getStoryboardCharacterIds(storyboardId: number) {
  return storyboardsRepo.listStoryboardCharacterIds(storyboardId)
}

async function waitForImageGeneration(genId: number, shouldStop?: () => boolean) {
  for (let i = 0; i < 120; i++) {
    checkStop(shouldStop)
    const row = await imageGenerationsRepo.findImageGenerationById(genId)
    if (!row) throw new Error('图片生成记录不存在')
    if (row.status === 'completed') return
    if (row.status === 'failed') throw new Error(row.errorMsg || '图片生成失败')
    await sleep(3000)
  }
  throw new Error('图片生成超时')
}

async function waitForVideoGeneration(genId: number, shouldStop?: () => boolean) {
  for (let i = 0; i < 120; i++) {
    checkStop(shouldStop)
    const row = await videoGenerationsRepo.findVideoGenerationById(genId)
    if (!row) throw new Error('视频生成记录不存在')
    if (row.status === 'completed') return
    if (row.status === 'failed') throw new Error(row.errorMsg || '视频生成失败')
    await sleep(4000)
  }
  throw new Error('视频生成超时')
}

async function runAgent(
  agentType: string,
  message: string,
  episodeId: number,
  dramaId: number,
  configOpts: { userId: number; role: string },
) {
  const maxAttempts = 3
  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const agent = await createAgent(agentType, episodeId, dramaId, configOpts)
      if (!agent) throw new Error(`Agent ${agentType} 不可用`)
      await agent.generate([{ role: 'user', content: message }], { maxSteps: 20 })
      return
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err?.message || err))
      if (!isTransientNetworkError(lastErr) || attempt >= maxAttempts) throw lastErr
      logTaskWarn('DramaPipeline', 'agent-network-retry', {
        agentType,
        episodeId,
        attempt,
        error: lastErr.message,
      })
      await sleep(2000 * attempt)
    }
  }

  throw lastErr || new Error(`Agent ${agentType} 调用失败`)
}

function buildShotImagePrompt(sb: StoryboardRow, frameType: 'first_frame' | 'last_frame') {
  const frameHint = frameType === 'first_frame' ? '首帧，动作起始瞬间' : '尾帧，动作结束瞬间'
  const parts = [
    sb.title,
    sb.imagePrompt || sb.description,
    sb.shotType,
    sb.angle,
    sb.location,
    sb.action,
    sb.atmosphere,
    frameHint,
    '高质量，电影感',
  ].filter(Boolean)
  return parts.join('，') || `镜头${sb.storyboardNumber} ${frameHint}`
}

async function collectShotReferenceImages(sb: StoryboardRow, chars: CharacterRow[], sceneImageUrl?: string | null) {
  const refs: string[] = []
  const push = (url?: string | null) => {
    const v = (url || '').trim()
    if (v && !refs.includes(v) && refs.length < 6) refs.push(v)
  }
  for (const charId of await getStoryboardCharacterIds(sb.id)) {
    const ch = chars.find(c => c.id === charId)
    push(ch?.imageUrl)
  }
  push(sceneImageUrl)
  push(sb.firstFrameImage)
  push(sb.lastFrameImage)
  return refs
}

function shotHasFrameImage(sb: StoryboardRow) {
  return !!(sb.composedImage || sb.firstFrameImage || sb.lastFrameImage)
}

function storyboardNeedsDubbing(sb: StoryboardRow) {
  const parsed = parseDialogueForTTS(sb.dialogue)
  return !parsed.ignorable && !!parsed.pureText && !(sb.ttsAudioUrl || '').trim()
}

async function generateEpisodeDubbing(
  episodeId: number,
  userId: number,
  userRole: string,
  shouldStop?: () => boolean,
) {
  const sbs = await getStoryboards(episodeId)
  const pending = sbs.filter(storyboardNeedsDubbing)
  if (!pending.length) return false

  for (const sb of pending) {
    checkStop(shouldStop)
    await assertUserCanGenerate(userId, userRole)
    await synthesizeStoryboardTTS({
      id: sb.id,
      episodeId: sb.episodeId,
      dialogue: sb.dialogue,
    }, { userId, role: userRole })
  }
  return true
}

async function resyncFrameSlideshowsAfterDubbing(
  episodeId: number,
  paths: ReturnType<typeof getSlideshowServicePaths>,
  shouldStop?: () => boolean,
) {
  const sbs = await getStoryboards(episodeId)
  for (const sb of sbs) {
    if (!storyboardHasSlideshowClip(sb.referenceImages)) continue
    checkStop(shouldStop)
    await alignStoryboardSlideshowToTargetDuration(sb.id, paths)
  }
}

function buildVideoParams(sb: StoryboardRow, dramaId: number, episodeMetadata?: string | null) {
  const first = sb.firstFrameImage || null
  const last = sb.lastFrameImage || null
  const videoGenOptions = readVideoGenOptionsFromMetadata(episodeMetadata)
  const params: Parameters<typeof generateVideo>[0] = {
    storyboardId: sb.id,
    dramaId,
    prompt: enhanceVideoPrompt(
      sb.videoPrompt || sb.description || sb.title || '',
      sb.dialogue,
      videoGenOptions,
    ),
    duration: Number(sb.duration || 10),
    aspectRatio: resolveVideoAspectRatio({ episodeMetadata }),
    generateAudio: videoGenOptions.generate_audio,
    generateSubtitles: videoGenOptions.generate_subtitles,
  }
  if (first && last) {
    params.referenceMode = 'first_last'
    params.firstFrameUrl = first
    params.lastFrameUrl = last
  } else if (first || last) {
    params.referenceMode = 'single'
    params.imageUrl = first || last || undefined
  }
  return params
}

function buildSlideshowSequenceFramePrompt(sb: StoryboardRow, frameIndex: number, totalFrames: number) {
  const progress = totalFrames <= 1
    ? '关键时刻'
    : `动作进度 ${frameIndex + 1}/${totalFrames}`
  const parts = [
    sb.title,
    sb.imagePrompt || sb.description,
    sb.shotType,
    sb.action,
    sb.atmosphere,
    progress,
    '电影感关键帧，无文字水印',
  ].filter(Boolean)
  return parts.join('，') || `镜头${sb.storyboardNumber} 关键帧 ${frameIndex + 1}`
}

export async function runDramaEpisodePipeline(args: {
  episodeId: number
  drama: DramaRow
  userId: number
  userRole: string
  overwrite?: boolean
  productionPipeline?: ProductionPipeline
  onProgress?: (phase: DramaPipelinePhase, status: DramaPipelineProgressStatus) => void
  shouldStop?: () => boolean
}): Promise<void> {
  const {
    episodeId,
    drama,
    userId,
    userRole,
    overwrite,
    productionPipeline: pipelineOverride,
    onProgress,
    shouldStop,
  } = args
  const dramaId = drama.id
  let ep = await loadEpisode(episodeId)

  const report = (phase: DramaPipelinePhase, status: DramaPipelineProgressStatus) => {
    onProgress?.(phase, status)
  }

  if (pipelineOverride) {
    await episodesRepo.updateEpisode(episodeId, {
      metadata: mergeEpisodeMetadata(ep.metadata, { production_pipeline: pipelineOverride }),
      updatedAt: now(),
    })
    ep = await loadEpisode(episodeId)
  }

  const productionPipeline = readProductionPipeline(ep.metadata)

  if (isDramaEpisodeMergedForPipeline(ep, productionPipeline) && !overwrite) {
    logTaskProgress('DramaPipeline', 'skip-merged', { episodeId })
    report('merge', 'skip')
    return
  }

  logTaskStart('DramaPipeline', 'episode', { episodeId, dramaId, episodeNumber: ep.episodeNumber })

  const configOpts = { userId, role: userRole }
  await assertUserServiceConfigReady(userId, userRole, 'text')

  checkStop(shouldStop)
  report('raw', 'start')
  await assertUserCanGenerate(userId, userRole)

  if (overwrite) {
    await episodesRepo.updateEpisode(episodeId, {
      content: null,
      formattedScript: null,
      videoUrl: null,
      metadata: mergeEpisodeMetadata(ep.metadata, {
        frame_merged_url: '',
        frame_merged_duration: 0,
      }),
      updatedAt: now(),
    })
    ep = await loadEpisode(episodeId)
  }

  let raw = overwrite ? '' : (ep.content || '').trim()
  if (!raw) {
    const prompt = buildDramaEpisodePrompt(drama, ep)
    raw = await generateEpisodeRawContent(
      { drama, episode: { ...ep, dramaId }, prompt },
      {
        userId,
        role: userRole,
        reason: '数字导演生成初稿',
        resourceType: 'episode',
        resourceId: episodeId,
      },
    )
    await episodesRepo.updateEpisode(episodeId, { content: raw, updatedAt: now() })
    ep = await loadEpisode(episodeId)
  }
  report('raw', 'done')

  checkStop(shouldStop)
  report('rewrite', 'start')
  await assertUserCanGenerate(userId, userRole)
  if (!ep.formattedScript?.trim() || overwrite) {
    await runAgent('drama_script_formatter', '请读取剧本并改写为格式化剧本，然后保存', episodeId, dramaId, configOpts)
    ep = await loadEpisode(episodeId)
    if (!ep.formattedScript?.trim()) throw new Error('剧本格式化未产出内容')
  }
  report('rewrite', 'done')

  checkStop(shouldStop)
  const storyboardsBefore = await getStoryboards(episodeId)
  if (!storyboardsBefore.length) {
    report('extract', 'start')
    await assertUserCanGenerate(userId, userRole)
    await runAgent('drama_cast_scene_extract', '请从剧本中提取所有角色和场景信息，提取时自动与项目已有数据进行去重合并', episodeId, dramaId, configOpts)
    report('extract', 'done')
  }

  checkStop(shouldStop)
  const chars = await getEpisodeCharacters(episodeId, dramaId)
  const needVoice = chars.some(c => !c.voiceId)
  if (needVoice && chars.length) {
    report('voice', 'start')
    await assertUserCanGenerate(userId, userRole)
    await assignDramaVoicesByHeuristic(episodeId, dramaId)
    report('voice', 'done')
  }

  checkStop(shouldStop)
  let sbs = await getStoryboards(episodeId)
  if (!sbs.length) {
    report('storyboards', 'start')
    await assertUserCanGenerate(userId, userRole)
    await assertEpisodeMediaConfigReady(userId, userRole, 'video', ep.dramaVideoConfigId)
    await runAgent(
      'drama_storyboard_breakdown',
      await buildDramaStoryboardBreakdownMessage(ep.dramaVideoConfigId, configOpts),
      episodeId,
      dramaId,
      configOpts,
    )
    sbs = await getStoryboards(episodeId)
    if (!sbs.length) throw new Error('分镜拆解未产出镜头')
    report('storyboards', 'done')
  }

  ep = await loadEpisode(episodeId)
  const freshChars = await getEpisodeCharacters(episodeId, dramaId)
  const scenes = await getEpisodeScenes(episodeId, dramaId)

  checkStop(shouldStop)
  const visualChars = freshChars.filter(c => !isNarratorCharacter(c))
  const pendingCharIds = visualChars.filter(c => !c.imageUrl).map(c => c.id)
  if (pendingCharIds.length) {
    report('char_images', 'start')
    await assertEpisodeMediaConfigReady(userId, userRole, 'image', ep.dramaImageConfigId)
    for (const charId of pendingCharIds) {
      checkStop(shouldStop)
      await assertUserCanGenerate(userId, userRole)
      const ch = freshChars.find(c => c.id === charId)!
      const prompt = `${ch.name}, ${ch.appearance || ch.description || '人物立绘'}, 高质量, 正面, 白色背景`
      const genId = await generateImage({
        userId,
        userRole,
        characterId: charId,
        dramaId,
        prompt,
        configId: ep.dramaImageConfigId ?? undefined,
        size: resolveImageAspectRatio({ episodeMetadata: ep.metadata, scope: 'character' }),
      })
      await waitForImageGeneration(genId, shouldStop)
    }
    report('char_images', 'done')
  }

  checkStop(shouldStop)
  const pendingScenes = scenes.filter(s => !s.imageUrl)
  if (pendingScenes.length) {
    report('scene_images', 'start')
    await assertEpisodeMediaConfigReady(userId, userRole, 'image', ep.dramaImageConfigId)
    const episodeCharIds = await getEpisodeCharacterIds(episodeId)
    const refChars = (await charactersRepo.listActiveCharactersByDrama(dramaId))
      .filter(ch => episodeCharIds.includes(ch.id) && !!ch.imageUrl)
      .map(ch => ch.imageUrl!)
      .slice(0, 1)
    for (const scene of pendingScenes) {
      checkStop(shouldStop)
      await assertUserCanGenerate(userId, userRole)
      const prompt = scene.prompt || `${scene.location}, ${scene.time || ''}, 高质量场景, 电影感`
      await scenesRepo.updateScene(scene.id, { status: 'processing', updatedAt: now() })
      const genId = await generateImage({
        userId,
        userRole,
        sceneId: scene.id,
        dramaId,
        prompt,
        configId: ep.dramaImageConfigId ?? undefined,
        referenceImages: refChars.length ? refChars : undefined,
        size: resolveImageAspectRatio({ episodeMetadata: ep.metadata, scope: 'scene' }),
      })
      await waitForImageGeneration(genId, shouldStop)
    }
    report('scene_images', 'done')
  }

  checkStop(shouldStop)
  sbs = await getStoryboards(episodeId)
  const charsAfter = await getEpisodeCharacters(episodeId, dramaId)
  const scenesAfter = await getEpisodeScenes(episodeId, dramaId)

  if (productionPipeline === 'frame_slideshow') {
    let needsSequenceFrames = false
    for (const sb of sbs) {
      const targetCount = resolveSlideshowFrameTargetCount(sb.duration)
      if (collectSlideshowKeyframePaths(sb).length < targetCount) {
        needsSequenceFrames = true
        break
      }
    }
    if (needsSequenceFrames) {
      report('shot_images', 'start')
      for (const sb of sbs) {
        checkStop(shouldStop)
        const targetCount = resolveSlideshowFrameTargetCount(sb.duration)
        let freshSb = (await getStoryboards(episodeId)).find(s => s.id === sb.id)!
        const seeded = seedSlideshowReferenceImages(freshSb.referenceImages, freshSb)
        if (seeded) {
          await storyboardsRepo.updateStoryboard(freshSb.id, { referenceImages: seeded, updatedAt: now() })
          freshSb = (await getStoryboards(episodeId)).find(s => s.id === sb.id)!
        }
        while (collectSlideshowKeyframePaths(freshSb).length < targetCount) {
          checkStop(shouldStop)
          await assertUserCanGenerate(userId, userRole)
          const frameIndex = collectSlideshowKeyframePaths(freshSb).length
          const scene = scenesAfter.find(s => s.id === freshSb.sceneId)
          const refs = await collectShotReferenceImages(freshSb, charsAfter, scene?.imageUrl)
          const genId = await generateImage({
            userId,
            userRole,
            storyboardId: freshSb.id,
            dramaId,
            prompt: buildSlideshowSequenceFramePrompt(freshSb, frameIndex, targetCount),
            frameType: 'reference',
            configId: ep.dramaImageConfigId ?? undefined,
            referenceImages: refs.length ? refs : undefined,
            size: resolveImageAspectRatio({ episodeMetadata: ep.metadata, scope: 'shot' }),
          })
          await waitForImageGeneration(genId, shouldStop)
          freshSb = (await getStoryboards(episodeId)).find(s => s.id === sb.id)!
        }
      }
      report('shot_images', 'done')
    }
  } else {
    const pendingFrames: Array<{ sb: StoryboardRow; frameType: 'first_frame' | 'last_frame' }> = []
    for (const sb of sbs) {
      if (!sb.firstFrameImage && !sb.composedImage) pendingFrames.push({ sb, frameType: 'first_frame' })
      if (!sb.lastFrameImage && !sb.composedImage) pendingFrames.push({ sb, frameType: 'last_frame' })
    }
    if (pendingFrames.length) {
      report('shot_images', 'start')
      for (const { sb, frameType } of pendingFrames) {
        checkStop(shouldStop)
        await assertUserCanGenerate(userId, userRole)
        const scene = scenesAfter.find(s => s.id === sb.sceneId)
        const refs = await collectShotReferenceImages(sb, charsAfter, scene?.imageUrl)
        const genId = await generateImage({
          userId,
          userRole,
          storyboardId: sb.id,
          dramaId,
          prompt: buildShotImagePrompt(sb, frameType),
          frameType,
          configId: ep.dramaImageConfigId ?? undefined,
          referenceImages: refs.length ? refs : undefined,
          size: resolveImageAspectRatio({ episodeMetadata: ep.metadata, scope: 'shot' }),
        })
        await waitForImageGeneration(genId, shouldStop)
      }
      report('shot_images', 'done')
    }
  }

  checkStop(shouldStop)
  report('dubbing', 'start')
  await assertEpisodeMediaConfigReady(userId, userRole, 'audio', ep.dramaAudioConfigId)
  const dubbingGenerated = await generateEpisodeDubbing(episodeId, userId, userRole, shouldStop)
  report('dubbing', dubbingGenerated ? 'done' : 'skip')

  if (productionPipeline === 'frame_slideshow') {
    const slideshowPaths = getSlideshowServicePaths()
    await resyncFrameSlideshowsAfterDubbing(episodeId, slideshowPaths, shouldStop)
  }

  checkStop(shouldStop)
  ep = await loadEpisode(episodeId)
  sbs = await getStoryboards(episodeId)

  if (productionPipeline === 'frame_slideshow') {
    const pendingSlideshow = sbs.filter(sb => !storyboardHasSlideshowClip(sb.referenceImages))
    if (pendingSlideshow.length) {
      report('slideshow', 'start')
      const slideshowPaths = getSlideshowServicePaths()
      for (const sb of pendingSlideshow) {
        checkStop(shouldStop)
        await assertUserCanGenerate(userId, userRole)
        const freshSb = (await getStoryboards(episodeId)).find(s => s.id === sb.id)!
        if (!shotHasFrameImage(freshSb)) {
          throw new Error(`镜头 ${freshSb.storyboardNumber} 缺少关键帧，无法生成静帧视频`)
        }
        await generateStoryboardSlideshow(freshSb.id, slideshowPaths)
      }
      report('slideshow', 'done')
    }
  } else {
    const pendingVideos = sbs.filter(sb => !sb.videoUrl)
    if (pendingVideos.length) {
      report('videos', 'start')
      await assertEpisodeMediaConfigReady(userId, userRole, 'video', ep.dramaVideoConfigId)
      for (const sb of pendingVideos) {
        checkStop(shouldStop)
        await assertUserCanGenerate(userId, userRole)
        const freshSb = (await getStoryboards(episodeId)).find(s => s.id === sb.id)!
        if (!shotHasFrameImage(freshSb)) {
          throw new Error(`镜头 ${freshSb.storyboardNumber} 缺少参考图，无法生成视频`)
        }
        const params = buildVideoParams(freshSb, dramaId, ep.metadata)
        params.userId = userId
        params.userRole = userRole
        params.configId = ep.dramaVideoConfigId ?? undefined
        const genId = await generateVideo(params)
        await waitForVideoGeneration(genId, shouldStop)
      }
      report('videos', 'done')
    }
  }

  checkStop(shouldStop)
  sbs = await getStoryboards(episodeId)
  const pendingCompose = sbs.filter(sb =>
    storyboardHasMotionVideo(sb, productionPipeline) && !storyboardHasComposedVideo(sb, productionPipeline),
  )
  if (pendingCompose.length) {
    report('compose', 'start')
    for (const sb of pendingCompose) {
      checkStop(shouldStop)
      await assertUserCanGenerate(userId, userRole)
      await composeStoryboard(sb.id, productionPipeline)
    }
    report('compose', 'done')
  }

  checkStop(shouldStop)
  ep = await loadEpisode(episodeId)
  if (isDramaEpisodeMergedForPipeline(ep, productionPipeline)) {
    report('merge', 'skip')
  } else {
    report('merge', 'start')
    await assertUserCanGenerate(userId, userRole)
    await mergeEpisodeVideosAndWait(episodeId, dramaId, productionPipeline)
    report('merge', 'done')
  }

  logTaskSuccess('DramaPipeline', 'episode', { episodeId, episodeNumber: ep.episodeNumber })
}
