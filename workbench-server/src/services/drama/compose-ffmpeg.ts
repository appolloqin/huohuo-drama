import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { configureFfmpegPaths, getFfmpegExecutable } from '../../common/media/ffmpeg-path.js'
import { readFrameSlideshowBgmVolume } from '../../common/media/frame-slideshow-bgm.js'

configureFfmpegPaths()

const AUDIO_ENCODE = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'] as const
const VIDEO_ENCODE = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'] as const

let subtitleFilterAvailable: boolean | null = null

export function ffmpegSupportsSubtitles(): boolean {
  if (subtitleFilterAvailable != null) return subtitleFilterAvailable
  try {
    const output = execFileSync(getFfmpegExecutable(), ['-hide_banner', '-filters'], { encoding: 'utf8' })
    subtitleFilterAvailable = /\bsubtitles\b/.test(output)
  } catch {
    subtitleFilterAvailable = false
  }
  return subtitleFilterAvailable
}

export function probeHasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(false)
        return
      }
      resolve((metadata.streams || []).some(stream => stream.codec_type === 'audio'))
    })
  })
}

export function probeMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        resolve(0)
        return
      }
      resolve(metadata.format.duration || 0)
    })
  })
}

/** PCM stereo silence for muxing when lavfi/anullsrc is unavailable. */
function writeSilentWav(outputPath: string, durationSec: number): void {
  const sampleRate = 48000
  const channels = 2
  const bitsPerSample = 16
  const numSamples = Math.max(1, Math.ceil(durationSec * sampleRate))
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  fs.writeFileSync(outputPath, buffer)
}

