import fs from 'fs'
import path from 'path'

const DEFAULT_LOOP_SEC = 24

function writeWavHeader(buffer: Buffer, dataSize: number, sampleRate: number, channels: number, bitsPerSample: number): void {
  const blockAlign = channels * (bitsPerSample / 8)
  const byteRate = sampleRate * blockAlign
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
}

/** Soft ambient pad loop (no lavfi / no external asset required). */
function writeAmbientLoopWav(outputPath: string, durationSec: number): void {
  const sampleRate = 48000
  const channels = 2
  const bitsPerSample = 16
  const numSamples = Math.max(1, Math.ceil(durationSec * sampleRate))
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = numSamples * blockAlign
  const buffer = Buffer.alloc(44 + dataSize)

  writeWavHeader(buffer, dataSize, sampleRate, channels, bitsPerSample)

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const fadeIn = Math.min(1, t / 1.5)
    const fadeOut = Math.min(1, (durationSec - t) / 1.5)
    const envelope = fadeIn * fadeOut
    const mono = envelope * 0.09 * (
      Math.sin(2 * Math.PI * 82.41 * t) * 0.34
      + Math.sin(2 * Math.PI * 123.47 * t) * 0.26
      + Math.sin(2 * Math.PI * 164.81 * t) * 0.2
      + Math.sin(2 * Math.PI * 220 * t) * 0.14
      + Math.sin(2 * Math.PI * 329.63 * t) * 0.06
    )
    const sample = Math.max(-32768, Math.min(32767, Math.round(mono * 32767)))
    const offset = 44 + i * blockAlign
    buffer.writeInt16LE(sample, offset)
    buffer.writeInt16LE(sample, offset + 2)
  }

  fs.writeFileSync(outputPath, buffer)
}

/** Resolve BGM loop for frame slideshow (custom path or generated default under static/bgm). */
export function ensureFrameSlideshowBgmLoop(staticRoot: string): string {
  const envPath = process.env.FRAME_SLIDESHOW_BGM_PATH?.trim()
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath)

  const bgmDir = path.join(staticRoot, 'bgm')
  const bgmPath = path.join(bgmDir, 'default-ambient-loop.wav')
  if (fs.existsSync(bgmPath)) return bgmPath

  fs.mkdirSync(bgmDir, { recursive: true })
  writeAmbientLoopWav(bgmPath, DEFAULT_LOOP_SEC)
  return bgmPath
}

export function readFrameSlideshowBgmVolume(): number {
  const raw = process.env.FRAME_SLIDESHOW_BGM_VOLUME?.trim()
  if (!raw) return 0.32
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0.32
  return Math.min(parsed, 1)
}
