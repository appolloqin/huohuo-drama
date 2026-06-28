import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import * as charactersRepo from '../../db/repos/characters/index.js'
import * as episodesRepo from '../../db/repos/episodes/index.js'
import * as storyboardsRepo from '../../db/repos/storyboards/index.js'
import { readProductionPipeline, type ProductionPipeline } from '../../common/drama/episode-meta.js'
import { mergeFrameComposedVideoUrl } from '../../common/drama/storyboard-frame-meta.js'
import { ensureFrameSlideshowBgmLoop } from '../../common/media/frame-slideshow-bgm.js'
import { now } from '../../common/http/response.js'
import { generateTTS } from '../media/tts-generation.js'
import { buildSubtitleDocument, parseDialogueForTTS } from './compose-dialogue.js'
import { renderComposedClip, probeMediaDuration } from './compose-ffmpeg.js'
import { resolveStoryboardMotionVideoUrl, ensureStoryboardSlideshowDuration } from './storyboard-slideshow-service.js'
import { logTaskProgress, logTaskStart, logTaskSuccess } from '../../common/task/task-logger.js'

interface ComposePaths {
  staticRoot: string
  dataRoot: string
}

function resolvePath(relativePath: string, paths: ComposePaths): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(paths.dataRoot, relativePath)
  return path.join(paths.staticRoot, relativePath)
}

async function resolveVoiceForSpeaker(episodeId: number, speaker: string): Promise<{ voiceId: string; dramaAudioConfigId?: number }> {
  const episode = await episodesRepo.findEpisodeById(episodeId)
  if (!episode || !speaker) {
    return { voiceId: 'alloy', dramaAudioConfigId: episode?.dramaAudioConfigId ?? undefined }
  }

  const character = await charactersRepo.findActiveCharacterByName(episode.dramaId, speaker)

  return {
    voiceId: character?.voiceId || 'alloy',
    dramaAudioConfigId: episode.dramaAudioConfigId ?? undefined,
  }
}

async function ensureTtsAudio(storyboard: Awaited<ReturnType<typeof storyboardsRepo.findStoryboardById>>, paths: ComposePaths) {
  if (!storyboard) {
    return { audioPath: null as string | null, subtitlePath: null as string | null, audioDurationSec: null as number | null }
  }

  const parsed = parseDialogueForTTS(storyboard.dialogue)
  if (parsed.ignorable || !parsed.pureText) {
    return { audioPath: null as string | null, subtitlePath: null as string | null, audioDurationSec: null as number | null }
  }

  let audioPath: string | null = null
  if (storyboard.ttsAudioUrl) {
    const existing = resolvePath(storyboard.ttsAudioUrl, paths)
    if (fs.existsSync(existing)) audioPath = existing
  }

  if (!audioPath) {
    const voice = await resolveVoiceForSpeaker(storyboard.episodeId, parsed.speaker)
    logTaskProgress('ComposeTask', 'generate-inline-tts', {
      storyboardId: storyboard.id,
      voiceId: voice.voiceId,
      textPreview: parsed.pureText.slice(0, 40),
    })
    const storedPath = await generateTTS({
      text: parsed.pureText,
      voice: voice.voiceId,
      configId: voice.dramaAudioConfigId,
    })
    audioPath = resolvePath(storedPath, paths)
    await storyboardsRepo.updateStoryboard(storyboard.id, { ttsAudioUrl: storedPath, updatedAt: now() })
  }

  const audioDurationSec = Math.max(0.1, await probeMediaDuration(audioPath))

  const subtitleDir = path.join(paths.staticRoot, 'subtitles')
  fs.mkdirSync(subtitleDir, { recursive: true })
  const subtitleFilename = `${randomUUID()}.srt`
  const subtitlePath = path.join(subtitleDir, subtitleFilename)
  fs.writeFileSync(
    subtitlePath,
    buildSubtitleDocument(parsed.pureText, audioDurationSec),
    'utf-8',
  )

  const subtitleRelative = `static/subtitles/${subtitleFilename}`
  await storyboardsRepo.updateStoryboard(storyboard.id, { subtitleUrl: subtitleRelative, updatedAt: now() })

  return { audioPath, subtitlePath, audioDurationSec }
}

export async function composeStoryboard(
  storyboardId: number,
  paths: ComposePaths,
  motionPipeline?: ProductionPipeline,
): Promise<string> {
  const storyboard = await storyboardsRepo.findStoryboardById(storyboardId)
  if (!storyboard) throw new Error(`Storyboard ${storyboardId} not found`)

  const episode = await episodesRepo.findEpisodeById(storyboard.episodeId)
  const pipeline = motionPipeline || readProductionPipeline(episode?.metadata)
  const motionVideoUrl = resolveStoryboardMotionVideoUrl(storyboard, pipeline)
  if (!motionVideoUrl) {
    throw new Error(
      pipeline === 'frame_slideshow'
        ? `Storyboard ${storyboardId} has no slideshow clip`
        : `Storyboard ${storyboardId} has no video`,
    )
  }

  await storyboardsRepo.updateStoryboard(storyboardId, {
    status: 'compose_processing',
    ...(pipeline === 'frame_slideshow'
      ? {}
      : { composedVideoUrl: null }),
    updatedAt: now(),
  })

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: storyboard.storyboardNumber,
    episodeId: storyboard.episodeId,
  })

  try {
    const { audioPath, subtitlePath, audioDurationSec } = await ensureTtsAudio(storyboard, paths)
    let resolvedMotionVideoUrl = motionVideoUrl
    if (pipeline === 'frame_slideshow' && audioDurationSec) {
      resolvedMotionVideoUrl = await ensureStoryboardSlideshowDuration(storyboardId, audioDurationSec, paths)
    }
    const outputDir = path.join(paths.staticRoot, 'composed')
    fs.mkdirSync(outputDir, { recursive: true })
    const outputFilename = `${randomUUID()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    const backgroundMusicPath = pipeline === 'frame_slideshow' && !audioPath
      ? ensureFrameSlideshowBgmLoop(paths.staticRoot)
      : null

    await renderComposedClip({
      videoPath: resolvePath(resolvedMotionVideoUrl, paths),
      audioPath,
      subtitlePath,
      keepSourceAudio: !audioPath,
      backgroundMusicPath,
      outputPath,
    })

    const composedRelative = `static/composed/${outputFilename}`
    const durationUpdate = pipeline === 'frame_slideshow' && audioDurationSec
      ? { duration: Math.max(3, Math.round(audioDurationSec)) }
      : {}
    if (pipeline === 'frame_slideshow') {
      await storyboardsRepo.updateStoryboard(storyboardId, {
        referenceImages: mergeFrameComposedVideoUrl(storyboard.referenceImages, composedRelative),
        status: 'compose_completed',
        ...durationUpdate,
        updatedAt: now(),
      })
    } else {
      await storyboardsRepo.updateStoryboard(storyboardId, {
        composedVideoUrl: composedRelative,
        status: 'compose_completed',
        updatedAt: now(),
      })
    }

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: storyboard.storyboardNumber,
      output: composedRelative,
    })
    return composedRelative
  } catch (err) {
    await storyboardsRepo.updateStoryboard(storyboardId, {
      status: 'compose_failed',
      ...(pipeline === 'frame_slideshow'
        ? {}
        : { composedVideoUrl: null }),
      updatedAt: now(),
    })
    throw err
  }
}