/** Loop background music to match a video-only clip (no lavfi). */
export async function muxVideoWithBackgroundMusic(input: {
  videoPath: string
  bgmPath: string
  outputPath: string
  volume?: number
}): Promise<void> {
  const volume = input.volume ?? readFrameSlideshowBgmVolume()
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.videoPath)
      .input(input.bgmPath)
      .inputOptions(['-stream_loop', '-1'])
      .outputOptions([
        '-map', '0:v',
        '-map', '1:a',
        '-filter:a', `volume=${volume}`,
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        '-shortest',
        '-movflags', '+faststart',
      ])
      .output(input.outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

/** Mux silent stereo AAC onto a video-only clip (no lavfi; works on minimal FFmpeg builds). */
async function muxVideoWithSilentAudio(inputPath: string, outputPath: string): Promise<void> {
  const durationSec = Math.max(0.1, await probeMediaDuration(inputPath))
  const silentWavPath = `${outputPath}.silent.wav`
  writeSilentWav(silentWavPath, durationSec)

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .input(silentWavPath)
        .outputOptions([
          '-map', '0:v',
          '-map', '1:a',
          ...VIDEO_ENCODE,
          ...AUDIO_ENCODE,
          '-shortest',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })
  } finally {
    try {
      if (fs.existsSync(silentWavPath)) fs.unlinkSync(silentWavPath)
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Escape absolute paths for ffmpeg concat demuxer list files (Windows-safe). */
export function formatConcatListLine(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")
  return `file '${normalized}'`
}

/** Re-encode clip to h264 + stereo AAC so concat demuxer keeps a consistent audio track. */
export async function normalizeClipForConcat(
  inputPath: string,
  outputPath: string,
  options?: { backgroundMusicPath?: string | null },
): Promise<void> {
  const hasAudio = await probeHasAudioStream(inputPath)
  if (!hasAudio) {
    if (options?.backgroundMusicPath) {
      await muxVideoWithBackgroundMusic({
        videoPath: inputPath,
        bgmPath: options.backgroundMusicPath,
        outputPath,
      })
      return
    }
    await muxVideoWithSilentAudio(inputPath, outputPath)
    return
  }

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(['-map', '0:v', '-map', '0:a', ...VIDEO_ENCODE, ...AUDIO_ENCODE, '-movflags', '+faststart'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

/** Ken Burns 运镜预设：推镜 + 平移（按序列帧序号轮换） */
const KEN_BURNS_MOTION_PRESETS = [
  {
    z: 'min(zoom+0.0012,1.12)',
    x: '(iw-iw/zoom)*on/FRAMES',
    y: 'ih/2-(ih/zoom/2)',
  },
  {
    z: 'min(zoom+0.0012,1.12)',
    x: '(iw-iw/zoom)*(1-on/FRAMES)',
    y: 'ih/2-(ih/zoom/2)',
  },
  {
    z: 'min(zoom+0.0012,1.12)',
    x: 'iw/2-(iw/zoom/2)',
    y: '(ih-ih/zoom)*on/FRAMES',
  },
  {
    z: 'min(zoom+0.0012,1.12)',
    x: 'iw/2-(iw/zoom/2)',
    y: '(ih-ih/zoom)*(1-on/FRAMES)',
  },
  {
    z: 'min(zoom+0.0012,1.12)',
    x: '(iw-iw/zoom)*on/FRAMES',
    y: '(ih-ih/zoom)*on/FRAMES',
  },
  {
    z: 'min(zoom+0.0012,1.12)',
    x: '(iw-iw/zoom)*(1-on/FRAMES)',
    y: '(ih-ih/zoom)*(1-on/FRAMES)',
  },
] as const

export function buildKenBurnsVideoFilter(input: {
  width: number
  height: number
  fps: number
  frames: number
  motionIndex?: number
}): string {
  const width = input.width
  const height = input.height
  const fps = input.fps
  const frames = Math.max(1, input.frames)
  const panDenominator = Math.max(1, frames - 1)
  const preset = KEN_BURNS_MOTION_PRESETS[
    Math.abs(Math.trunc(input.motionIndex ?? 0)) % KEN_BURNS_MOTION_PRESETS.length
  ]
  const z = preset.z
  const x = preset.x.replace(/FRAMES/g, String(panDenominator))
  const y = preset.y.replace(/FRAMES/g, String(panDenominator))
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    'setsar=1',
    `fps=${fps}`,
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=${fps}`,
  ].join(',')
}

export async function renderKenBurnsSegment(input: {
  imagePath: string
  durationSec: number
  outputPath: string
  width?: number
  height?: number
  motionIndex?: number
}): Promise<void> {
  const width = input.width || 1920
  const height = input.height || 1080
  const fps = 25
  const frames = Math.max(1, Math.round(input.durationSec * fps))
  const durationSec = (frames / fps).toFixed(3)
  const videoFilter = buildKenBurnsVideoFilter({
    width,
    height,
    fps,
    frames,
    motionIndex: input.motionIndex,
  })

  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.imagePath)
      .inputOptions(['-loop', '1'])
      .videoFilters([videoFilter])
      .outputOptions([...VIDEO_ENCODE, '-an', '-t', durationSec, '-movflags', '+faststart'])
      .output(input.outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

export async function renderSlideshowFromImages(input: {
  imagePaths: string[]
  durationSec: number
  outputPath: string
  tempDir: string
}): Promise<void> {
  if (!input.imagePaths.length) throw new Error('No images for slideshow')

  const segmentPaths: string[] = []
  const perImageSec = Math.max(1, input.durationSec / input.imagePaths.length)

  try {
    for (let i = 0; i < input.imagePaths.length; i++) {
      const segmentPath = path.join(input.tempDir, `seg-${i}.mp4`)
      await renderKenBurnsSegment({
        imagePath: input.imagePaths[i],
        durationSec: perImageSec,
        outputPath: segmentPath,
        motionIndex: i,
      })
      segmentPaths.push(segmentPath)
    }

    if (segmentPaths.length === 1) {
      fs.copyFileSync(segmentPaths[0], input.outputPath)
      return
    }

    const listPath = path.join(input.tempDir, 'concat.txt')
    fs.writeFileSync(listPath, segmentPaths.map(formatConcatListLine).join('\n'), 'utf-8')

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
        .output(input.outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })
  } finally {
    for (const filePath of segmentPaths) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      } catch {
        // ignore cleanup errors
      }
    }
    try {
      const listPath = path.join(input.tempDir, 'concat.txt')
      if (fs.existsSync(listPath)) fs.unlinkSync(listPath)
      if (fs.existsSync(input.tempDir)) fs.rmSync(input.tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function renderComposedClip(input: {
  videoPath: string
  audioPath?: string | null
  subtitlePath?: string | null
  keepSourceAudio?: boolean
  backgroundMusicPath?: string | null
  outputPath: string
}) {
  const hasSourceAudio = input.keepSourceAudio ? await probeHasAudioStream(input.videoPath) : false

  if (!input.audioPath && input.keepSourceAudio && !hasSourceAudio) {
    const bgmPath = input.backgroundMusicPath
    if (bgmPath && fs.existsSync(bgmPath)) {
      let videoPath = input.videoPath
      if (input.subtitlePath && ffmpegSupportsSubtitles()) {
        const subtitledPath = `${input.outputPath}.subbed.mp4`
        await new Promise<void>((resolve, reject) => {
          const escaped = input.subtitlePath!
            .replace(/\\/g, '/')
            .replace(/:/g, '\\:')
            .replace(/'/g, "\\'")
          const style = 'FontSize=20\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2'
          ffmpeg(videoPath)
            .videoFilters([`subtitles=filename='${escaped}':force_style='${style}'`])
            .outputOptions([...VIDEO_ENCODE, '-an', '-movflags', '+faststart'])
            .output(subtitledPath)
            .on('end', () => resolve())
            .on('error', reject)
            .run()
        })
        videoPath = subtitledPath
      }
      await muxVideoWithBackgroundMusic({
        videoPath,
        bgmPath,
        outputPath: input.outputPath,
      })
      if (videoPath !== input.videoPath) {
        try {
          if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath)
        } catch {
          // ignore cleanup errors
        }
      }
      return
    }

    await new Promise<void>((resolve, reject) => {
      let command = ffmpeg(input.videoPath)
      const filters: string[] = []
      if (input.subtitlePath && ffmpegSupportsSubtitles()) {
        const escaped = input.subtitlePath
          .replace(/\\/g, '/')
          .replace(/:/g, '\\:')
          .replace(/'/g, "\\'")
        const style = 'FontSize=20\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2'
        filters.push(`subtitles=filename='${escaped}':force_style='${style}'`)
      }
      if (filters.length) command = command.videoFilter(filters)

      command
        .outputOptions(['-map', '0:v', ...VIDEO_ENCODE, '-an', '-movflags', '+faststart'])
        .output(input.outputPath)
        .on('end', () => resolve())
        .on('error', reject)
        .run()
    })
    return
  }

  await new Promise<void>((resolve, reject) => {
    let command = ffmpeg(input.videoPath)
    if (input.audioPath) {
      command = command.input(input.audioPath)
    }

    const filters: string[] = []
    if (input.subtitlePath && ffmpegSupportsSubtitles()) {
      const escaped = input.subtitlePath
        .replace(/\\/g, '/')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
      const style = 'FontSize=20\\,PrimaryColour=&HFFFFFF&\\,OutlineColour=&H000000&\\,Outline=2'
      filters.push(`subtitles=filename='${escaped}':force_style='${style}'`)
    }

    if (filters.length) command = command.videoFilter(filters)

    const outputOptions: string[] = []
    if (input.audioPath) {
      outputOptions.push('-map', '0:v', '-map', '1:a', ...VIDEO_ENCODE, ...AUDIO_ENCODE, '-shortest')
    } else if (input.keepSourceAudio && hasSourceAudio) {
      outputOptions.push('-map', '0:v', '-map', '0:a', ...VIDEO_ENCODE, ...AUDIO_ENCODE)
    } else {
      outputOptions.push('-map', '0:v', ...VIDEO_ENCODE, '-an')
    }

    command
      .outputOptions(outputOptions)
      .output(input.outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}
