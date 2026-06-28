import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'

let configured = false
let ffmpegExecutable = 'ffmpeg'
let ffprobeExecutable = 'ffprobe'

function resolveExecutablePath(raw: string | undefined, binaryName: string): string {
  if (!raw?.trim()) return binaryName

  const trimmed = raw.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return binaryName

  if (path.extname(trimmed)) return trimmed

  let stat: fs.Stats | null = null
  try {
    stat = fs.statSync(trimmed)
  } catch {
    stat = null
  }

  if (stat?.isDirectory()) {
    const exe = process.platform === 'win32' ? `${binaryName}.exe` : binaryName
    const candidate = path.join(trimmed, exe)
    if (fs.existsSync(candidate)) return candidate
  }

  if (stat?.isFile()) return trimmed

  if (process.platform === 'win32') {
    const withExe = `${trimmed}.exe`
    if (fs.existsSync(withExe)) return withExe
  }

  return trimmed
}

export function configureFfmpegPaths(): void {
  if (configured) return
  configured = true

  ffmpegExecutable = resolveExecutablePath(process.env.FFMPEG_PATH, 'ffmpeg')
  ffprobeExecutable = resolveExecutablePath(process.env.FFPROBE_PATH, 'ffprobe')

  ffmpeg.setFfmpegPath(ffmpegExecutable)
  ffmpeg.setFfprobePath(ffprobeExecutable)
}

export function getFfmpegExecutable(): string {
  configureFfmpegPaths()
  return ffmpegExecutable
}

export function getFfprobeExecutable(): string {
  configureFfmpegPaths()
  return ffprobeExecutable
}

export function formatFfmpegError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/ENOENT/i.test(message) && /ffmpeg|ffprobe/i.test(message)) {
    const configuredPath = process.env.FFMPEG_PATH || getFfmpegExecutable()
    return `找不到 ffmpeg（路径：${configuredPath}）。请安装 ffmpeg，并将 FFMPEG_PATH 设为 ffmpeg.exe 的完整路径，或把 ffmpeg 加入系统 PATH。`
  }
  return message
}
